/**
 * Self-play games at mixed strengths and puzzle detection on the fly (one game = one seeded unit of work).
 *
 * Game `index` of seed `s` draws everything from `createRng(hashSeed(s, 'game', index))`: the two player profiles,
 * the opening line (random walk through the opening book) and every move choice. A player picks its move from the
 * screening search (depth `screenDepth`, MultiPV `screenMultiPv`): with probability `randomRate` a random legal move
 * (captures and checks weighted double – beginners grab material and give checks), otherwise a softmax over the
 * engine lines with temperature `temperatureCp` (centipawns from the mover's view). Weak profiles therefore hang
 * pieces and allow mates (easy puzzles); strong profiles make subtler mistakes (harder puzzles).
 *
 * After every move the position is screened: when the move was a mistake (`isOpponentMistake`) and the side to move
 * now has a candidate (`judgePosition` with the looser screening thresholds), `buildSolution` confirms it at full
 * depth and extends the line. At the end of the game the confirmed puzzles get their phase (Lichess divider on the
 * whole game), themes (`tagPuzzle`) and opening tags, and pass a second, independent engine check that is identical
 * to the content validator (`checkPuzzleWithEngine`, depth 18, MultiPV 2) – puzzles failing it are dropped.
 *
 * Determinism: the screening engine is cleared at the start of every game, the confirmation engine before every
 * search and the check engine before every puzzle, so a game's result depends only on (seed, index, config).
 */
import { START_FEN, type Color, type Fen, type Uci } from '@/core/chess';
import type { EngineLine } from '@/core/engine';
import { divideGame, gamePhase, type OpeningBook } from '@/analysis';
import { ChessGame, positionKey } from '@/lib/chess';
import { checkPuzzleWithEngine, PUZZLE_ENGINE_DEPTH } from '../lib/puzzleChecks';
import { isOpponentMistake, judgePosition, SCREEN_PLY } from './detect';
import type { GeneratorEngine } from './engine';
import { randomBookLine } from './openings';
import { createRng, hashSeed, weightedIndex, type Rng } from './rng';
import { buildSolution, DEFAULT_SOLUTION_CONFIG, isFailure, type SolutionConfig } from './solution';
import { openingTagsFromName, tagPuzzle, type Phase } from './tagger';

/** How a simulated player chooses its moves. */
export interface PlayerProfile {
  id: 'novice' | 'beginner' | 'club' | 'strong';
  /** Probability of a random legal move. */
  randomRate: number;
  /**
   * Added to `randomRate` while the player is ≥ `CARELESS_CP` ahead: weak players get careless when winning and give
   * material back, which keeps their games balanced longer (more positions where a blunder is a puzzle).
   */
  carelessBoost: number;
  /** Softmax temperature over the engine lines (centipawns). */
  temperatureCp: number;
  /** Relative frequency of the profile. */
  weight: number;
}

/** Player profiles (weights: how often a side gets the profile). */
export const PROFILES: readonly PlayerProfile[] = [
  { id: 'novice', randomRate: 0.25, carelessBoost: 0.35, temperatureCp: 160, weight: 3 },
  { id: 'beginner', randomRate: 0.12, carelessBoost: 0.25, temperatureCp: 110, weight: 3 },
  { id: 'club', randomRate: 0.04, carelessBoost: 0.06, temperatureCp: 60, weight: 2.5 },
  { id: 'strong', randomRate: 0, carelessBoost: 0, temperatureCp: 25, weight: 1.5 },
];

/** Mover-POV advantage (centipawns) from which `carelessBoost` applies. */
export const CARELESS_CP = 300;

/** A game is stopped once the eval stayed beyond ±`MERCY_CP` (no mate in sight) for `MERCY_PLIES` plies. */
export const MERCY_CP = 1200;
export const MERCY_PLIES = 12;

/** Settings of a generator run (production values in `DEFAULT_GENERATOR_CONFIG`). */
export interface GeneratorConfig {
  /** Depth of the screening search after every move. */
  screenDepth: number;
  /** MultiPV of the screening search (move choice + candidate test). */
  screenMultiPv: number;
  /** Games end after this many plies. */
  maxPlies: number;
  /** Length range of the opening line (plies). */
  openingPlies: readonly [number, number];
  /** Confirmation and extension (depth ≥ 18 in production). */
  solution: SolutionConfig;
  /** Depth of the final validator-equivalent check (`null` skips it – tests only). */
  checkDepth: number | null;
  /** Opening tags are set for puzzles that start within this many plies. */
  openingTagMaxPly: number;
}

/** Production settings. */
export const DEFAULT_GENERATOR_CONFIG: GeneratorConfig = {
  screenDepth: 10,
  screenMultiPv: 3,
  maxPlies: 160,
  openingPlies: [2, 14],
  solution: DEFAULT_SOLUTION_CONFIG,
  checkDepth: PUZZLE_ENGINE_DEPTH,
  openingTagMaxPly: 40,
};

/** A confirmed, tagged puzzle of a game (rating and explanation are added by the assembler). */
export interface RawPuzzle {
  /** Position before the opponent's mistake `moves[0]`. */
  fen: Fen;
  moves: Uci[];
  mateIn: number | null;
  /** Depth from which Stockfish kept the first solver move. */
  findDepth: number;
  /** Solver-POV centipawns after the solution (`null` for mates). */
  finalCp: number | null;
  /** Solver-POV centipawns (or mate) of the best line at the first solver ply. */
  firstScore: EngineLine['score'];
  phase: Phase;
  themes: string[];
  openingTags: string[];
  /** Game index and ply of the opponent's mistake (1-based). */
  game: number;
  ply: number;
  /** Profiles of the side that made the mistake and of the solver. */
  profiles: { opponent: PlayerProfile['id']; solver: PlayerProfile['id'] };
}

/** Counters of one game. */
export interface GameStats {
  plies: number;
  /** Opponent moves that were mistakes (`isOpponentMistake`). */
  mistakes: number;
  /** Screening verdicts of those positions that were not candidates. */
  screenedOut: Record<string, number>;
  candidates: number;
  confirmed: number;
  /** Rejections by reason (`buildSolution` reasons, `final_check`, `duplicate`). */
  rejected: Record<string, number>;
}

/** Result of one game. */
export interface GameResult {
  index: number;
  puzzles: RawPuzzle[];
  stats: GameStats;
}

/** Engines of a game worker. */
export interface GameEngines {
  /** Screening engine, cleared at the start of every game (`perPuzzle` mode, `reset()` per game). */
  screen: GeneratorEngine;
  /** Confirmation engine, cleared before every search (`perSearch`). */
  confirm: GeneratorEngine;
  /** Final check engine, cleared before every puzzle (`perPuzzle`). */
  check: GeneratorEngine;
}

/** Profile chosen with probability proportional to its weight. */
export function pickProfile(rng: Rng): PlayerProfile {
  return PROFILES[weightedIndex(rng, PROFILES.map((p) => p.weight))]!;
}

/** Mover-POV value of a line for the softmax (mates mapped to ±(2000 − distance)). */
export function moverValue(line: EngineLine, mover: Color): number {
  const sign = mover === 'w' ? 1 : -1;
  if (line.score.type === 'mate') {
    const v = line.score.value * sign;
    return v > 0 ? 2000 - v : -2000 - v;
  }
  return Math.max(-2000, Math.min(2000, line.score.value * sign));
}

/** A player's move (see the file header). Legal moves are sorted by UCI so the choice depends only on the RNG. */
export function chooseMove(rng: Rng, profile: PlayerProfile, lines: readonly EngineLine[], game: ChessGame): Uci {
  const legal = game.legalMoves().sort((a, b) => a.uci.localeCompare(b.uci));
  const mover = game.turn();
  const ahead = lines[0] !== undefined && moverValue(lines[0], mover) >= CARELESS_CP;
  const r = rng();
  if (r < profile.randomRate + (ahead ? profile.carelessBoost : 0) || lines.length === 0) {
    const weights = legal.map((m) => (m.isCapture ? 2 : 1) * (/[+#]$/.test(m.san) ? 2 : 1));
    return legal[weightedIndex(rng, weights)]!.uci;
  }
  const usable = lines.filter((l) => l.pv[0] && legal.some((m) => m.uci === l.pv[0]));
  if (usable.length === 0) return legal[0]!.uci;
  const best = moverValue(usable[0]!, mover);
  const weights = usable.map((l) => Math.exp((moverValue(l, mover) - best) / profile.temperatureCp));
  return usable[weightedIndex(rng, weights)]!.pv[0]!;
}

function bump(stats: GameStats, reason: string): void {
  stats.rejected[reason] = (stats.rejected[reason] ?? 0) + 1;
}

interface Confirmed {
  fen: Fen;
  moves: Uci[];
  mateIn: number | null;
  findDepth: number;
  finalCp: number | null;
  firstScore: EngineLine['score'];
  ply: number;
  opponent: PlayerProfile['id'];
  solver: PlayerProfile['id'];
}

/** Plays game `index` of `seed` and returns its confirmed, tagged and checked puzzles. */
export async function playGame(engines: GameEngines, book: Pick<OpeningBook, 'get'>, seed: number, index: number, config: GeneratorConfig = DEFAULT_GENERATOR_CONFIG): Promise<GameResult> {
  const rng = createRng(hashSeed(seed, 'game', index));
  const players: Record<Color, PlayerProfile> = { w: pickProfile(rng), b: pickProfile(rng) };
  const line = randomBookLine(book, rng, config.openingPlies[0], config.openingPlies[1]);
  const game = ChessGame.fromFen(START_FEN);
  for (const m of line.moves) game.move(m);
  const stats: GameStats = { plies: 0, mistakes: 0, screenedOut: {}, candidates: 0, confirmed: 0, rejected: {} };
  const confirmed: Confirmed[] = [];
  const seen = new Set<string>();
  engines.screen.reset();
  let prev: EngineLine[] | null = null;
  let quietUntil = 0;
  let decidedPlies = 0;
  while (!game.status().isOver && game.ply() < config.maxPlies) {
    const fen = game.fen();
    const analysis = await engines.screen.service.analyse(fen, { depth: config.screenDepth, multiPv: config.screenMultiPv });
    const lines = analysis.lines;
    if (lines.length === 0) break;
    const top = lines[0]!.score;
    decidedPlies = top.type === 'cp' && Math.abs(top.value) >= MERCY_CP ? decidedPlies + 1 : 0;
    if (decidedPlies >= MERCY_PLIES) break;
    const solver = game.turn();
    const last = game.lastMove();
    const mistake = prev !== null && last !== null && game.ply() >= quietUntil && isOpponentMistake(prev, lines, solver);
    const screen = mistake ? judgePosition(lines, solver, SCREEN_PLY) : null;
    if (mistake) stats.mistakes++;
    if (screen?.kind === 'none') stats.screenedOut[screen.reason] = (stats.screenedOut[screen.reason] ?? 0) + 1;
    if (last && screen && screen.kind !== 'none') {
      stats.candidates++;
      const key = positionKey(fen);
      const sol = seen.has(key) ? ({ failed: true, reason: 'duplicate' } as const) : await buildSolution(engines.confirm.service, fen, config.solution);
      seen.add(key);
      if (isFailure(sol)) {
        bump(stats, sol.reason);
      } else {
        stats.confirmed++;
        confirmed.push({
          fen: last.fenBefore,
          moves: [last.uci, ...sol.moves],
          mateIn: sol.mateIn,
          findDepth: sol.findDepth,
          finalCp: sol.finalCp,
          firstScore: sol.firstLines[0]!.score,
          ply: last.ply,
          opponent: players[last.color].id,
          solver: players[solver].id,
        });
        // The continuation of an accepted puzzle is not screened again.
        quietUntil = game.ply() + sol.moves.length;
      }
    }
    const move = chooseMove(rng, players[solver], lines, game);
    prev = lines;
    game.move(move);
  }
  stats.plies = game.ply();
  const positions = [START_FEN, ...game.history().map((r) => r.fenAfter)];
  const division = divideGame(positions.slice(0, -1));
  const puzzles: RawPuzzle[] = [];
  for (const c of confirmed) {
    const phase = gamePhase(c.ply, division);
    const themes = tagPuzzle({ fen: c.fen, moves: c.moves, mateIn: c.mateIn, finalCp: c.finalCp, phase });
    if (config.checkDepth !== null) {
      engines.check.reset();
      const check = await checkPuzzleWithEngine(
        { id: 'candidate', fen: c.fen, moves: c.moves, themes, rating: 1500, ratingDeviation: 80, openingTags: [], source: 'generated' },
        engines.check.service,
        { depth: config.checkDepth },
      );
      if (check.errors.length > 0) {
        bump(stats, 'final_check');
        continue;
      }
    }
    puzzles.push({
      fen: c.fen,
      moves: c.moves,
      mateIn: c.mateIn,
      findDepth: c.findDepth,
      finalCp: c.finalCp,
      firstScore: c.firstScore,
      phase,
      themes,
      openingTags: c.ply <= config.openingTagMaxPly ? openingTagsFromName(line.opening?.name) : [],
      game: index,
      ply: c.ply,
      profiles: { opponent: c.opponent, solver: c.solver },
    });
  }
  return { index, puzzles, stats };
}
