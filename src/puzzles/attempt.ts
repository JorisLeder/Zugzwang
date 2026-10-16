/**
 * Input for `ProgressService.recordPuzzleAttempt` (P0-04 … P0-06, D-11): mode, outcome, time, themes and the puzzle
 * rating/RD. Demo attempts are never recorded (the caller must not call it for `demo`).
 */
import type { Puzzle, PuzzleMode } from '@/core/puzzles';
import type { ProgressService } from '@/core/storage';
import type { PuzzleOutcome } from './session';

/** Argument of `recordPuzzleAttempt`. */
export type PuzzleAttemptInput = Parameters<ProgressService['recordPuzzleAttempt']>[0];

/** Builds the attempt for `puzzle` (time rounded to whole milliseconds, never negative). */
export function puzzleAttemptInput(puzzle: Puzzle, mode: Exclude<PuzzleMode, 'demo'>, outcome: PuzzleOutcome, timeMs: number): PuzzleAttemptInput {
  return {
    puzzleId: puzzle.id,
    mode,
    solved: outcome.solved,
    firstTry: outcome.firstTry,
    hintsUsed: outcome.hintsUsed,
    solutionShown: outcome.solutionShown,
    timeMs: Math.max(0, Math.round(timeMs)),
    themes: [...puzzle.themes],
    puzzleRating: puzzle.rating,
    puzzleRd: puzzle.ratingDeviation,
  };
}
