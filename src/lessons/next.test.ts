import { describe, expect, it } from 'vitest';
import { nextInCourse, nextLessonFor } from './next';
import { course, progress } from './testUtils';
import { toProgressMap, type LearnerState, type UnlockContext } from './unlock';

const S0A = course('s0-a', 0, ['a1', 'a2'], { order: 1, testLessonId: 'a-test' });
const S0B = course('s0-b', 0, ['b1'], { order: 2 });
const S1A = course('s1-a', 1, ['c1', 'c2'], { order: 1 });
const S1P = course('s1-planned', 1, ['p1'], { order: 0, status: 'planned' });

function ctx(done: string[], learner: LearnerState = null, extra: Parameters<typeof progress>[] = []): UnlockContext {
  return {
    courses: [S1P, S1A, S0B, S0A],
    progress: toProgressMap([...done.map((id) => progress(id)), ...extra.map((args) => progress(...args))]),
    learner,
  };
}

describe('nextLessonFor', () => {
  it('starts with the first lesson of Stufe 0 for a new learner', () => {
    const next = nextLessonFor(ctx([]));
    expect(next).toMatchObject({ courseId: 's0-a', lessonId: 'a1', kind: 'lesson', progress: null });
  });

  it('follows the path order: lessons, then the course test, then the next course', () => {
    expect(nextLessonFor(ctx(['a1']))?.lessonId).toBe('a2');
    expect(nextLessonFor(ctx(['a1', 'a2']))).toMatchObject({ lessonId: 'a-test', kind: 'course_test' });
    expect(nextLessonFor(ctx(['a1', 'a2', 'a-test']))?.lessonId).toBe('b1');
  });

  it('continues with Stufe 1 after Stufe 0 and skips planned courses', () => {
    expect(nextLessonFor(ctx(['a1', 'a2', 'a-test', 'b1']))).toMatchObject({ courseId: 's1-a', lessonId: 'c1' });
  });

  it('starts at Stufe 1 when the self-assessment or the skip test opened it', () => {
    expect(nextLessonFor(ctx([], { selfAssessment: 'beginner', stageZeroSkipped: false }))?.lessonId).toBe('c1');
    expect(nextLessonFor(ctx([], { selfAssessment: 'newcomer', stageZeroSkipped: true }))?.lessonId).toBe('c1');
  });

  it('falls back to open Stufe-0 lessons when Stufe 1 is done', () => {
    expect(nextLessonFor(ctx(['c1', 'c2'], { selfAssessment: 'club', stageZeroSkipped: false }))?.lessonId).toBe('a1');
  });

  it('returns the saved progress of a started lesson', () => {
    const next = nextLessonFor(ctx(['a1'], null, [['a2', { completed: false, currentStep: 2 }]]));
    expect(next?.lessonId).toBe('a2');
    expect(next?.progress?.currentStep).toBe(2);
  });

  it('returns null when everything open is done', () => {
    expect(nextLessonFor(ctx(['a1', 'a2', 'a-test', 'b1', 'c1', 'c2']))).toBeNull();
    expect(nextLessonFor({ courses: [], progress: new Map(), learner: null })).toBeNull();
  });
});

describe('nextInCourse', () => {
  it('returns the next open item after a lesson, or null at the end of the course', () => {
    const c = ctx(['a1']);
    expect(nextInCourse(c, S0A, 'a1')).toBe('a2');
    expect(nextInCourse(ctx(['a1', 'a2']), S0A, 'a2')).toBe('a-test');
    expect(nextInCourse(ctx(['a1', 'a2', 'a-test']), S0A, 'a-test')).toBeNull();
  });
});
