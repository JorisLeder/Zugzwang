import { describe, expect, it } from 'vitest';
import type { LessonStep } from '@/core/lessons';
import { exerciseCount, isPassed, testResult, testScore } from './scoring';
import {
  canResume,
  completeStep,
  createLessonSession,
  goNext,
  goPrev,
  goTo,
  isReviewing,
  progressRecord,
  recordHint,
  recordMistake,
  type LessonSession,
} from './session';
import { explanation, lesson, progress, quiz } from './testUtils';

const NOW = new Date('2026-10-17T12:00:00.000Z');
const findMove: LessonStep = {
  id: 'fm',
  type: 'find_move',
  promptDe: 'Setze matt.',
  fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
  solution: [{ move: 'd1d8', children: [] }],
  acceptAnyMate: true,
  claim: { kind: 'mate', mateIn: 1 },
  hintsDe: ['Achte Reihe.'],
  explanationDe: 'Td8 ist Matt.',
};
const LESSON = lesson('l', [explanation('e1'), findMove, quiz('q1'), explanation('e2')]);
const TEST = lesson('t', [quiz('q1'), quiz('q2'), quiz('q3'), quiz('q4'), quiz('q5')], { kind: 'course_test' });

/** Completes the shown step and presses "Weiter". */
function advance(s: LessonSession, l = LESSON): LessonSession {
  return goNext(completeStep(s, l));
}

describe('test scoring', () => {
  it('score = correct first tries / exercises, pass at ≥ threshold (default 0.8)', () => {
    expect(exerciseCount(LESSON)).toBe(2);
    expect(testScore(4, 5)).toBe(0.8);
    expect(testScore(0, 0)).toBe(1);
    expect(isPassed(0.8)).toBe(true);
    expect(isPassed(0.79)).toBe(false);
    expect(testResult(TEST, 4)).toEqual({ correct: 4, total: 5, score: 0.8, threshold: 0.8, passed: true });
    expect(testResult(TEST, 3).passed).toBe(false);
    expect(testResult({ ...TEST, passThreshold: 0.6 }, 3).passed).toBe(true);
    expect(isPassed(2 / 3, 2 / 3)).toBe(true);
  });
});

describe('lesson session', () => {
  it('walks through the steps; only completed steps allow "Weiter"', () => {
    let s = createLessonSession(LESSON);
    expect(s).toMatchObject({ index: 0, done: 0, resumed: false });
    expect(goNext(s).index).toBe(0); // not completed yet
    s = advance(s);
    expect(s).toMatchObject({ index: 1, done: 1 });
    s = goPrev(s);
    expect(isReviewing(s)).toBe(true);
    expect(goNext(s).index).toBe(1);
    expect(goTo(s, 3).index).toBe(1); // cannot jump ahead of the current task
  });

  it('counts mistakes and hints only on the current task step', () => {
    let s = advance(createLessonSession(LESSON));
    s = recordMistake(recordHint(s));
    expect(s).toMatchObject({ mistakes: 1, hintsUsed: 1, taskPenalty: 2 });
    const review = recordMistake(recordHint(goPrev(s)));
    expect(review).toMatchObject({ mistakes: 1, hintsUsed: 1 });
  });

  it('finishes with stars by D-13 and writes a completed record', () => {
    let s = createLessonSession(LESSON);
    s = advance(s);
    s = recordMistake(s);
    s = advance(s);
    s = advance(s);
    s = completeStep(s, LESSON);
    expect(s.result).toEqual({ completed: true, stars: 2, mistakes: 1, hintsUsed: 0, test: null });
    const record = progressRecord(s, LESSON, NOW);
    expect(record).toEqual({
      lessonId: 'l',
      lessonVersion: 1,
      currentStep: 4,
      completed: true,
      stars: 2,
      mistakes: 1,
      hintsUsed: 0,
      updatedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
    });
    expect(goNext(s).index).toBe(4); // end screen
  });

  it('records progress after every completed step (resume point = next step)', () => {
    const s = completeStep(createLessonSession(LESSON), LESSON);
    expect(progressRecord(s, LESSON, NOW)).toMatchObject({ currentStep: 1, completed: false, stars: 0, completedAt: null });
    expect(progressRecord(s, LESSON, NOW).score).toBeUndefined();
  });

  it('resumes saved progress at the same step with its counters', () => {
    const saved = progress('l', { completed: false, currentStep: 2, mistakes: 2, hintsUsed: 1, stars: 0 });
    expect(canResume(LESSON, saved)).toBe(true);
    const s = createLessonSession(LESSON, saved);
    expect(s).toMatchObject({ index: 2, done: 2, mistakes: 2, hintsUsed: 1, resumed: true });
  });

  it('starts fresh after completion, for another lesson version and at step 0', () => {
    expect(createLessonSession(LESSON, progress('l', { completed: true, currentStep: 4 }))).toMatchObject({ index: 0, resumed: false });
    expect(canResume(LESSON, progress('l', { completed: false, currentStep: 2, lessonVersion: 2 }))).toBe(false);
    expect(canResume(LESSON, progress('l', { completed: false, currentStep: 0 }))).toBe(false);
    expect(canResume(LESSON, null)).toBe(false);
  });
});

describe('test session', () => {
  function runTest(wrongAt: number[]): LessonSession {
    let s = createLessonSession(TEST);
    for (let i = 0; i < TEST.steps.length; i++) {
      if (wrongAt.includes(i)) s = recordMistake(s);
      s = completeStep(s, TEST);
      if (i < TEST.steps.length - 1) s = goNext(s);
    }
    return s;
  }

  it('passes with 4 of 5 first tries and completes the test', () => {
    const s = runTest([2]);
    expect(s.result?.test).toMatchObject({ correct: 4, total: 5, score: 0.8, passed: true });
    expect(s.result).toMatchObject({ completed: true, stars: 2 });
    expect(progressRecord(s, TEST, NOW)).toMatchObject({ completed: true, score: 0.8, currentStep: 5 });
  });

  it('fails below the threshold: not completed, 0 stars, score stored, next run starts fresh', () => {
    const s = runTest([0, 3]);
    expect(s.result).toMatchObject({ completed: false, stars: 0, test: { correct: 3, passed: false } });
    const record = progressRecord(s, TEST, NOW);
    expect(record).toMatchObject({ completed: false, stars: 0, score: 0.6, currentStep: 5, completedAt: null });
    expect(createLessonSession(TEST, record)).toMatchObject({ index: 0, resumed: false, correctFirstTries: 0 });
  });

  it('a hint makes an exercise not correct at the first try', () => {
    let s = createLessonSession(TEST);
    s = recordHint(s);
    s = completeStep(s, TEST);
    expect(s.correctFirstTries).toBe(0);
  });

  it('stores the running score (correct so far / all exercises) and restores it on resume', () => {
    let s = createLessonSession(TEST);
    s = advance(s, TEST);
    s = advance(s, TEST);
    s = recordMistake(s);
    s = completeStep(s, TEST);
    const record = progressRecord(s, TEST, NOW);
    expect(record).toMatchObject({ currentStep: 3, score: 0.4, completed: false });
    const resumed = createLessonSession(TEST, record);
    expect(resumed).toMatchObject({ index: 3, correctFirstTries: 2, mistakes: 1, resumed: true });
  });
});
