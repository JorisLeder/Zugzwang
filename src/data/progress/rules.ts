/**
 * Progress rules as pure functions. The Dexie ProgressService, the remote-change merge and the fake backend all use
 * these, so client, sync and (fake) server compute exactly the same values. The SQL functions of the real backend
 * must implement the same rules (parity tests can import this module).
 *
 * - Puzzle rating: rated attempts only; Glicko-2 vs the puzzle's rating/RD; any hint or shown solution = not solved.
 * - Theme stats: rated, learning and theme attempts; a success is a first-try solve without hint or solution.
 * - Bot rating: finished `competition` bot games only; opponent = the bot's Elo from the game headers with RD 50.
 * - Lesson progress: furthest progress wins (max step, completed OR, max stars).
 * - Settings: last writer wins by `settings.updatedAt`; other profile fields by `updatedAt`.
 * - Games: newer `updatedAt` wins, a finished game never becomes active again, the device fields
 *   (`activeDeviceId`/`activeHeartbeatAt`) win by the newer heartbeat.
 */
import type { GameResult } from '@/core/chess';
import type { Game } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import type { Profile, Settings, ThemeStat } from '@/core/profile';
import type { PuzzleAttempt, PuzzleMode } from '@/core/puzzles';
import type { RatingKind, RatingRecord } from '@/core/rating';
import { MIN_PUZZLE_RATING, RATING_DEFAULTS } from '@/core/rating';
import { updateGlicko2 } from '@/lib/rating';

/** The fields of an attempt that decide rating and theme stats. */
export type AttemptOutcome = Pick<PuzzleAttempt, 'mode' | 'solved' | 'firstTry' | 'hintsUsed' | 'solutionShown' | 'puzzleRating' | 'themes'>;

/** A rating record with the generic defaults (used when no rating exists yet). */
export function defaultRating(kind: RatingKind, at: string): RatingRecord {
  return {
    kind,
    rating: RATING_DEFAULTS.rating,
    rd: RATING_DEFAULTS.rd,
    volatility: RATING_DEFAULTS.volatility,
    gamesCount: 0,
    updatedAt: at,
    provisional: false,
  };
}

/** Score of a rated attempt: solved without hint and without the solution shown. */
export function puzzleScore(a: Pick<PuzzleAttempt, 'solved' | 'hintsUsed' | 'solutionShown'>): 0 | 1 {
  return a.solved && a.hintsUsed === 0 && !a.solutionShown ? 1 : 0;
}

/** Whether the attempt changes the puzzle rating. */
export function isRatedAttempt(mode: PuzzleMode): boolean {
  return mode === 'rated';
}

/** Whether the attempt counts for the theme statistics. */
export function countsForThemeStats(mode: PuzzleMode): boolean {
  return mode === 'rated' || mode === 'learning' || mode === 'theme';
}

/** Theme-stat success: first try, solved, no hint, no solution shown. */
export function isThemeSuccess(a: Pick<PuzzleAttempt, 'solved' | 'firstTry' | 'hintsUsed' | 'solutionShown'>): boolean {
  return a.solved && a.firstTry && a.hintsUsed === 0 && !a.solutionShown;
}

/** New puzzle rating after one rated attempt (one Glicko-2 rating period per attempt). */
export function ratePuzzleAttempt(
  before: RatingRecord,
  a: Pick<PuzzleAttempt, 'solved' | 'hintsUsed' | 'solutionShown' | 'puzzleRating'>,
  puzzleRd: number,
  at: string,
  provisional = false,
): RatingRecord {
  const next = updateGlicko2(before, [
    { opponentRating: a.puzzleRating, opponentRd: puzzleRd || RATING_DEFAULTS.puzzleRd, score: puzzleScore(a) },
  ]);
  return { ...before, ...next, rating: Math.max(MIN_PUZZLE_RATING, next.rating), gamesCount: before.gamesCount + 1, updatedAt: at, provisional };
}

/** Theme stats after one attempt (only the attempt's themes are returned). Empty for modes that do not count. */
export function applyThemeStats(current: ReadonlyMap<string, ThemeStat>, a: AttemptOutcome): ThemeStat[] {
  if (!countsForThemeStats(a.mode)) return [];
  const success = isThemeSuccess(a);
  return [...new Set(a.themes)].map((theme) => {
    const s = current.get(theme) ?? { theme, attempts: 0, successes: 0 };
    return { theme, attempts: s.attempts + 1, successes: s.successes + (success ? 1 : 0) };
  });
}

/** Score of the user in a finished game (from the user's colour). */
export function gameScore(result: GameResult, userColor: 'w' | 'b'): 0 | 0.5 | 1 {
  if (result === '1/2-1/2') return 0.5;
  return (result === '1-0') === (userColor === 'w') ? 1 : 0;
}

/** Bot Elo from the game headers (the Elo tag of the bot's colour), `null` if missing. */
export function botOpponentElo(g: Pick<Game, 'headers' | 'userColor'>): number | null {
  if (!g.userColor) return null;
  const elo = Number(g.headers[g.userColor === 'w' ? 'BlackElo' : 'WhiteElo']);
  return Number.isFinite(elo) && elo > 0 ? elo : null;
}

/** Whether a finished game changes the bot rating. */
export function isRatedBotGame(g: Pick<Game, 'source' | 'assistance' | 'userColor' | 'headers'>, result: GameResult): boolean {
  return g.source === 'bot' && g.assistance === 'competition' && g.userColor !== null && result !== '*' && botOpponentElo(g) !== null;
}

/** New bot rating after a rated game, `null` when the game does not count. */
export function rateBotGame(
  before: RatingRecord,
  g: Pick<Game, 'source' | 'assistance' | 'userColor' | 'headers'>,
  result: GameResult,
  at: string,
  provisional = false,
): RatingRecord | null {
  if (!isRatedBotGame(g, result)) return null;
  const elo = botOpponentElo(g)!;
  const next = updateGlicko2(before, [{ opponentRating: elo, opponentRd: RATING_DEFAULTS.botRd, score: gameScore(result, g.userColor!) }]);
  return { ...before, ...next, rating: Math.max(MIN_PUZZLE_RATING, next.rating), gamesCount: before.gamesCount + 1, updatedAt: at, provisional };
}

const maxIso = (a: string, b: string) => (a >= b ? a : b);

/**
 * A finished failed test attempt: not completed but scored, stored with `currentStep === steps.length`. Max-merging it
 * would block a retry forever (the retry starts at a lower step), so a newer record replaces it (see below).
 */
const isFailedTestRun = (p: LessonProgress) => !p.completed && p.score !== undefined;

/**
 * Furthest progress wins (max step, completed OR, max stars; the further record supplies the other fields), with
 * these refinements (mirrored by the SQL trigger `zz_lesson_progress_before_update`):
 * - Both completed: the best test score wins (`score` max, undefined-safe).
 * - Both not completed and the older record (by `updatedAt`, ties: the incoming one is newer) is a scored test run
 *   that has not been passed: the newer record wins wholesale, so a retry after a failed test can resume at its own step.
 * - `stepPenalty` (penalty of the unfinished step, local only) survives a merge with a record of the same step that
 *   does not carry it (e.g. the server's copy).
 * `updatedAt` of the result: the given value, else the newer of both.
 */
export function mergeLessonProgress(prev: LessonProgress | null | undefined, next: LessonProgress, updatedAt?: string): LessonProgress {
  if (!prev) return { ...next, updatedAt: updatedAt ?? next.updatedAt };
  const resultAt = updatedAt ?? maxIso(prev.updatedAt, next.updatedAt);
  if (!prev.completed && !next.completed) {
    const nextIsNewer = next.updatedAt >= prev.updatedAt;
    const older = nextIsNewer ? prev : next;
    const newer = nextIsNewer ? next : prev;
    if (isFailedTestRun(older)) {
      return {
        ...newer,
        lessonVersion: Math.max(prev.lessonVersion, next.lessonVersion),
        completedAt: prev.completedAt ?? next.completedAt,
        updatedAt: resultAt,
      };
    }
  }
  const incomingFurther = (next.completed && !prev.completed) || (next.completed === prev.completed && next.currentStep >= prev.currentStep);
  const base = incomingFurther ? next : prev;
  const other = incomingFurther ? prev : next;
  const merged: LessonProgress = {
    ...base,
    lessonVersion: Math.max(prev.lessonVersion, next.lessonVersion),
    currentStep: Math.max(prev.currentStep, next.currentStep),
    completed: prev.completed || next.completed,
    stars: Math.max(prev.stars, next.stars) as LessonProgress['stars'],
    completedAt: prev.completedAt ?? next.completedAt,
    updatedAt: resultAt,
  };
  if (prev.completed && next.completed && (prev.score !== undefined || next.score !== undefined)) {
    merged.score = Math.max(prev.score ?? 0, next.score ?? 0);
  }
  if (base.stepPenalty === undefined && other.stepPenalty !== undefined && other.currentStep === base.currentStep) {
    merged.stepPenalty = other.stepPenalty;
  }
  return merged;
}

/** Completed lesson steps gained by a merge (for daily activity): step delta + 1 for a newly completed lesson. */
export function lessonStepsGained(prev: LessonProgress | null | undefined, merged: LessonProgress): number {
  return Math.max(0, merged.currentStep - (prev?.currentStep ?? 0)) + (merged.completed && !prev?.completed ? 1 : 0);
}

/** Last writer wins by `updatedAt` (ties keep the incoming settings). */
export function mergeSettings(current: Settings, incoming: Settings): Settings {
  return incoming.updatedAt >= current.updatedAt ? { ...incoming } : { ...current };
}

/** Merges two versions of the profile: settings LWW by `settings.updatedAt`, other fields LWW by `updatedAt`. */
export function mergeProfile(current: Profile | null | undefined, incoming: Profile): Profile {
  if (!current) return { ...incoming, settings: { ...incoming.settings } };
  const newer = incoming.updatedAt >= current.updatedAt ? incoming : current;
  return {
    ...newer,
    id: incoming.id,
    settings: mergeSettings(current.settings, incoming.settings),
    createdAt: current.createdAt <= incoming.createdAt ? current.createdAt : incoming.createdAt,
    updatedAt: maxIso(current.updatedAt, incoming.updatedAt),
  };
}

const heartbeatOf = (g: Pick<Game, 'activeHeartbeatAt'>) => g.activeHeartbeatAt ?? '';

/** Merges two versions of a game (see the module comment). */
export function mergeGame(current: Game | null | undefined, incoming: Game): Game {
  if (!current) return { ...incoming };
  let base: Game;
  if (current.status !== 'active' && incoming.status === 'active') base = current;
  else if (incoming.status !== 'active' && current.status === 'active') base = incoming;
  else base = incoming.updatedAt >= current.updatedAt ? incoming : current;
  const device = heartbeatOf(incoming) >= heartbeatOf(current) ? incoming : current;
  return {
    ...base,
    activeDeviceId: device.activeDeviceId,
    activeHeartbeatAt: device.activeHeartbeatAt,
    createdAt: current.createdAt <= incoming.createdAt ? current.createdAt : incoming.createdAt,
    updatedAt: maxIso(current.updatedAt, incoming.updatedAt),
  };
}
