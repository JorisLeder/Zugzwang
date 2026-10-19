/**
 * Input for `ProgressService.recordPuzzleAttempt` (P0-04 … P0-06, D-11): mode, outcome, time, themes and the puzzle
 * rating/RD. Demo attempts are never recorded (the caller must not call it for `demo`).
 */
import type { Puzzle, PuzzleMode } from '@/core/puzzles';
import type { ProgressService, PuzzleAttemptRepository, PuzzleRepository } from '@/core/storage';
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

/** An abandoned rated puzzle counts at most this long (the real time away is unknown). */
const ABANDONED_MAX_MS = 5 * 60_000;

/**
 * Settles a rated puzzle that was shown but left without an attempt (tab closed, reload, navigation): records it as
 * failed through the normal attempt path (rating drops, never served rated again) and clears the marker. Call before
 * selecting the next rated puzzle. Returns the recorded attempt id's puzzle, or `null` if nothing was pending.
 */
export function settleAbandonedRatedPuzzle(
  data: { progress: ProgressService; repos: { puzzles: PuzzleRepository; puzzleAttempts: PuzzleAttemptRepository } },
  now: () => number = Date.now,
): Promise<string | null> {
  // Concurrent calls (e.g. React StrictMode effects) share one run so the puzzle is never recorded twice.
  const running = settling.get(data.progress);
  if (running) return running;
  const p = settle(data, now).finally(() => settling.delete(data.progress));
  settling.set(data.progress, p);
  return p;
}

const settling = new WeakMap<ProgressService, Promise<string | null>>();

async function settle(
  data: { progress: ProgressService; repos: { puzzles: PuzzleRepository; puzzleAttempts: PuzzleAttemptRepository } },
  now: () => number = Date.now,
): Promise<string | null> {
  const pending = await data.progress.pendingRatedPuzzle();
  if (!pending) return null;
  let recorded: string | null = null;
  const alreadyRated = (await data.repos.puzzleAttempts.ratedPuzzleIds()).has(pending.puzzleId);
  const puzzle = alreadyRated ? null : await data.repos.puzzles.get(pending.puzzleId);
  if (puzzle) {
    const elapsed = Math.min(Math.max(0, now() - Date.parse(pending.startedAt) || 0), ABANDONED_MAX_MS);
    const outcome: PuzzleOutcome = { solved: false, firstTry: false, hintsUsed: 0, solutionShown: false };
    await data.progress.recordPuzzleAttempt(puzzleAttemptInput(puzzle, 'rated', outcome, elapsed));
    recorded = puzzle.id;
  }
  await data.progress.clearPendingRatedPuzzle();
  return recorded;
}
