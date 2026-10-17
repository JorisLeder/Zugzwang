/**
 * Course tests and the Stufe-0 skip test (BACKLOG WP-06): score = exercises solved correctly at the first try /
 * exercises; passed when score ≥ `passThreshold` (default 0.8). Exercises are the steps the learner has to solve:
 * "Finde den Zug", Quiz and Ausspielen. A hint, a wrong move/answer or a failed Ausspielen attempt makes the
 * exercise "not correct at the first try".
 */
import type { Lesson, LessonStep, LessonStepType } from '@/core/lessons';

/** Default pass threshold of tests. */
export const DEFAULT_PASS_THRESHOLD = 0.8;

/** Step types that count as exercises. */
export const EXERCISE_STEP_TYPES: readonly LessonStepType[] = ['find_move', 'quiz', 'play_out'];

/** Whether a step is an exercise. */
export function isExercise(step: LessonStep): boolean {
  return EXERCISE_STEP_TYPES.includes(step.type);
}

/** Number of exercises of a lesson. */
export function exerciseCount(lesson: Pick<Lesson, 'steps'>): number {
  return lesson.steps.filter(isExercise).length;
}

/** Whether the lesson is a test (course test or skip test). */
export function isTest(lesson: Pick<Lesson, 'kind'>): boolean {
  return lesson.kind === 'course_test' || lesson.kind === 'skip_test';
}

/** Pass threshold of a test. */
export function passThreshold(lesson: Pick<Lesson, 'passThreshold'>): number {
  return lesson.passThreshold ?? DEFAULT_PASS_THRESHOLD;
}

/** Score 0–1 = correct first tries / exercises (a test without exercises scores 1). */
export function testScore(correctFirstTries: number, exercises: number): number {
  if (exercises <= 0) return 1;
  return Math.max(0, Math.min(1, correctFirstTries / exercises));
}

/** Whether a score passes the threshold (≥, with a tolerance for floating point). */
export function isPassed(score: number, threshold: number = DEFAULT_PASS_THRESHOLD): boolean {
  return score + 1e-9 >= threshold;
}

/** Full result of a finished test. */
export interface TestResult {
  correct: number;
  total: number;
  score: number;
  threshold: number;
  passed: boolean;
}

/** Result of a test from the number of correct first tries. */
export function testResult(lesson: Pick<Lesson, 'steps' | 'passThreshold'>, correctFirstTries: number): TestResult {
  const total = exerciseCount(lesson);
  const correct = Math.max(0, Math.min(total, correctFirstTries));
  const score = testScore(correct, total);
  const threshold = passThreshold(lesson);
  return { correct, total, score, threshold, passed: isPassed(score, threshold) };
}
