/**
 * Human error model for bots of 800–2000 Elo (D-16, P0-07 "menschenähnlich – keine perfekten Züge mit eingestreuten
 * Zufallspatzern").
 *
 * 1. The engine reports 8–12 candidate moves (MultiPV) at an Elo-dependent depth.
 * 2. With an Elo-dependent probability the bot is "blind" to the opponent's replies: it judges the candidates with a
 *    very shallow search only (depth 1–2), so it misses quiet threats (forks, pins, mating nets) beyond that horizon.
 * 3. Each candidate gets a log-weight `−(loss / temperature)^sharpness + natural bonus`: `loss` is its expected-points
 *    loss vs. the best candidate (mover's win%, D-07 scale), the Elo-dependent temperature is the loss a player of
 *    this strength still "accepts" easily, and `sharpness` > 1 makes the kernel bell-shaped (small inaccuracies are
 *    common, big losses fall off much faster than in a plain softmax). Natural moves (recapture, check, capture,
 *    development, castling – style dependent) get a small bonus in log units.
 * 4. The move is drawn proportionally to `exp(log-weight)`: near-best moves are common, inaccuracies frequent,
 *    mistakes rarer and blunders rarest – errors grow smoothly with the position's difficulty, they are not random
 *    blunders sprinkled over perfect play.
 */
import type { Color, Fen, PieceSymbol, Square, Uci } from '@/core/chess';
import type { EngineLine, EngineService, Score } from '@/core/engine';
import { WIN_PERCENT_MULTIPLIER } from '@/analysis';
import { ChessGame, type LegalMove } from '@/lib/chess';
import { naturalTraits } from '../heuristics';
import type { HumanParams } from '../params';
import { softmaxWeights, weightedPick, type RandomSource } from '../random';

/** One candidate of the human model. */
export interface HumanCandidate {
  uci: Uci;
  /** Mover's win percentage after the move (0–100, ranking scale without the ±1000 saturation) of the search used. */
  winPct: number;
  /** Expected-points loss vs. the best candidate (0–1). */
  loss: number;
  /** Natural-move bonus (log units). */
  bonus: number;
  /** Log-weight of the candidate in the selection (`−(loss / temperature)^sharpness + bonus`). */
  score: number;
}

/** Result of `selectHumanMove`. */
export interface HumanSelection {
  uci: Uci;
  candidates: HumanCandidate[];
  /** EP gap between the best and the second-best candidate (difficulty, for the think time); `null` with one candidate. */
  spread: number | null;
}

/** The opponent's last move (for recaptures). */
export type PreviousMove = { to: Square; captured?: PieceSymbol } | null;

/** Mate scores are mapped to `MATE_BASE - N` (mover's view) so that shorter mates compare higher than longer ones. */
const MATE_BASE = 100_000;
/** Centipawn ceiling for ranking only (analysis/Coach keep the Lichess ±1000 in `scoreWinPercent`). */
const RANK_CP_CEILING = 2000;

/** Comparable value of an engine score from the mover's point of view: cp unclamped, mate N = ±(100000 − N). */
export function comparableScore(score: Score, mover: Color): number {
  if (score.type === 'mate') {
    const n = Math.abs(score.value);
    const moverMates = score.value !== 0 && score.value > 0 === (mover === 'w');
    return moverMates ? MATE_BASE - n : -(MATE_BASE - n);
  }
  return mover === 'w' ? score.value : -score.value;
}

/**
 * Mover's win percentage (0–100) for ranking candidates only. Unlike `scoreWinPercent` it does not saturate at ±1000 cp:
 * cp are clamped at ±2000 (+500 < +900 < +1500 stay distinguishable) and forced mates sit strictly above every cp
 * score, the shorter mate higher (mate in 1 > mate in 2 > …); mates against the mover mirror this below.
 */
export function rankWinPercent(score: Score, mover: Color): number {
  const v = comparableScore(score, mover);
  if (Math.abs(v) >= MATE_BASE - 1000) {
    const n = Math.min(MATE_BASE - Math.abs(v), 50);
    const win = 99.95 + (0.049 * (51 - n)) / 50;
    return v > 0 ? win : 100 - win;
  }
  const cp = Math.min(RANK_CP_CEILING, Math.max(-RANK_CP_CEILING, v));
  return 100 / (1 + Math.exp(WIN_PERCENT_MULTIPLIER * cp));
}

/**
 * Pure selection step: candidates from engine lines (scores White POV, D-08) → softmax pick.
 * Lines without a move are ignored; illegal moves (stale lines) are skipped.
 */
export function selectHumanMove(
  fen: Fen,
  lines: readonly EngineLine[],
  params: Pick<HumanParams, 'temperature' | 'sharpness' | 'natural'>,
  random: RandomSource,
  previous: PreviousMove = null,
): HumanSelection | null {
  const game = ChessGame.fromFen(fen);
  const mover: Color = game.turn();
  const legal = new Map<Uci, LegalMove>(game.legalMoves().map((m) => [m.uci, m]));
  const seen = new Set<Uci>();
  const mateInOne = new Set<Uci>();
  const raw: Array<{ uci: Uci; winPct: number; move: LegalMove }> = [];
  for (const line of [...lines].sort((a, b) => a.multipv - b.multipv)) {
    const uci = line.pv[0];
    const move = uci ? legal.get(uci) : undefined;
    if (!uci || !move || seen.has(uci)) continue;
    seen.add(uci);
    raw.push({ uci, winPct: rankWinPercent(line.score, mover), move });
    if (line.score.type === 'mate' && comparableScore(line.score, mover) === MATE_BASE - 1) mateInOne.add(uci);
  }
  if (raw.length === 0) return null;
  const bestWin = Math.max(...raw.map((c) => c.winPct));
  const t = Math.max(params.temperature, 1e-6);
  const candidates: HumanCandidate[] = raw.map((c) => {
    // A mate in 1 is always taken: every other candidate counts as fully lost against it.
    const loss = mateInOne.size > 0 && !mateInOne.has(c.uci) ? 1 : Math.max(0, (bestWin - c.winPct) / 100);
    const traits = naturalTraits(fen, c.move, previous);
    const n = params.natural;
    const bonus =
      (traits.recapture ? n.recapture : 0) +
      (traits.check ? n.check : 0) +
      (traits.capture && !traits.recapture ? n.capture : 0) +
      (traits.development ? n.development : 0) +
      (traits.castle ? n.castle : 0);
    return { uci: c.uci, winPct: c.winPct, loss, bonus, score: -Math.pow(loss / t, params.sharpness) + bonus };
  });
  const weights = softmaxWeights(
    candidates.map((c) => c.score),
    1,
  );
  const pick = weightedPick(candidates, weights, random) ?? candidates[0]!;
  const losses = candidates.map((c) => c.loss).sort((a, b) => a - b);
  return { uci: pick.uci, candidates, spread: losses.length > 1 ? losses[1]! - losses[0]! : null };
}

/** Result of `chooseHumanMove`. */
export interface HumanMoveResult extends HumanSelection {
  /** The decision used the shallow ("blind") search. */
  blind: boolean;
}

/** Runs the searches and selects a move (see the file header). Returns `null` when the engine reports no move. */
export async function chooseHumanMove(
  engine: EngineService,
  fen: Fen,
  params: HumanParams,
  random: RandomSource,
  previous: PreviousMove,
  signal?: AbortSignal,
): Promise<HumanMoveResult | null> {
  const blind = random() < params.blindness;
  const analysis = await engine.analyse(fen, {
    depth: blind ? params.shallowDepth : params.depth,
    multiPv: params.multiPv,
    ...(blind ? {} : { movetimeMs: params.movetimeMs }),
    ...(signal ? { signal } : {}),
  });
  const selection = selectHumanMove(fen, analysis.lines, params, random, previous);
  return selection ? { ...selection, blind } : null;
}
