import { describe, expect, it } from 'vitest';
import type { Game } from '@/core/games';
import type { CourseMeta, LessonProgress } from '@/core/lessons';
import type { Profile } from '@/core/profile';
import type { PuzzleAttempt } from '@/core/puzzles';
import { courseOfLesson, dailyGoalProgress, isLessonInProgress, lessonResumeKind, lastPuzzleTarget, lastTrainedTheme, resumeTargets } from './logic';
import { onboardingDecision } from './useDashboardData';

const COURSE: CourseMeta = {
  id: 'c1',
  stage: 1,
  order: 1,
  titleDe: 'Kurs 1',
  descriptionDe: '',
  lessonIds: ['l1', 'l2'],
  testLessonId: 't1',
  status: 'available',
} as unknown as CourseMeta;

function game(id: string, updatedAt: string, patch: Partial<Game> = {}): Game {
  return {
    id,
    source: 'bot',
    externalId: null,
    botId: 'pip',
    userColor: 'w',
    assistance: 'training',
    timeControl: { kind: 'none' },
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pgn: '',
    headers: {},
    status: 'active',
    result: '*',
    endReason: null,
    origin: { type: 'new' },
    activeDeviceId: null,
    activeHeartbeatAt: null,
    ratingBefore: null,
    ratingAfter: null,
    createdAt: updatedAt,
    updatedAt,
    finishedAt: null,
    ...patch,
  };
}

function progress(lessonId: string, currentStep: number, updatedAt: string, completed = false): LessonProgress {
  return { lessonId, lessonVersion: 1, currentStep, completed, stars: completed ? 2 : 0, mistakes: 0, hintsUsed: 0, updatedAt, completedAt: completed ? updatedAt : null };
}

function attempt(mode: PuzzleAttempt['mode'], themes: string[], createdAt: string): PuzzleAttempt {
  return { id: createdAt, puzzleId: 'p', mode, solved: true, firstTry: true, hintsUsed: 0, solutionShown: false, timeMs: 1000, themes, puzzleRating: 1000, createdAt };
}

describe('resume targets', () => {
  it('orders running game, lesson in progress, then the last puzzle mode', () => {
    const targets = resumeTargets({
      activeGames: [game('old', '2026-01-01T10:00:00Z'), game('new', '2026-01-02T10:00:00Z'), game('pgn', '2026-01-03T10:00:00Z', { source: 'pgn' })],
      lessonProgress: [progress('l1', 2, '2026-01-01T09:00:00Z'), progress('l2', 0, '2026-01-02T09:00:00Z'), progress('t1', 3, '2026-01-03T09:00:00Z', true)],
      courses: [COURSE],
      attempts: [attempt('rated', ['fork'], '2026-01-02T08:00:00Z')],
    });
    expect(targets.map((t) => t.kind)).toEqual(['game', 'lesson', 'puzzles']);
    expect(targets[0]).toMatchObject({ kind: 'game', game: { id: 'new' } });
    expect(targets[1]).toMatchObject({ kind: 'lesson', lessonId: 'l1', course: { id: 'c1' } });
    expect(targets[2]).toMatchObject({ kind: 'puzzles', mode: 'rated', themeId: null });
  });

  it('is empty without any activity and skips lessons of unknown or planned courses', () => {
    expect(resumeTargets({ activeGames: [], lessonProgress: [], courses: [COURSE], attempts: [] })).toEqual([]);
    const planned = { ...COURSE, status: 'planned' } as CourseMeta;
    expect(resumeTargets({ activeGames: [], lessonProgress: [progress('l1', 1, '2026-01-01T00:00:00Z')], courses: [planned], attempts: [] })).toEqual([]);
    expect(resumeTargets({ activeGames: [], lessonProgress: [progress('x', 1, '2026-01-01T00:00:00Z')], courses: [COURSE], attempts: [] })).toEqual([]);
  });

  it('finds the course of a lesson or its test and detects lessons in progress', () => {
    expect(courseOfLesson([COURSE], 't1')?.id).toBe('c1');
    expect(courseOfLesson([COURSE], 'nope')).toBeUndefined();
    expect(isLessonInProgress(progress('l1', 0, 'x'))).toBe(false);
    expect(isLessonInProgress(progress('l1', 2, 'x'))).toBe(true);
    expect(isLessonInProgress(progress('l1', 2, 'x', true))).toBe(false);
    // A mistake or hint on the first step counts as started (LC2-4, same rule as the lesson page).
    expect(isLessonInProgress({ ...progress('l1', 0, 'x'), stepPenalty: 1 })).toBe(true);
  });

  it('resumes theme training with the theme shared by the latest run', () => {
    const attempts = [
      attempt('theme', ['fork', 'short', 'middlegame'], '2026-01-03T00:00:00Z'),
      attempt('theme', ['fork', 'pin'], '2026-01-02T00:00:00Z'),
      attempt('theme', ['skewer'], '2026-01-01T00:00:00Z'),
    ];
    expect(lastTrainedTheme(attempts)).toBe('fork');
    expect(lastPuzzleTarget(attempts)).toMatchObject({ mode: 'theme', themeId: 'fork' });
    expect(lastPuzzleTarget([attempt('learning', [], '2026-01-01T00:00:00Z')])).toMatchObject({ mode: 'learning', themeId: null });
    expect(lastPuzzleTarget([attempt('daily', [], '2026-01-01T00:00:00Z')])).toMatchObject({ mode: 'hub' });
    expect(lastPuzzleTarget([])).toBeNull();
  });
});

describe('failed course test on the dashboard (LC2-4)', () => {
  const test3 = { version: 1, steps: [{}, {}, {}] } as unknown as Parameters<typeof lessonResumeKind>[0];

  it('excludes a failed test (all steps done, not passed) from "in progress" once the lesson is known', () => {
    const failed = { ...progress('t1', 3, 'x'), score: 0.5 };
    expect(isLessonInProgress(failed, test3)).toBe(false);
    expect(isLessonInProgress(progress('t1', 2, 'x'), test3)).toBe(true);
    expect(isLessonInProgress({ ...progress('t1', 0, 'x'), stepPenalty: 2 }, test3)).toBe(true);
    expect(isLessonInProgress(progress('t1', 1, 'x', true), test3)).toBe(false);
  });

  it('tells resume, retry of a failed test and restart after a content change apart', () => {
    expect(lessonResumeKind(test3, progress('t1', 2, 'x'))).toBe('resume');
    expect(lessonResumeKind(test3, { ...progress('t1', 3, 'x'), score: 0.5 })).toBe('retry_test');
    expect(lessonResumeKind(test3, { ...progress('t1', 2, 'x'), lessonVersion: 0 })).toBe('restart');
  });
});

describe('daily goal progress', () => {
  it('rounds minutes down, caps the fraction and reports what is missing', () => {
    expect(dailyGoalProgress(12.7, 20)).toEqual({ minutes: 12, goal: 20, fraction: 0.6, reached: false, remaining: 8 });
    expect(dailyGoalProgress(25, 20)).toMatchObject({ fraction: 1, reached: true, remaining: 0 });
    expect(dailyGoalProgress(null, 30)).toMatchObject({ minutes: 0, fraction: 0, remaining: 30 });
    expect(dailyGoalProgress(5, 0)).toMatchObject({ reached: true, fraction: 1 });
  });
});

describe('onboarding decision', () => {
  const profile = (onboardingCompleted: boolean) => ({ onboardingCompleted }) as Profile;
  it('redirects only once the profile is known and the onboarding is open', () => {
    expect(onboardingDecision(undefined, true)).toBe('loading');
    expect(onboardingDecision(null, false)).toBe('loading');
    expect(onboardingDecision(null, true)).toBe('onboarding');
    expect(onboardingDecision(profile(false), true)).toBe('onboarding');
    expect(onboardingDecision(profile(true), false)).toBe('ready');
  });
});
