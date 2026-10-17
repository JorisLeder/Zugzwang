/**
 * "Nächste Lektion" (Lernpfad highlight, dashboard P0-14): the first unlocked, not yet completed lesson or course
 * test in path order, starting at the learner's start stage.
 */
import type { CourseMeta, LessonProgress } from '@/core/lessons';
import { availableCourses, courseItemIds, isLessonCompleted, isStageOpen, isUnlocked, stageSearchOrder, startStage, type UnlockContext } from './unlock';

/** The next lesson to do. */
export interface NextLesson {
  course: CourseMeta;
  courseId: string;
  lessonId: string;
  /** `course_test` when the next item is the course's test. */
  kind: 'lesson' | 'course_test';
  /** Saved progress (a started lesson resumes at `progress.currentStep`), `null` if not started. */
  progress: LessonProgress | null;
}

/**
 * Next lesson for the learner: stages are searched from the start stage (Stufe 1 when it was opened by the
 * self-assessment or the skip test, else Stufe 0) upwards, then the lower stages; inside a stage courses by
 * `order`, inside a course its lessons and then the course test. Returns `null` when everything open is done.
 */
export function nextLessonFor(ctx: UnlockContext): NextLesson | null {
  for (const stage of stageSearchOrder(startStage(ctx))) {
    if (!isStageOpen(stage, ctx)) continue;
    for (const course of availableCourses(ctx.courses, stage)) {
      for (const lessonId of courseItemIds(course)) {
        if (isLessonCompleted(ctx.progress, lessonId)) continue;
        if (!isUnlocked(ctx, course.id, lessonId)) continue;
        return {
          course,
          courseId: course.id,
          lessonId,
          kind: lessonId === course.testLessonId && !course.lessonIds.includes(lessonId) ? 'course_test' : 'lesson',
          progress: ctx.progress.get(lessonId) ?? null,
        };
      }
    }
  }
  return null;
}

/** Next lesson inside one course after `lessonId` (for "Nächste Lektion" on the end screen), or `null`. */
export function nextInCourse(ctx: UnlockContext, course: CourseMeta, lessonId: string): string | null {
  const ids = courseItemIds(course);
  const index = ids.indexOf(lessonId);
  for (const id of index === -1 ? ids : ids.slice(index + 1)) {
    if (!isLessonCompleted(ctx.progress, id) && isUnlocked(ctx, course.id, id)) return id;
  }
  return null;
}
