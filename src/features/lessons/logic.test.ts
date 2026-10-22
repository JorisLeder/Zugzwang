import { describe, expect, it } from 'vitest';
import type { CourseMeta, Lesson, LessonProgress } from '@/core/lessons';
import type { UnlockContext } from '@/lessons';
import { bestResult, courseStatus, lessonRowState, nextAfter, practicePuzzles, stageState, withProgress } from './logic';

function course(id: string, stage: CourseMeta['stage'], lessonIds: string[], extra: Partial<CourseMeta> = {}): CourseMeta {
  return { id, stage, order: 1, version: 1, titleDe: id, descriptionDe: '', status: 'available', lessonIds, ...extra };
}

function progress(lessonId: string, extra: Partial<LessonProgress> = {}): LessonProgress {
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

function lesson(id: string, steps = 3, extra: Partial<Lesson> = {}): Lesson {
  return {
    id,
    courseId: 'c',
    order: 1,
    version: 1,
    kind: 'lesson',
    titleDe: id,
    summaryDe: '',
    steps: Array.from({ length: steps }, (_, i) => ({ id: `s${i}`, type: 'explanation' as const, textDe: 'T' })),
    practiceThemes: [],
    ...extra,
  };
}

const RULES = course('regeln', 0, ['r1', 'r2'], { testLessonId: 'r-test' });
const TACTICS = course('taktik', 1, ['t1']);
const LATER = course('spaeter', 1, [], { status: 'planned', order: 2 });

function ctx(list: LessonProgress[] = [], learner: UnlockContext['learner'] = null): UnlockContext {
  return { courses: [RULES, TACTICS, LATER], progress: new Map(list.map((p) => [p.lessonId, p])), learner };
}

describe('Lernpfad states', () => {
  it('stage states: open / locked / completed / planned (no available course)', () => {
    expect(stageState(0, ctx())).toEqual({ status: 'open', reason: 'always' });
    expect(stageState(1, ctx())).toEqual({ status: 'locked', reason: null });
    expect(stageState(1, ctx([], { selfAssessment: 'club', stageZeroSkipped: false }))).toEqual({ status: 'open', reason: 'self_assessment' });
    const done = ctx([progress('r1'), progress('r2'), progress('r-test')]);
    expect(stageState(0, done).status).toBe('completed');
    expect(stageState(1, done)).toEqual({ status: 'open', reason: 'previous_completed' });
    expect(stageState(3, done).status).toBe('planned');
  });

  it('course states', () => {
    expect(courseStatus(RULES, ctx())).toBe('open');
    expect(courseStatus(TACTICS, ctx())).toBe('locked');
    expect(courseStatus(LATER, ctx([], { selfAssessment: 'club', stageZeroSkipped: false }))).toBe('planned');
    expect(courseStatus(RULES, ctx([progress('r1'), progress('r2'), progress('r-test')]))).toBe('completed');
  });
});

describe('lesson rows', () => {
  it('locked, new, started (resume step) and completed with stars and score', () => {
    expect(lessonRowState(ctx(), RULES, 'r2', lesson('r2')).status).toBe('locked');
    expect(lessonRowState(ctx(), RULES, 'r1', lesson('r1'))).toEqual({ status: 'new' });
    expect(lessonRowState(ctx([progress('r1', { completed: false, currentStep: 2 })]), RULES, 'r1', lesson('r1'))).toEqual({
      status: 'started',
      step: 2,
    });
    // A saved step of another content version does not resume.
    expect(lessonRowState(ctx([progress('r1', { completed: false, currentStep: 2, lessonVersion: 0 })]), RULES, 'r1', lesson('r1'))).toEqual({
      status: 'new',
    });
    // A mistake or hint on the first step (currentStep 0, stepPenalty > 0) is in progress too (LC2-3), as in `canResume`.
    expect(lessonRowState(ctx([progress('r1', { completed: false, currentStep: 0, stepPenalty: 1 })]), RULES, 'r1', lesson('r1'))).toEqual({
      status: 'started',
      step: 0,
    });
    expect(lessonRowState(ctx([progress('r1', { completed: false, currentStep: 0 })]), RULES, 'r1', lesson('r1'))).toEqual({ status: 'new' });
    // A failed test (all steps done, not passed) is not in progress.
    expect(lessonRowState(ctx([progress('r1', { completed: false, currentStep: 3 })]), RULES, 'r1', lesson('r1'))).toEqual({ status: 'new' });
    const all = ctx([progress('r1', { stars: 2 }), progress('r2'), progress('r-test', { score: 0.8 })]);
    expect(lessonRowState(all, RULES, 'r1', lesson('r1'))).toEqual({ status: 'completed', stars: 2 });
    expect(lessonRowState(all, RULES, 'r-test', lesson('r-test', 3, { kind: 'course_test' }))).toEqual({ status: 'completed', stars: 3, score: 0.8 });
  });
});

describe('end screen', () => {
  it('"Nächste Lektion": next lesson of the course, then the course test, else nothing', () => {
    expect(nextAfter(ctx([progress('r1')]), RULES, 'r1')).toEqual({ lessonId: 'r2', kind: 'lesson' });
    expect(nextAfter(ctx([progress('r1'), progress('r2')]), RULES, 'r2')).toEqual({ lessonId: 'r-test', kind: 'course_test' });
    expect(nextAfter(ctx([progress('r1'), progress('r2'), progress('r-test')]), RULES, 'r-test').lessonId).toBeNull();
    expect(nextAfter(ctx(), undefined, 'x').lessonId).toBeNull();
  });

  it('withProgress overlays the just-finished run but never downgrades a completed lesson', () => {
    const base = ctx([progress('r1')]);
    expect(withProgress(base, progress('r2')).progress.get('r2')?.completed).toBe(true);
    expect(withProgress(base, progress('r1', { completed: false })).progress.get('r1')?.completed).toBe(true);
    expect(withProgress(base, null)).toBe(base);
  });

  it('bestResult keeps the completed run with the most stars (LC2-5)', () => {
    const three = progress('r1', { stars: 3 });
    const one = progress('r1', { stars: 1 });
    expect(bestResult(null, null)).toBeNull();
    expect(bestResult(null, one)).toBe(one);
    expect(bestResult(three, null)).toBe(three);
    expect(bestResult(three, one)).toBe(three);
    expect(bestResult(one, three)).toBe(three);
    expect(bestResult(progress('r1', { completed: false }), one)).toBe(one);
  });

  it('"Passende Puzzles": training of the first practice theme, or the theme list', () => {
    expect(practicePuzzles({ practiceThemes: ['backRankMate', 'mateIn1'] })).toEqual({
      to: '/puzzles/themes/backRankMate',
      labelDe: expect.any(String),
    });
    expect(practicePuzzles({ practiceThemes: [] })).toEqual({ to: '/puzzles/themes', labelDe: null });
  });
});
