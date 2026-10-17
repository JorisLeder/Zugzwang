/**
 * Pure helpers of the lesson pages (no React): course, stage and lesson-row states, the target of "Nächste Lektion"
 * on the end screen and the "Passende Puzzles" link.
 */
import { paths } from '@/app/paths';
import type { CourseMeta, Lesson, LessonProgress, StageId } from '@/core/lessons';
import { puzzleThemeById } from '@/core/puzzles';
import {
  availableCourses,
  isCourseCompleted,
  isCourseOpen,
  isStageCompleted,
  lessonAccess,
  nextInCourse,
  stageOpenReason,
  type LessonAccess,
  type StageOpenReason,
  type UnlockContext,
} from '@/lessons';

/** State of a course in the Lernpfad. */
export type CourseStatus = 'planned' | 'locked' | 'open' | 'completed';

/** Status of a course. */
export function courseStatus(course: CourseMeta, ctx: UnlockContext): CourseStatus {
  if (course.status === 'planned') return 'planned';
  if (!isCourseOpen(course, ctx)) return 'locked';
  return isCourseCompleted(course, ctx.progress) ? 'completed' : 'open';
}

/** State of a stage: `planned` = no available course yet ("in Vorbereitung"). */
export interface StageState {
  status: 'planned' | 'locked' | 'open' | 'completed';
  reason: StageOpenReason | null;
}

/** Status of a stage. */
export function stageState(stage: StageId, ctx: UnlockContext): StageState {
  const reason = stageOpenReason(stage, ctx);
  if (availableCourses(ctx.courses, stage).length === 0) return { status: 'planned', reason };
  if (reason === null) return { status: 'locked', reason };
  return { status: isStageCompleted(stage, ctx) ? 'completed' : 'open', reason };
}

/** State of one lesson row on the course page. */
export type LessonRowState =
  | { status: 'locked'; access: LessonAccess }
  | { status: 'new' }
  | { status: 'started'; step: number }
  | { status: 'completed'; stars: LessonProgress['stars']; score?: number };

/** Row state of a lesson (or the course test) of a course. */
export function lessonRowState(ctx: UnlockContext, course: CourseMeta, lessonId: string, lesson: Lesson | undefined): LessonRowState {
  const access = lessonAccess(ctx, course.id, lessonId, lesson?.kind);
  if (!access.unlocked) return { status: 'locked', access };
  const saved = ctx.progress.get(lessonId);
  if (saved?.completed) return { status: 'completed', stars: saved.stars, ...(saved.score !== undefined ? { score: saved.score } : {}) };
  if (saved && lesson && saved.lessonVersion === lesson.version && saved.currentStep > 0 && saved.currentStep < lesson.steps.length) {
    return { status: 'started', step: saved.currentStep };
  }
  return { status: 'new' };
}

/** Progress map with one record replaced (the just-finished run, before the live map has caught up). */
export function withProgress(ctx: UnlockContext, record: LessonProgress | null): UnlockContext {
  if (!record) return ctx;
  const progress = new Map(ctx.progress);
  const prev = progress.get(record.lessonId);
  progress.set(record.lessonId, prev?.completed && !record.completed ? prev : record);
  return { ...ctx, progress };
}

/** Target of "Nächste Lektion" after a lesson: the next open item of the course, else the course page. */
export function nextAfter(ctx: UnlockContext, course: CourseMeta | undefined, lessonId: string): { lessonId: string | null; kind: 'lesson' | 'course_test' } {
  if (!course) return { lessonId: null, kind: 'lesson' };
  const next = nextInCourse(ctx, course, lessonId);
  return { lessonId: next, kind: next !== null && next === course.testLessonId && !course.lessonIds.includes(next) ? 'course_test' : 'lesson' };
}

/** "Passende Puzzles": the first practice theme's training, or the theme list without themes. */
export function practicePuzzles(lesson: Pick<Lesson, 'practiceThemes'>): { to: string; labelDe: string | null } {
  const theme = lesson.practiceThemes[0];
  if (!theme) return { to: paths.puzzleThemes(), labelDe: null };
  return { to: paths.puzzleTheme(theme), labelDe: puzzleThemeById(theme)?.labelDe ?? null };
}
