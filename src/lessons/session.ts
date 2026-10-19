/**
 * Lesson session (P0-12): which step is shown, how many steps are completed, mistakes and hints, test scoring, and
 * the `LessonProgress` record written after every completed step and after every mistake or hint
 * (`data.progress.recordLessonProgress`; the latter keep `currentStep`, so reloading cannot erase them).
 *
 * - Steps are completed in order. `done` = number of completed steps; the learner can look back at any completed
 *   step (`index < done`, "review": mistakes and hints there are not counted) and work on step `done`.
 *   `index === steps.length` is the end screen.
 * - Resume (P0-12 "Wiedereinstieg an derselben Stelle"): a saved, not completed progress of the same lesson version
 *   with `currentStep < steps.length` continues at `currentStep` with its mistakes, hints, step penalty and test score. A completed
 *   lesson, a failed test (`currentStep === steps.length`, not completed) or another lesson version start fresh.
 * - Tests: `score` is stored as "correct first tries so far / all exercises" – it only grows while the test runs, is the
 *   final score at the end, and lets a resumed test restore its count.
 */
import type { Lesson, LessonProgress } from '@/core/lessons';
import { exerciseCount, isExercise, isTest, testResult, type TestResult } from './scoring';
import { computeStars, type EarnedStars } from './stars';

/** State of one lesson run. */
export interface LessonSession {
  lessonId: string;
  lessonVersion: number;
  kind: Lesson['kind'];
  stepCount: number;
  /** Shown step; `stepCount` = end screen. */
  index: number;
  /** Completed steps (prefix). */
  done: number;
  mistakes: number;
  hintsUsed: number;
  /** Mistakes + hints on the current task step (`done`), reset when it is completed. */
  taskPenalty: number;
  /** Exercises solved at the first try (tests). */
  correctFirstTries: number;
  /** Whether the run resumed saved progress. */
  resumed: boolean;
  /** Set when the last step was completed. */
  result: LessonResult | null;
}

/** Result of a finished run. */
export interface LessonResult {
  /** Lessons: always true; tests: passed. */
  completed: boolean;
  /** Stars of this run (0 for a failed test). */
  stars: 0 | EarnedStars;
  mistakes: number;
  hintsUsed: number;
  /** Tests only. */
  test: TestResult | null;
}

/** Whether saved progress can be resumed (see file header). */
export function canResume(lesson: Pick<Lesson, 'version' | 'steps'>, saved: LessonProgress | null | undefined): saved is LessonProgress {
  return (
    !!saved &&
    !saved.completed &&
    saved.lessonVersion === lesson.version &&
    // At step 0 there is only something to resume once a mistake or hint was recorded there.
    (saved.currentStep > 0 || (saved.stepPenalty ?? 0) > 0) &&
    saved.currentStep < lesson.steps.length
  );
}

/** New session, resuming `saved` when possible. */
export function createLessonSession(lesson: Lesson, saved?: LessonProgress | null): LessonSession {
  const base: LessonSession = {
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    kind: lesson.kind,
    stepCount: lesson.steps.length,
    index: 0,
    done: 0,
    mistakes: 0,
    hintsUsed: 0,
    taskPenalty: 0,
    correctFirstTries: 0,
    resumed: false,
    result: null,
  };
  if (!canResume(lesson, saved)) return base;
  const exercises = exerciseCount(lesson);
  const exercisesBefore = lesson.steps.slice(0, saved.currentStep).filter(isExercise).length;
  const restored = isTest(lesson) && saved.score !== undefined ? Math.round(saved.score * exercises) : 0;
  return {
    ...base,
    index: saved.currentStep,
    done: saved.currentStep,
    mistakes: Math.max(0, saved.mistakes),
    hintsUsed: Math.max(0, saved.hintsUsed),
    taskPenalty: Math.max(0, saved.stepPenalty ?? 0),
    correctFirstTries: Math.min(exercisesBefore, Math.max(0, restored)),
    resumed: true,
  };
}

/** Whether the shown step is an already completed one (review: nothing is counted; "Weiter" is enabled). */
export function isReviewing(s: LessonSession): boolean {
  return s.index < s.done;
}

/** Counts a mistake on the current task step (ignored while reviewing or after the end). */
export function recordMistake(s: LessonSession): LessonSession {
  if (s.index !== s.done || s.index >= s.stepCount) return s;
  return { ...s, mistakes: s.mistakes + 1, taskPenalty: s.taskPenalty + 1 };
}

/** Counts a hint on the current task step (ignored while reviewing or after the end). */
export function recordHint(s: LessonSession): LessonSession {
  if (s.index !== s.done || s.index >= s.stepCount) return s;
  return { ...s, hintsUsed: s.hintsUsed + 1, taskPenalty: s.taskPenalty + 1 };
}

/**
 * Completes the shown step if it is the current task. Exercises count as correct at the first try when no mistake
 * or hint happened on them. Completing the last step finishes the run (`result`).
 */
export function completeStep(s: LessonSession, lesson: Lesson): LessonSession {
  if (s.index !== s.done || s.index >= s.stepCount) return s;
  const step = lesson.steps[s.index];
  const clean = s.taskPenalty === 0;
  const correctFirstTries = s.correctFirstTries + (step && isExercise(step) && clean ? 1 : 0);
  const done = s.done + 1;
  const next: LessonSession = { ...s, done, taskPenalty: 0, correctFirstTries };
  if (done < s.stepCount) return next;
  const test = isTest(lesson) ? testResult(lesson, correctFirstTries) : null;
  const completed = test ? test.passed : true;
  return {
    ...next,
    result: {
      completed,
      stars: completed ? computeStars(next.mistakes, next.hintsUsed) : 0,
      mistakes: next.mistakes,
      hintsUsed: next.hintsUsed,
      test,
    },
  };
}

/** "Weiter": next step (or the end screen) – only from a completed step. */
export function goNext(s: LessonSession): LessonSession {
  if (s.index >= s.done) return s;
  return { ...s, index: Math.min(s.index + 1, s.stepCount) };
}

/** Previous step. */
export function goPrev(s: LessonSession): LessonSession {
  return s.index > 0 ? { ...s, index: s.index - 1 } : s;
}

/** Jump to a reachable step (≤ `done`; `stepCount` only after the end). */
export function goTo(s: LessonSession, index: number): LessonSession {
  const max = s.result ? s.stepCount : Math.min(s.done, s.stepCount - 1);
  return { ...s, index: Math.max(0, Math.min(max, index)) };
}

/** Starts the lesson again from step 1 (replay after the end, retry of a failed test). */
export function restartSession(lesson: Lesson): LessonSession {
  return createLessonSession(lesson, null);
}

/** The record for `recordLessonProgress` after a completed step, a mistake or a hint. */
export function progressRecord(s: LessonSession, lesson: Lesson, now: Date = new Date()): LessonProgress {
  const ts = now.toISOString();
  const completed = s.result?.completed ?? false;
  const record: LessonProgress = {
    lessonId: s.lessonId,
    lessonVersion: s.lessonVersion,
    currentStep: s.done,
    completed,
    stars: completed ? s.result!.stars : 0,
    mistakes: s.mistakes,
    hintsUsed: s.hintsUsed,
    stepPenalty: s.taskPenalty,
    updatedAt: ts,
    completedAt: completed ? ts : null,
  };
  if (isTest(lesson)) {
    const total = exerciseCount(lesson);
    record.score = total === 0 ? 1 : s.correctFirstTries / total;
  }
  return record;
}
