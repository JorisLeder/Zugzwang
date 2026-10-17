import { describe, expect, it } from 'vitest';
import type { LessonProgress } from '@/core/lessons';
import { course, progress } from './testUtils';
import {
  courseLessonCounts,
  courseStars,
  isCourseCompleted,
  isCourseOpen,
  isStageCompleted,
  isStageOpen,
  isUnlocked,
  lessonAccess,
  stageOpenReason,
  startStage,
  toProgressMap,
  type LearnerState,
  type UnlockContext,
} from './unlock';

const S0A = course('s0-a', 0, ['a1', 'a2'], { order: 1, testLessonId: 'a-test' });
const S0B = course('s0-b', 0, ['b1'], { order: 2 });
const S1A = course('s1-a', 1, ['c1', 'c2', 'c3'], { order: 1, testLessonId: 'c-test' });
const S1P = course('s1-planned', 1, [], { order: 9, status: 'planned' });
const S2A = course('s2-a', 2, ['d1'], { order: 1 });
const COURSES = [S0A, S0B, S1A, S1P, S2A];

function ctx(done: Array<string | LessonProgress> = [], learner: LearnerState = null): UnlockContext {
  return {
    courses: COURSES,
    progress: toProgressMap(done.map((d) => (typeof d === 'string' ? progress(d) : d))),
    learner,
  };
}

const STAGE_ZERO_DONE = ['a1', 'a2', 'a-test', 'b1'];

describe('stages (D-38)', () => {
  it('Stufe 0 is always open', () => {
    expect(isStageOpen(0, ctx())).toBe(true);
    expect(stageOpenReason(0, ctx())).toBe('always');
  });

  it('Stufe 1 is locked for a new learner and for the self-assessment "Neuling"', () => {
    expect(isStageOpen(1, ctx())).toBe(false);
    expect(isStageOpen(1, ctx([], { selfAssessment: 'newcomer', stageZeroSkipped: false }))).toBe(false);
    expect(isStageOpen(1, ctx([], { selfAssessment: null, stageZeroSkipped: false }))).toBe(false);
  });

  it.each(['beginner', 'club', 'advanced'] as const)('Stufe 1 opens with the self-assessment %s', (selfAssessment) => {
    const c = ctx([], { selfAssessment, stageZeroSkipped: false });
    expect(isStageOpen(1, c)).toBe(true);
    expect(stageOpenReason(1, c)).toBe('self_assessment');
  });

  it('Stufe 1 opens after the passed skip test', () => {
    const c = ctx([], { selfAssessment: 'newcomer', stageZeroSkipped: true });
    expect(isStageOpen(1, c)).toBe(true);
    expect(stageOpenReason(1, c)).toBe('skip_test');
  });

  it('Stufe 1 opens when Stufe 0 is completed (all courses incl. the course test)', () => {
    expect(isStageOpen(1, ctx(['a1', 'a2', 'b1']))).toBe(false); // course test of s0-a missing
    const c = ctx(STAGE_ZERO_DONE);
    expect(isStageCompleted(0, c)).toBe(true);
    expect(isStageOpen(1, c)).toBe(true);
    expect(stageOpenReason(1, c)).toBe('previous_completed');
  });

  it('a stage without available courses is never completed', () => {
    const c: UnlockContext = { courses: [S1A, S1P], progress: new Map(), learner: null };
    expect(isStageCompleted(0, c)).toBe(false);
    expect(isStageOpen(1, c)).toBe(false);
  });

  it('Stufe 2 opens only when Stufe 1 is open and completed', () => {
    const learner: LearnerState = { selfAssessment: 'club', stageZeroSkipped: false };
    expect(isStageOpen(2, ctx([], learner))).toBe(false);
    expect(isStageOpen(2, ctx(['c1', 'c2', 'c3'], learner))).toBe(false); // course test missing
    expect(isStageOpen(2, ctx(['c1', 'c2', 'c3', 'c-test'], learner))).toBe(true);
    // Completed Stufe-1 content does not help while Stufe 1 itself is locked.
    expect(isStageOpen(2, ctx(['c1', 'c2', 'c3', 'c-test']))).toBe(false);
  });

  it('startStage is 1 when Stufe 1 was opened by the self-assessment or the skip test', () => {
    expect(startStage(ctx())).toBe(0);
    expect(startStage(ctx([], { selfAssessment: 'beginner', stageZeroSkipped: false }))).toBe(1);
    expect(startStage(ctx([], { selfAssessment: 'newcomer', stageZeroSkipped: true }))).toBe(1);
    expect(startStage(ctx(STAGE_ZERO_DONE))).toBe(0);
  });
});

describe('courses', () => {
  it('planned courses are never open', () => {
    expect(isCourseOpen(S1P, ctx([], { selfAssessment: 'advanced', stageZeroSkipped: true }))).toBe(false);
  });

  it('a course is completed when all lessons and the course test are completed', () => {
    const p = toProgressMap(['a1', 'a2'].map((id) => progress(id)));
    expect(isCourseCompleted(S0A, p)).toBe(false);
    expect(isCourseCompleted(S0A, toProgressMap(['a1', 'a2', 'a-test'].map((id) => progress(id))))).toBe(true);
    expect(isCourseCompleted(S0B, toProgressMap([progress('b1')]))).toBe(true);
    expect(isCourseCompleted(S0B, toProgressMap([progress('b1', { completed: false })]))).toBe(false);
  });

  it('counts lessons and stars without the course test', () => {
    const p = toProgressMap([progress('a1', { stars: 2 }), progress('a-test', { stars: 3 })]);
    expect(courseLessonCounts(S0A, p)).toEqual({ done: 1, total: 2 });
    expect(courseStars(S0A, p)).toEqual({ earned: 2, max: 6 });
  });
});

describe('lessons', () => {
  it('the first lesson of an open course is unlocked, the next ones sequentially', () => {
    const c = ctx();
    expect(isUnlocked(c, 's0-a', 'a1')).toBe(true);
    expect(lessonAccess(c, 's0-a', 'a2')).toEqual({ unlocked: false, reason: 'previous_lesson', requiredLessonId: 'a1' });
    expect(isUnlocked(ctx(['a1']), 's0-a', 'a2')).toBe(true);
  });

  it('every course of an open stage starts unlocked (courses are not chained)', () => {
    expect(isUnlocked(ctx(), 's0-b', 'b1')).toBe(true);
  });

  it('a started or completed lesson stays open', () => {
    expect(lessonAccess(ctx([progress('a2', { completed: false })]), 's0-a', 'a2')).toEqual({ unlocked: true, reason: 'started' });
    expect(lessonAccess(ctx(['a2']), 's0-a', 'a2')).toEqual({ unlocked: true, reason: 'completed' });
  });

  it('the course test unlocks after all lessons', () => {
    expect(lessonAccess(ctx(['a1']), 's0-a', 'a-test')).toEqual({ unlocked: false, reason: 'lessons_missing' });
    expect(isUnlocked(ctx(['a1', 'a2']), 's0-a', 'a-test')).toBe(true);
  });

  it('lessons of a locked stage are locked', () => {
    expect(lessonAccess(ctx(), 's1-a', 'c1')).toEqual({ unlocked: false, reason: 'stage_locked' });
    expect(isUnlocked(ctx([], { selfAssessment: 'beginner', stageZeroSkipped: false }), 's1-a', 'c1')).toBe(true);
  });

  it('unknown courses, planned courses and foreign lesson ids are locked', () => {
    expect(lessonAccess(ctx(), 'nope', 'x')).toEqual({ unlocked: false, reason: 'course_unknown' });
    expect(lessonAccess(ctx([], { selfAssessment: 'club', stageZeroSkipped: false }), 's1-planned', 'x')).toEqual({
      unlocked: false,
      reason: 'course_planned',
    });
    expect(lessonAccess(ctx(), 's0-a', 'b1')).toEqual({ unlocked: false, reason: 'not_in_course' });
  });

  it('the skip test is always open', () => {
    expect(isUnlocked(ctx(), 's1-a', 'skip', 'skip_test')).toBe(true);
    expect(isUnlocked(ctx(), 'anywhere', 'skip', 'skip_test')).toBe(true);
  });
});
