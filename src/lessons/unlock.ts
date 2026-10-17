/**
 * Unlock rules of the Lernpfad (D-38) and completion state of lessons, courses and stages.
 *
 * - Stufe 0 is always open.
 * - Stufe 1 is open when the self-assessment is Einsteiger or higher (`beginner`, `club`, `advanced`), when the
 *   Stufe-0 skip test was passed (`profile.stageZeroSkipped`) or when Stufe 0 is completed.
 * - Stufe 2–4 (not part of V1): open when the previous stage is open and completed.
 * - A stage is completed when it has at least one available course and every available course is completed
 *   (a stage without content cannot be completed – it never opens the next stage by itself).
 * - A course is completed when all its lessons and its course test (if any) are completed.
 * - Inside an open, available course the lessons unlock one after another; a lesson that was already started or
 *   completed stays open. The course test unlocks when all lessons are completed.
 * - The Stufe-0 skip test (`kind: 'skip_test'`) is always open.
 * - Planned courses (`status: 'planned'`) are never open ("in Vorbereitung").
 */
import type { CourseMeta, Lesson, LessonProgress, StageId } from '@/core/lessons';
import type { Profile, SelfAssessment } from '@/core/profile';
import { STAGE_IDS } from './stages';

/** What the unlock rules need from the profile. `null` = no profile yet (first start). */
export type LearnerState = Pick<Profile, 'selfAssessment' | 'stageZeroSkipped'> | null;

/** Saved progress by lesson id. */
export type ProgressMap = ReadonlyMap<string, LessonProgress>;

/** Everything the rules look at. */
export interface UnlockContext {
  /** Catalog courses (available and planned). */
  courses: readonly CourseMeta[];
  progress: ProgressMap;
  learner: LearnerState;
}

/** Self-assessments that open Stufe 1 directly (D-38, D-10). */
export const STAGE_ONE_ASSESSMENTS: readonly SelfAssessment[] = ['beginner', 'club', 'advanced'];

/** Builds the progress map from a list. */
export function toProgressMap(list: readonly LessonProgress[]): Map<string, LessonProgress> {
  return new Map(list.map((p) => [p.lessonId, p]));
}

/** Whether a lesson (or test) is completed. */
export function isLessonCompleted(progress: ProgressMap, lessonId: string): boolean {
  return progress.get(lessonId)?.completed === true;
}

/** All ids of a course in path order: lessons, then the course test. */
export function courseItemIds(course: CourseMeta): string[] {
  return course.testLessonId ? [...course.lessonIds, course.testLessonId] : [...course.lessonIds];
}

/** Lessons done / total of a course (the course test is not counted). */
export function courseLessonCounts(course: CourseMeta, progress: ProgressMap): { done: number; total: number } {
  return { done: course.lessonIds.filter((id) => isLessonCompleted(progress, id)).length, total: course.lessonIds.length };
}

/** Stars earned / possible in a course (lessons only). */
export function courseStars(course: CourseMeta, progress: ProgressMap): { earned: number; max: number } {
  return {
    earned: course.lessonIds.reduce((sum, id) => sum + (progress.get(id)?.stars ?? 0), 0),
    max: course.lessonIds.length * 3,
  };
}

/** A course is completed when every lesson and the course test (if any) are completed. Planned courses never are. */
export function isCourseCompleted(course: CourseMeta, progress: ProgressMap): boolean {
  if (course.status !== 'available') return false;
  const ids = courseItemIds(course);
  return ids.length > 0 && ids.every((id) => isLessonCompleted(progress, id));
}

/** Available courses of a stage, sorted by `order`. */
export function availableCourses(courses: readonly CourseMeta[], stage: StageId): CourseMeta[] {
  return courses.filter((c) => c.stage === stage && c.status === 'available').sort((a, b) => a.order - b.order);
}

/** A stage is completed when it has available courses and all of them are completed. */
export function isStageCompleted(stage: StageId, ctx: Pick<UnlockContext, 'courses' | 'progress'>): boolean {
  const courses = availableCourses(ctx.courses, stage);
  return courses.length > 0 && courses.every((c) => isCourseCompleted(c, ctx.progress));
}

/** Why a stage is open (for the Lernpfad text), or `null` when it is locked. */
export type StageOpenReason = 'always' | 'self_assessment' | 'skip_test' | 'previous_completed';

/** Reason a stage is open, `null` if locked. */
export function stageOpenReason(stage: StageId, ctx: UnlockContext): StageOpenReason | null {
  if (stage === 0) return 'always';
  if (stage === 1) {
    if (isStageCompleted(0, ctx)) return 'previous_completed';
    if (ctx.learner?.stageZeroSkipped) return 'skip_test';
    if (ctx.learner?.selfAssessment && STAGE_ONE_ASSESSMENTS.includes(ctx.learner.selfAssessment)) return 'self_assessment';
    return null;
  }
  const previous = (stage - 1) as StageId;
  return isStageOpen(previous, ctx) && isStageCompleted(previous, ctx) ? 'previous_completed' : null;
}

/** Whether a stage is open (D-38). */
export function isStageOpen(stage: StageId, ctx: UnlockContext): boolean {
  return stageOpenReason(stage, ctx) !== null;
}

/** Whether a course can be entered: available and its stage open. */
export function isCourseOpen(course: CourseMeta, ctx: UnlockContext): boolean {
  return course.status === 'available' && isStageOpen(course.stage, ctx);
}

/** Result of `lessonAccess`. */
export type LessonAccess =
  | { unlocked: true; reason: 'skip_test' | 'open' | 'started' | 'completed' }
  | {
      unlocked: false;
      reason: 'course_unknown' | 'course_planned' | 'stage_locked' | 'not_in_course' | 'previous_lesson' | 'lessons_missing';
      /** The lesson to complete first (`previous_lesson`). */
      requiredLessonId?: string;
    };

/**
 * Access to one lesson of a course. `kind` is the lesson's kind if it is known (the skip test is always open, even
 * when it is not listed in a course).
 */
export function lessonAccess(ctx: UnlockContext, courseId: string, lessonId: string, kind?: Lesson['kind']): LessonAccess {
  if (kind === 'skip_test') return { unlocked: true, reason: 'skip_test' };
  const course = ctx.courses.find((c) => c.id === courseId);
  if (!course) return { unlocked: false, reason: 'course_unknown' };
  if (course.status !== 'available') return { unlocked: false, reason: 'course_planned' };
  if (!isStageOpen(course.stage, ctx)) return { unlocked: false, reason: 'stage_locked' };
  const saved = ctx.progress.get(lessonId);
  const index = course.lessonIds.indexOf(lessonId);
  if (index === -1) {
    if (course.testLessonId !== lessonId) return { unlocked: false, reason: 'not_in_course' };
    if (saved?.completed) return { unlocked: true, reason: 'completed' };
    if (saved) return { unlocked: true, reason: 'started' };
    return course.lessonIds.every((id) => isLessonCompleted(ctx.progress, id))
      ? { unlocked: true, reason: 'open' }
      : { unlocked: false, reason: 'lessons_missing' };
  }
  if (saved?.completed) return { unlocked: true, reason: 'completed' };
  if (saved) return { unlocked: true, reason: 'started' };
  if (index === 0) return { unlocked: true, reason: 'open' };
  const previous = course.lessonIds[index - 1]!;
  return isLessonCompleted(ctx.progress, previous)
    ? { unlocked: true, reason: 'open' }
    : { unlocked: false, reason: 'previous_lesson', requiredLessonId: previous };
}

/** Whether a lesson (or course test) is unlocked (D-38). */
export function isUnlocked(ctx: UnlockContext, courseId: string, lessonId: string, kind?: Lesson['kind']): boolean {
  return lessonAccess(ctx, courseId, lessonId, kind).unlocked;
}

/** The stage the learner starts at: 1 when Stufe 1 was opened by the self-assessment or the skip test, else 0. */
export function startStage(ctx: UnlockContext): StageId {
  const reason = stageOpenReason(1, ctx);
  return reason === 'self_assessment' || reason === 'skip_test' ? 1 : 0;
}

/** Stage ids from the start stage upwards, then the lower stages (order in which "next lesson" is searched). */
export function stageSearchOrder(start: StageId): StageId[] {
  return [...STAGE_IDS.filter((s) => s >= start), ...STAGE_IDS.filter((s) => s < start)];
}
