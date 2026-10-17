/**
 * Daily activity and streak as pure functions (shared by the ProgressService, the ActivityTracker, the fake backend
 * and parity tests of dashboard and server). Dates are `YYYY-MM-DD` keys in the user's time zone (`localDateKey`).
 *
 * - A day's counters only grow; `goalReached` = minutes ≥ daily goal.
 * - A training day is a day with any activity (active minutes, a puzzle attempt, a finished game or a lesson step).
 * - The current streak counts consecutive training days ending today – or yesterday while today is still open, so the
 *   streak is not lost before the day is over. A gap resets it (the UI then shows "Tag 1" again, never a reproach).
 */
import type { DailyActivity } from '@/core/profile';
import { DEFAULT_DAILY_GOAL_MINUTES } from '@/core/profile';
import { addDays, localDateKey } from '@/lib/time';

/** Counter increments of one day. */
export type DailyDelta = Partial<Record<'minutes' | 'puzzles' | 'games' | 'lessons', number>>;

/** An empty day. */
export function emptyDay(date: string): DailyActivity {
  return { date, minutes: 0, puzzles: 0, games: 0, lessons: 0, goalReached: false };
}

/** Adds `delta` to a day (creating it when missing) and recomputes `goalReached`. */
export function addToDay(
  day: DailyActivity | null | undefined,
  date: string,
  delta: DailyDelta,
  goalMinutes: number = DEFAULT_DAILY_GOAL_MINUTES,
): DailyActivity {
  const d = day ? { ...day } : emptyDay(date);
  d.minutes += delta.minutes ?? 0;
  d.puzzles += delta.puzzles ?? 0;
  d.games += delta.games ?? 0;
  d.lessons += delta.lessons ?? 0;
  d.goalReached = d.minutes >= goalMinutes;
  return d;
}

/** Field-wise maximum of two versions of the same day (used while local changes are not yet confirmed). */
export function maxDay(a: DailyActivity, b: DailyActivity, goalMinutes: number = DEFAULT_DAILY_GOAL_MINUTES): DailyActivity {
  const minutes = Math.max(a.minutes, b.minutes);
  return {
    date: a.date,
    minutes,
    puzzles: Math.max(a.puzzles, b.puzzles),
    games: Math.max(a.games, b.games),
    lessons: Math.max(a.lessons, b.lessons),
    goalReached: a.goalReached || b.goalReached || minutes >= goalMinutes,
  };
}

/** Whether the day counts as a training day for the streak. */
export function isTrainingDay(d: DailyActivity | null | undefined): boolean {
  return !!d && (d.minutes > 0 || d.puzzles > 0 || d.games > 0 || d.lessons > 0);
}

/** Day key of an ISO timestamp in a time zone. */
export function dayKeyOf(iso: string, timeZone: string): string {
  return localDateKey(new Date(iso), timeZone);
}

/** Streak summary. */
export interface StreakInfo {
  /** Current streak in days (0 without a training day today or yesterday). */
  current: number;
  /** Today is already a training day. */
  trainedToday: boolean;
  /** Longest streak in the given days. */
  longest: number;
}

/** Computes the streak from daily activity rows (any order) for `today` (`YYYY-MM-DD`). */
export function computeStreak(days: readonly DailyActivity[], today: string): StreakInfo {
  const training = new Set(days.filter(isTrainingDay).map((d) => d.date));
  const trainedToday = training.has(today);
  let current = 0;
  let cursor = trainedToday ? today : addDays(today, -1);
  while (training.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  for (const date of training) {
    if (training.has(addDays(date, -1))) continue; // not the start of a run
    let run = 0;
    let d = date;
    while (training.has(d)) {
      run += 1;
      d = addDays(d, 1);
    }
    longest = Math.max(longest, run);
  }
  return { current, trainedToday, longest };
}
