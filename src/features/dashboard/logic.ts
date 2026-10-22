/**
 * Pure dashboard rules (PRD P0-14): what "Weiter, wo du aufgehört hast" offers and which puzzle mode the learner
 * used last.
 *
 * Priority of the resume targets: the running bot game (newest) → the lesson in progress (newest) → the puzzle mode
 * of the latest attempt. All available targets are returned in that order; the first one is the main action.
 */
import type { Game } from '@/core/games';
import type { CourseMeta, Lesson, LessonProgress } from '@/core/lessons';
import { PUZZLE_THEMES, type PuzzleAttempt, type PuzzleMode, type PuzzleThemeId } from '@/core/puzzles';
import { canResume } from '@/lessons';
import { isSkillTheme } from '@/stats';

/** Puzzle mode to resume (P1 modes fall back to the hub). */
export type PuzzleResumeMode = 'rated' | 'learning' | 'theme' | 'hub';

/** One resume target. */
export type ResumeTarget =
  | { kind: 'game'; game: Game }
  | { kind: 'lesson'; course: CourseMeta; lessonId: string; progress: LessonProgress }
  | { kind: 'puzzles'; mode: PuzzleResumeMode; themeId: PuzzleThemeId | null; at: string };

/** Inputs of `resumeTargets`. */
export interface ResumeInput {
  /** Running games (any order). */
  activeGames: readonly Game[];
  /** All lesson progress rows. */
  lessonProgress: readonly LessonProgress[];
  /** Catalog courses. */
  courses: readonly CourseMeta[];
  /** Recent puzzle attempts, newest first. */
  attempts: readonly PuzzleAttempt[];
}

/** The course that contains a lesson (or its test), `undefined` if none. */
export function courseOfLesson(courses: readonly CourseMeta[], lessonId: string): CourseMeta | undefined {
  return courses.find((c) => c.lessonIds.includes(lessonId) || c.testLessonId === lessonId);
}

/**
 * A started, unfinished lesson: at least one step done, or a mistake/hint recorded on the first step. Without the
 * lesson this cannot tell a failed course test (all steps done, not passed) from a running one – pass the loaded
 * lesson to exclude it (`canResume`).
 */
export function isLessonInProgress(p: LessonProgress, lesson?: Pick<Lesson, 'version' | 'steps'>): boolean {
  if (lesson) {
    const resumable: boolean = canResume(lesson, p);
    return resumable;
  }
  return !p.completed && (p.currentStep > 0 || (p.stepPenalty ?? 0) > 0);
}

/** What the lesson resume card offers for a stored record once the lesson is loaded. */
export type LessonResumeKind = 'resume' | 'retry_test' | 'restart';

/**
 * `resume` = continue at the saved step; `retry_test` = a failed test (all steps done, not passed) – "Test
 * wiederholen" starts it again; `restart` = the lesson changed, the record no longer fits.
 */
export function lessonResumeKind(lesson: Pick<Lesson, 'version' | 'steps'>, p: LessonProgress): LessonResumeKind {
  const resumable: boolean = canResume(lesson, p);
  if (resumable) return 'resume';
  if (!p.completed && p.lessonVersion === lesson.version && p.currentStep >= lesson.steps.length) return 'retry_test';
  return 'restart';
}

const MODE_MAP: Partial<Record<PuzzleMode, PuzzleResumeMode>> = { rated: 'rated', learning: 'learning', theme: 'theme' };

/**
 * Theme that was trained in the latest run of theme-mode attempts: the skill theme every attempt of that run shares
 * (first in display order). `null` when the run has no common skill theme.
 */
export function lastTrainedTheme(attempts: readonly PuzzleAttempt[]): PuzzleThemeId | null {
  const run: PuzzleAttempt[] = [];
  for (const a of attempts) {
    if (a.mode !== 'theme') break;
    run.push(a);
  }
  if (run.length === 0) return null;
  let common = new Set(run[0]!.themes.filter(isSkillTheme));
  for (const a of run.slice(1)) {
    const next = new Set(a.themes.filter((t) => common.has(t)));
    if (next.size === 0) break; // an older run with a different theme
    common = next;
  }
  return PUZZLE_THEMES.find((t) => common.has(t.id))?.id ?? null;
}

/** The puzzle mode of the latest stored attempt (demo attempts are never stored), `null` without attempts. */
export function lastPuzzleTarget(attempts: readonly PuzzleAttempt[]): Extract<ResumeTarget, { kind: 'puzzles' }> | null {
  const latest = attempts[0];
  if (!latest) return null;
  const mode = MODE_MAP[latest.mode] ?? 'hub';
  return { kind: 'puzzles', mode, themeId: mode === 'theme' ? lastTrainedTheme(attempts) : null, at: latest.createdAt };
}

/** All resume targets in priority order (game, lesson, puzzles). */
export function resumeTargets(input: ResumeInput): ResumeTarget[] {
  const out: ResumeTarget[] = [];
  const game = [...input.activeGames]
    .filter((g) => g.status === 'active' && g.source === 'bot')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (game) out.push({ kind: 'game', game });

  const lessons = input.lessonProgress
    .filter((p) => isLessonInProgress(p))
    .map((progress) => ({ progress, course: courseOfLesson(input.courses, progress.lessonId) }))
    .filter((x): x is { progress: LessonProgress; course: CourseMeta } => !!x.course && x.course.status === 'available')
    .sort((a, b) => b.progress.updatedAt.localeCompare(a.progress.updatedAt));
  const lesson = lessons[0];
  if (lesson) out.push({ kind: 'lesson', course: lesson.course, lessonId: lesson.progress.lessonId, progress: lesson.progress });

  const puzzles = lastPuzzleTarget(input.attempts);
  if (puzzles) out.push(puzzles);
  return out;
}

/** Daily goal progress. */
export interface DailyGoalProgress {
  minutes: number;
  goal: number;
  /** 0–1. */
  fraction: number;
  reached: boolean;
  /** Minutes still missing (0 when reached). */
  remaining: number;
}

/** Progress towards the daily goal (minutes are rounded down; a goal ≤ 0 counts as reached). */
export function dailyGoalProgress(minutes: number | null | undefined, goal: number): DailyGoalProgress {
  const m = Math.max(0, Math.floor(minutes ?? 0));
  const g = Math.max(0, Math.round(goal));
  const reached = g === 0 || m >= g;
  return { minutes: m, goal: g, fraction: g === 0 ? 1 : Math.min(1, m / g), reached, remaining: reached ? 0 : g - m };
}
