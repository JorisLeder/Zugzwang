/** Builders for the lesson unit tests (not part of the public API). */
import type { CourseMeta, Lesson, LessonProgress, LessonStep, StageId } from '@/core/lessons';

/** A course with defaults. */
export function course(id: string, stage: StageId, lessonIds: string[], extra: Partial<CourseMeta> = {}): CourseMeta {
  return {
    id,
    stage,
    order: 1,
    version: 1,
    titleDe: `Kurs ${id}`,
    descriptionDe: 'Beschreibung',
    status: 'available',
    lessonIds,
    ...extra,
  };
}

/** Saved progress with defaults (completed → 3 stars). */
export function progress(lessonId: string, extra: Partial<LessonProgress> = {}): LessonProgress {
  const completed = extra.completed ?? true;
  return {
    lessonId,
    lessonVersion: 1,
    currentStep: completed ? 3 : 1,
    completed,
    stars: completed ? 3 : 0,
    mistakes: 0,
    hintsUsed: 0,
    updatedAt: '2026-10-17T10:00:00.000Z',
    completedAt: completed ? '2026-10-17T10:00:00.000Z' : null,
    ...extra,
  };
}

/** Explanation step. */
export function explanation(id: string): LessonStep {
  return { id, type: 'explanation', textDe: 'Text' };
}

/** Quiz step with one correct option `a`. */
export function quiz(id: string): LessonStep {
  return {
    id,
    type: 'quiz',
    questionDe: 'Frage?',
    options: [
      { id: 'a', textDe: 'A', correct: true },
      { id: 'b', textDe: 'B', correct: false },
    ],
  };
}

/** A lesson with defaults. */
export function lesson(id: string, steps: LessonStep[], extra: Partial<Lesson> = {}): Lesson {
  return {
    id,
    courseId: 'c',
    order: 1,
    version: 1,
    kind: 'lesson',
    titleDe: `Lektion ${id}`,
    summaryDe: 'Zusammenfassung',
    steps,
    practiceThemes: [],
    ...extra,
  };
}
