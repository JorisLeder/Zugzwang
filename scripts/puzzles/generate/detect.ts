/**
 * Puzzle detection rules (pure – engine lines in, verdicts out).
 *
 * A position (solver to move, reached by an opponent mistake) is a puzzle start when, at depth ≥ 18 with MultiPV 2:
 * - the solver has a forced mate in 1–5 and (for mate in ≥ 2) no second move mates equally fast, or
 * - EP(best) ≥ 0.70 and EP(best) − EP(second) ≥ 0.25 (EP = expected points of the solver, Lichess win%).
 * The solution is extended while every further solver move is unique: the fastest mate without an equally fast
 * alternative (mate lines), or best by ≥ `nextMargin` EP (advantage lines; the validator demands ≥ 0.10, the
 * generator uses 0.15 for headroom). An advantage line stops when the solver move is no longer unique or the position
 * turns into a forced mate (the advantage is settled).
 */
import type { Color } from '@/core/chess';
import type { EngineLine } from '@/core/engine';
import { solverExpectedPoints, solverMateIn } from '../lib/puzzleChecks';

/** Thresholds of the generator. */
export const DETECTION = {
  /** Minimum expected points of the best move at the first solver ply. */
  minBestEp: 0.7,
  /** Minimum EP margin best − second at the first solver ply. */
  firstMargin: 0.25,
  /** Minimum EP margin at later solver plies (validator: 0.10). */
  nextMargin: 0.15,
  /** Longest accepted forced mate (mateIn5 = "5 or more" in the theme list, the generator stops at 5). */
  maxMateIn: 5,
  /** Minimum EP the solver gains through the opponent's move (it has to be a mistake). */
  minMistakeGain: 0.15,
  /** Looser thresholds for the cheap screening search (candidates are confirmed at full depth). */
  screen: { minBestEp: 0.62, firstMargin: 0.18 },
} as const;

/** Verdict on one position. */
export type PositionVerdict =
  | { kind: 'mate'; mateIn: number }
  | { kind: 'advantage'; bestEp: number; margin: number }
  | { kind: 'none'; reason: 'no_move' | 'only_move' | 'mate_too_long' | 'mate_not_unique' | 'not_winning' | 'not_unique' };

/** Options of `judgePosition`. */
export interface JudgeOptions {
  minBestEp: number;
  minMargin: number;
  maxMateIn: number;
}

/**
 * Judges a position with the solver to move from its two best engine lines (White-POV scores).
 * Immediate mates are accepted even when several moves mate (every mating move is accepted at runtime).
 */
export function judgePosition(lines: readonly EngineLine[], solver: Color, opts: JudgeOptions): PositionVerdict {
  const [l1, l2] = lines;
  if (!l1 || !l1.pv[0]) return { kind: 'none', reason: 'no_move' };
  if (!l2 || !l2.pv[0]) return { kind: 'none', reason: 'only_move' };
  const mate1 = solverMateIn(l1, solver);
  if (mate1 !== null) {
    if (mate1 > opts.maxMateIn) return { kind: 'none', reason: 'mate_too_long' };
    if (mate1 > 1 && solverMateIn(l2, solver) === mate1) return { kind: 'none', reason: 'mate_not_unique' };
    return { kind: 'mate', mateIn: mate1 };
  }
  const ep1 = solverExpectedPoints(l1, solver, solver);
  const ep2 = solverExpectedPoints(l2, solver, solver);
  if (ep1 < opts.minBestEp) return { kind: 'none', reason: 'not_winning' };
  const margin = ep1 - ep2;
  if (margin < opts.minMargin) return { kind: 'none', reason: 'not_unique' };
  return { kind: 'advantage', bestEp: ep1, margin };
}

/** Judge options of the first solver ply at full depth. */
export const FIRST_PLY: JudgeOptions = { minBestEp: DETECTION.minBestEp, minMargin: DETECTION.firstMargin, maxMateIn: DETECTION.maxMateIn };

/** Judge options of the screening search. */
export const SCREEN_PLY: JudgeOptions = {
  minBestEp: DETECTION.screen.minBestEp,
  minMargin: DETECTION.screen.firstMargin,
  maxMateIn: DETECTION.maxMateIn,
};

/**
 * Whether the opponent's last move was a mistake: the solver gained ≥ `minMistakeGain` expected points through it,
 * or now has a forced mate it did not have before. A solver that was already mating is never a "new" puzzle.
 * @param before Lines of the position before the opponent's move (opponent to move).
 * @param after Lines of the position after it (solver to move).
 */
export function isOpponentMistake(before: readonly EngineLine[], after: readonly EngineLine[], solver: Color, minGain: number = DETECTION.minMistakeGain): boolean {
  const b = before[0];
  const a = after[0];
  if (!b || !a) return false;
  const opponent: Color = solver === 'w' ? 'b' : 'w';
  if (solverMateIn(b, solver) !== null) return false;
  if (solverMateIn(a, solver) !== null) return true;
  const epBefore = solverExpectedPoints(b, solver, opponent);
  const epAfter = solverExpectedPoints(a, solver, solver);
  return epAfter - epBefore >= minGain;
}

/** What to do at a later solver ply of the solution. */
export type ContinueVerdict = { kind: 'continue' } | { kind: 'stop'; reason: string } | { kind: 'reject'; reason: string };

/**
 * Decision at a later solver ply.
 * - Mate line (`mateLeft` = moves to mate the line still needs): the engine must see exactly that mate and no second
 *   move mating equally fast – otherwise the line is inconsistent and the puzzle is rejected.
 * - Advantage line (`mateLeft` = null): continue while the best move is unique by `nextMargin`; stop when it is not,
 *   or when the position has turned into a forced mate.
 */
export function continueVerdict(lines: readonly EngineLine[], solver: Color, mateLeft: number | null, nextMargin: number = DETECTION.nextMargin): ContinueVerdict {
  const [l1, l2] = lines;
  if (!l1 || !l1.pv[0]) return mateLeft === null ? { kind: 'stop', reason: 'no_move' } : { kind: 'reject', reason: 'no_move' };
  const mate1 = solverMateIn(l1, solver);
  if (mateLeft !== null) {
    if (mate1 !== mateLeft) return { kind: 'reject', reason: `mate distance ${String(mate1)} instead of ${mateLeft}` };
    if (mateLeft > 1 && l2 && solverMateIn(l2, solver) === mateLeft) return { kind: 'reject', reason: 'mate_not_unique' };
    return { kind: 'continue' };
  }
  if (mate1 !== null) return { kind: 'stop', reason: 'settled_mate' };
  if (!l2 || !l2.pv[0]) return { kind: 'stop', reason: 'only_move' };
  const margin = solverExpectedPoints(l1, solver, solver) - solverExpectedPoints(l2, solver, solver);
  return margin >= nextMargin ? { kind: 'continue' } : { kind: 'stop', reason: 'not_unique' };
}
