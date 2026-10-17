/**
 * "Ausspielen" (PRD Lektionen §4: "Stellung gegen den Bot gewinnen oder halten"): the goal is judged with
 * `ChessGame.status()` (FIDE 2023, D-04) after every ply.
 *
 * - `checkmate`: success when the learner checkmates within `maxMoves` own moves; fail on any other game end or when
 *   the last allowed own move did not mate.
 * - `promote`: success when one of the learner's moves promotes a pawn (or the learner checkmates), also when the
 *   promotion leaves a dead position (K+N vs K); fail when the promotion stalemates, on another game end or when the
 *   moves are used up.
 * - `draw`: success when the game ends in a draw, a draw can be claimed (threefold repetition / 50-move rule), the
 *   learner wins, or the learner made `maxMoves` moves and the bot's reply did not checkmate; fail when the learner
 *   is checkmated.
 */
import type { Color, GameStatus, MoveRecord } from '@/core/chess';
import type { PlayOutStep } from './types';

/** Why the step ended. */
export type PlayOutReason = 'user_mated' | 'user_was_mated' | 'promoted' | 'held' | 'drawn' | 'stalemate' | 'moves_exhausted';

/** Verdict after a ply. `null` = keep playing. */
export type PlayOutVerdict = { outcome: 'success' | 'fail'; reason: PlayOutReason } | null;

/** Input of `judgePlayOut`. */
export interface PlayOutPly {
  /** Status after the ply (`ChessGame.status()`). */
  status: GameStatus;
  /** Who made the ply. */
  mover: 'user' | 'bot';
  /** The ply itself. */
  move: Pick<MoveRecord, 'promotion'> | null;
  /** Learner moves made so far (including this one). */
  userMoves: number;
}

const DRAW_END_REASONS = new Set<GameStatus['reason']>(['stalemate', 'insufficient_material', 'fivefold_repetition', 'seventyfive_moves']);

/** Judges the goal after one ply. */
export function judgePlayOut(step: Pick<PlayOutStep, 'goal' | 'maxMoves' | 'userColor'>, ply: PlayOutPly): PlayOutVerdict {
  const { status } = ply;
  const user: Color = step.userColor;
  if (status.isOver) {
    if (status.reason === 'checkmate') {
      // The side to move is checkmated.
      return status.turn === user ? { outcome: 'fail', reason: 'user_was_mated' } : { outcome: 'success', reason: 'user_mated' };
    }
    // A promotion that leaves a dead position (e.g. K+N vs K) still reaches the goal; a stalemating one does not.
    if (step.goal === 'promote' && ply.mover === 'user' && ply.move?.promotion && status.reason !== 'stalemate') {
      return { outcome: 'success', reason: 'promoted' };
    }
    const drawReason: PlayOutReason = status.reason === 'stalemate' ? 'stalemate' : 'drawn';
    if (DRAW_END_REASONS.has(status.reason) || status.result === '1/2-1/2') {
      return step.goal === 'draw' ? { outcome: 'success', reason: drawReason } : { outcome: 'fail', reason: drawReason };
    }
    // Any other end (not reachable from a move) counts as not reached.
    return { outcome: 'fail', reason: 'drawn' };
  }
  if (step.goal === 'promote' && ply.mover === 'user' && ply.move?.promotion) return { outcome: 'success', reason: 'promoted' };
  if (step.goal === 'draw') {
    if (status.claimableDraws.length > 0) return { outcome: 'success', reason: 'drawn' };
    if (ply.mover === 'bot' && ply.userMoves >= step.maxMoves) return { outcome: 'success', reason: 'held' };
    return null;
  }
  if (ply.mover === 'user' && ply.userMoves >= step.maxMoves) return { outcome: 'fail', reason: 'moves_exhausted' };
  return null;
}

/** Moves left for the learner. */
export function movesLeft(step: Pick<PlayOutStep, 'maxMoves'>, userMoves: number): number {
  return Math.max(0, step.maxMoves - userMoves);
}
