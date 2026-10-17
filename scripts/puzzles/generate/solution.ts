/**
 * Confirms a candidate position at full depth and extends the solution (see `detect.ts` for the rules).
 * The opponent's replies are the engine's best defence: the second move of the solver's principal variation, or a
 * separate search when the PV is too short.
 */
import type { Color, Fen, Uci } from '@/core/chess';
import type { EngineLine, EngineService } from '@/core/engine';
import { ChessGame, fenTurn } from '@/lib/chess';
import { continueVerdict, DETECTION, FIRST_PLY, judgePosition, type PositionVerdict } from './detect';
import { analyseTracked, findDepth } from './engine';

/** Search settings of the extension. */
export interface SolutionConfig {
  /** Depth of every solver-ply search (≥ 18 in production). */
  depth: number;
  /** Maximum number of solver moves of an advantage line. */
  maxAdvantageMoves: number;
}

/** Production settings. */
export const DEFAULT_SOLUTION_CONFIG: SolutionConfig = { depth: 18, maxAdvantageMoves: 5 };

/** A confirmed solution starting at the puzzle position (after the opponent's mistake). */
export interface Solution {
  /** Solver and opponent moves, starting and ending with a solver move (UCI). */
  moves: Uci[];
  /** Forced mate distance at the first solver ply (mate lines only). */
  mateIn: number | null;
  /** Depth from which Stockfish kept the first move. */
  findDepth: number;
  /** Lines of the first solver ply (MultiPV 2). */
  firstLines: EngineLine[];
  /** Solver-POV centipawns after the last solver move (`null` for mate lines). */
  finalCp: number | null;
}

/** Why a candidate was not turned into a puzzle. */
export type SolutionFailure = { failed: true; reason: string };

function cpFor(line: EngineLine | undefined, solver: Color): number | null {
  if (!line || line.score.type !== 'cp') return null;
  return solver === 'w' ? line.score.value : -line.score.value;
}

/** Confirms the candidate at `start` (solver to move) and builds the solution, or explains why not. */
export async function buildSolution(engine: EngineService, start: Fen, config: SolutionConfig = DEFAULT_SOLUTION_CONFIG): Promise<Solution | SolutionFailure> {
  const solver = fenTurn(start);
  const first = await analyseTracked(engine, start, config.depth, 2);
  const verdict: PositionVerdict = judgePosition(first.lines, solver, FIRST_PLY);
  if (verdict.kind === 'none') return { failed: true, reason: verdict.reason };
  const mateIn = verdict.kind === 'mate' ? verdict.mateIn : null;
  const maxSolverMoves = mateIn ?? config.maxAdvantageMoves;
  const game = ChessGame.fromFen(start);
  const moves: Uci[] = [];
  let lines = first.lines;
  let finalCp = cpFor(lines[0], solver);
  for (let k = 0; k < maxSolverMoves; k++) {
    const best = lines[0]!;
    const rec = game.move(best.pv[0]!);
    if (!rec) return { failed: true, reason: `illegal engine move ${best.pv[0]!}` };
    moves.push(rec.uci);
    finalCp = cpFor(best, solver);
    if (rec.isCheckmate) break;
    if (game.status().isOver) return { failed: true, reason: `game ends after ${rec.san}` };
    if (k === maxSolverMoves - 1) {
      if (mateIn !== null) return { failed: true, reason: 'mate line did not end in mate' };
      break;
    }
    // Opponent's best defence.
    let reply: Uci | null = null;
    const pvReply = best.pv[1];
    if (pvReply && game.legalMoves().some((m) => m.uci === pvReply)) reply = pvReply;
    if (!reply) reply = (await engine.analyse(game.fen(), { depth: config.depth, multiPv: 1 })).bestMove;
    if (!reply) return { failed: true, reason: 'no reply' };
    const replyRec = game.move(reply);
    if (!replyRec) return { failed: true, reason: `illegal reply ${reply}` };
    if (game.status().isOver) {
      if (mateIn !== null) return { failed: true, reason: 'game ends after the reply' };
      game.undo();
      break;
    }
    const next = await analyseTracked(engine, game.fen(), config.depth, 2);
    const mateLeft = mateIn === null ? null : mateIn - (k + 1);
    const cont = continueVerdict(next.lines, solver, mateLeft, DETECTION.nextMargin);
    if (cont.kind === 'reject') return { failed: true, reason: cont.reason };
    if (cont.kind === 'stop') {
      game.undo();
      break;
    }
    moves.push(replyRec.uci);
    lines = next.lines;
  }
  const last = game.history().at(-1);
  if (mateIn !== null && !last?.isCheckmate) return { failed: true, reason: 'mate line did not end in mate' };
  if (mateIn !== null && Math.ceil(moves.length / 2) !== mateIn) return { failed: true, reason: 'mate length mismatch' };
  return {
    moves,
    mateIn,
    findDepth: findDepth(first.bestByDepth, first.lines[0]!.pv[0]!),
    firstLines: first.lines,
    finalCp: mateIn !== null ? null : finalCp,
  };
}

/** Type guard for failures. */
export function isFailure(r: Solution | SolutionFailure): r is SolutionFailure {
  return 'failed' in r;
}
