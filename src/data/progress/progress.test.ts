import { describe, expect, it } from 'vitest';
import type { Game } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import { DEFAULT_SETTINGS, type Profile } from '@/core/profile';
import { MIN_PUZZLE_RATING } from '@/core/rating';
import { updateGlicko2 } from '@/lib/rating';
import {
  addToDay,
  applyThemeStats,
  botOpponentElo,
  computeStreak,
  defaultRating,
  emptyDay,
  gameScore,
  isRatedBotGame,
  lessonStepsGained,
  maxDay,
  mergeGame,
  mergeLessonProgress,
  mergeProfile,
  mergeSettings,
  puzzleScore,
  rateBotGame,
  ratePuzzleAttempt,
} from '.';

const lp = (o: Partial<LessonProgress>): LessonProgress => ({
  lessonId: 'l1',
  lessonVersion: 1,
  currentStep: 0,
  completed: false,
  stars: 0,
  mistakes: 0,
  hintsUsed: 0,
  updatedAt: '2026-10-16T10:00:00.000Z',
  completedAt: null,
  ...o,
});

describe('rating rules', () => {
  it('puzzle score: solved without hint and without solution', () => {
    expect(puzzleScore({ solved: true, hintsUsed: 0, solutionShown: false })).toBe(1);
    expect(puzzleScore({ solved: true, hintsUsed: 1, solutionShown: false })).toBe(0);
    expect(puzzleScore({ solved: true, hintsUsed: 0, solutionShown: true })).toBe(0);
    expect(puzzleScore({ solved: false, hintsUsed: 0, solutionShown: false })).toBe(0);
  });

  it('rates a puzzle attempt with Glicko-2 vs the puzzle rating/RD (default RD 80)', () => {
    const before = { ...defaultRating('puzzle', 'x'), rating: 600 };
    const next = ratePuzzleAttempt(before, { solved: true, hintsUsed: 0, solutionShown: false, puzzleRating: 700 }, 0, 't', true);
    const expected = updateGlicko2(before, [{ opponentRating: 700, opponentRd: 80, score: 1 }]);
    expect(next).toMatchObject({ rating: expected.rating, rd: expected.rd, gamesCount: 1, updatedAt: 't', provisional: true });
  });

  it('puzzle rating never falls below MIN_PUZZLE_RATING (beginner 400/RD 350 failing 6 easy puzzles)', () => {
    let r = { ...defaultRating('puzzle', 'x'), rating: 400, rd: 350 };
    for (let i = 0; i < 6; i += 1) {
      r = ratePuzzleAttempt(r, { solved: false, hintsUsed: 0, solutionShown: false, puzzleRating: 150 }, 80, 't');
      expect(r.rating).toBeGreaterThanOrEqual(MIN_PUZZLE_RATING);
    }
    const low = { ...defaultRating('puzzle', 'x'), rating: 105, rd: 350 };
    expect(ratePuzzleAttempt(low, { solved: false, hintsUsed: 0, solutionShown: false, puzzleRating: 100 }, 80, 't').rating).toBe(MIN_PUZZLE_RATING);
  });

  it('bot rating uses the same floor', () => {
    const g = { source: 'bot', assistance: 'competition', userColor: 'w', headers: { BlackElo: '100' } } as Pick<Game, 'source' | 'assistance' | 'userColor' | 'headers'>;
    const before = { ...defaultRating('bot', 'x'), rating: 110, rd: 350 };
    expect(rateBotGame(before, g, '0-1', 't')!.rating).toBe(MIN_PUZZLE_RATING);
  });

  it('bot rating: competition bot games only, opponent = bot Elo from the headers with RD 50', () => {
    const g = { source: 'bot', assistance: 'competition', userColor: 'b', headers: { WhiteElo: '1200' } } as Pick<Game, 'source' | 'assistance' | 'userColor' | 'headers'>;
    expect(botOpponentElo(g)).toBe(1200);
    expect(gameScore('0-1', 'b')).toBe(1);
    expect(gameScore('1-0', 'b')).toBe(0);
    expect(gameScore('1/2-1/2', 'w')).toBe(0.5);
    const before = { ...defaultRating('bot', 'x'), rating: 1000 };
    const next = rateBotGame(before, g, '1/2-1/2', 't')!;
    expect(next.rating).toBeCloseTo(updateGlicko2(before, [{ opponentRating: 1200, opponentRd: 50, score: 0.5 }]).rating, 9);
    expect(isRatedBotGame({ ...g, assistance: 'coach' }, '1-0')).toBe(false);
    expect(isRatedBotGame({ ...g, source: 'pgn' }, '1-0')).toBe(false);
    expect(isRatedBotGame(g, '*')).toBe(false);
    expect(isRatedBotGame({ ...g, headers: {} }, '1-0')).toBe(false);
  });

  it('theme stats: rated/learning/theme modes; success = first try, solved, no help', () => {
    const current = new Map([['fork', { theme: 'fork', attempts: 2, successes: 1 }]]);
    const base = { solved: true, firstTry: true, hintsUsed: 0 as const, solutionShown: false, puzzleRating: 500, themes: ['fork', 'pin', 'fork'] };
    expect(applyThemeStats(current, { ...base, mode: 'rated' })).toEqual([
      { theme: 'fork', attempts: 3, successes: 2 },
      { theme: 'pin', attempts: 1, successes: 1 },
    ]);
    expect(applyThemeStats(current, { ...base, mode: 'learning', firstTry: false })[0]).toEqual({ theme: 'fork', attempts: 3, successes: 1 });
    expect(applyThemeStats(current, { ...base, mode: 'demo' })).toEqual([]);
    expect(applyThemeStats(current, { ...base, mode: 'rush_3' })).toEqual([]);
  });
});

describe('merge rules', () => {
  it('lesson progress: furthest wins (max step, completed OR, max stars)', () => {
    const done = lp({ currentStep: 5, completed: true, stars: 2, completedAt: '2026-10-15T00:00:00.000Z', mistakes: 1 });
    const behind = lp({ currentStep: 7, stars: 3, mistakes: 4, updatedAt: '2026-10-17T00:00:00.000Z' });
    const m = mergeLessonProgress(done, behind);
    expect(m).toMatchObject({ currentStep: 7, completed: true, stars: 3, completedAt: '2026-10-15T00:00:00.000Z', mistakes: 1, updatedAt: '2026-10-17T00:00:00.000Z' });
    expect(mergeLessonProgress(behind, done)).toMatchObject({ currentStep: 7, completed: true, stars: 3 });
    expect(mergeLessonProgress(undefined, behind, 'now').updatedAt).toBe('now');
    expect(lessonStepsGained(lp({ currentStep: 2 }), lp({ currentStep: 5, completed: true }))).toBe(4);
    expect(lessonStepsGained(lp({ currentStep: 5 }), lp({ currentStep: 5 }))).toBe(0);
  });

  it('lesson progress: completed twice keeps the best score (LC-2)', () => {
    const best = lp({ completed: true, currentStep: 7, stars: 3, score: 1, completedAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' });
    const worse = lp({ completed: true, currentStep: 7, stars: 1, score: 6 / 7, completedAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z' });
    expect(mergeLessonProgress(best, worse).score).toBe(1);
    expect(mergeLessonProgress(worse, best).score).toBe(1);
    expect(mergeLessonProgress(lp({ completed: true, currentStep: 7 }), worse).score).toBe(6 / 7);
    expect(mergeLessonProgress(lp({ completed: true, currentStep: 7 }), lp({ completed: true, currentStep: 7 })).score).toBeUndefined();
  });

  it('lesson progress: a retry after a failed test replaces the failed run (LC-4)', () => {
    const failed = lp({ currentStep: 8, score: 0, mistakes: 7, hintsUsed: 2, updatedAt: '2026-10-16T10:00:00.000Z' });
    const retry = lp({ currentStep: 4, score: 4 / 7, mistakes: 0, hintsUsed: 0, updatedAt: '2026-10-16T11:00:00.000Z' });
    expect(mergeLessonProgress(failed, retry)).toMatchObject({ currentStep: 4, score: 4 / 7, mistakes: 0, hintsUsed: 0, completed: false });
    // The remote copy of the failed run (older) cannot override the newer local retry (applyRemote merges (local, remote)).
    expect(mergeLessonProgress(retry, failed)).toMatchObject({ currentStep: 4, score: 4 / 7, mistakes: 0, hintsUsed: 0 });
    // The retry's score may be undefined (not a test record); it still wins wholesale.
    expect(mergeLessonProgress(failed, { ...retry, score: undefined }).score).toBeUndefined();
    // Ordinary lessons (no score) and an older record that is not a failed run are max-merged as before.
    const plain = lp({ currentStep: 6, updatedAt: '2026-10-16T10:00:00.000Z' });
    expect(mergeLessonProgress(plain, lp({ currentStep: 2, updatedAt: '2026-10-16T11:00:00.000Z' })).currentStep).toBe(6);
    // A completed record is never replaced by a retry.
    expect(mergeLessonProgress(lp({ completed: true, currentStep: 8, stars: 2, score: 0.9 }), retry)).toMatchObject({ completed: true, currentStep: 8, stars: 2 });
  });

  it('lesson progress: stepPenalty stays when the other copy (server) does not carry it', () => {
    const local = lp({ currentStep: 3, mistakes: 1, stepPenalty: 1, updatedAt: '2026-10-16T11:00:00.000Z' });
    const remote = lp({ currentStep: 3, mistakes: 1, updatedAt: '2026-10-16T11:00:00.000Z' });
    expect(mergeLessonProgress(local, remote).stepPenalty).toBe(1);
    expect(mergeLessonProgress(local, lp({ currentStep: 4 })).stepPenalty).toBeUndefined();
  });

  it('settings and profile: last writer wins', () => {
    const older = { ...DEFAULT_SETTINGS, sound: false, updatedAt: '2026-10-16T10:00:00.000Z' };
    const newer = { ...DEFAULT_SETTINGS, notation: 'en' as const, updatedAt: '2026-10-16T11:00:00.000Z' };
    expect(mergeSettings(older, newer)).toEqual(newer);
    expect(mergeSettings(newer, older)).toEqual(newer);
    const p: Profile = { id: 'u', displayName: 'A', settings: older, dailyGoalMinutes: 10, selfAssessment: null, onboardingCompleted: false, stageZeroSkipped: false, timeZone: 'Europe/Berlin', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-10-16T12:00:00.000Z' };
    const q: Profile = { ...p, displayName: 'B', settings: newer, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-10-16T09:00:00.000Z' };
    expect(mergeProfile(p, q)).toMatchObject({ displayName: 'A', settings: newer, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-10-16T12:00:00.000Z' });
    expect(mergeProfile(null, q)).toEqual(q);
  });

  it('games: newer wins, finished stays finished, device fields by the newer heartbeat', () => {
    const base = { id: 'g', status: 'active', updatedAt: '2026-10-16T10:00:00.000Z', createdAt: '2026-10-16T09:00:00.000Z', activeDeviceId: 'a', activeHeartbeatAt: '2026-10-16T10:00:00.000Z', pgn: '' } as Game;
    const finished = { ...base, status: 'finished', updatedAt: '2026-10-16T10:05:00.000Z', pgn: '1-0', activeHeartbeatAt: '2026-10-16T09:59:00.000Z', activeDeviceId: 'b' } as Game;
    const lateHeartbeat = { ...base, updatedAt: '2026-10-16T10:10:00.000Z', activeDeviceId: 'c', activeHeartbeatAt: '2026-10-16T10:10:00.000Z' } as Game;
    const m = mergeGame(finished, lateHeartbeat);
    expect(m).toMatchObject({ status: 'finished', pgn: '1-0', activeDeviceId: 'c', updatedAt: '2026-10-16T10:10:00.000Z' });
    expect(mergeGame(base, finished)).toMatchObject({ status: 'finished', activeDeviceId: 'a' });
  });
});

describe('daily activity and streak (D-14)', () => {
  it('adds counters and recomputes the goal; maxDay merges field-wise', () => {
    const d = addToDay(undefined, '2026-10-16', { minutes: 15, puzzles: 2 }, 20);
    expect(d).toEqual({ date: '2026-10-16', minutes: 15, puzzles: 2, games: 0, lessons: 0, goalReached: false });
    expect(addToDay(d, d.date, { minutes: 5 }, 20).goalReached).toBe(true);
    expect(maxDay({ ...emptyDay('x'), minutes: 3, games: 2 }, { ...emptyDay('x'), minutes: 25, puzzles: 1 }, 20)).toEqual({ date: 'x', minutes: 25, puzzles: 1, games: 2, lessons: 0, goalReached: true });
  });

  it('counts consecutive training days ending today or yesterday', () => {
    const day = (date: string, puzzles = 1) => ({ ...emptyDay(date), puzzles });
    const days = [day('2026-10-10'), day('2026-10-11'), day('2026-10-12'), day('2026-10-14'), day('2026-10-15'), day('2026-10-13', 0)];
    expect(computeStreak(days, '2026-10-16')).toEqual({ current: 2, trainedToday: false, longest: 3 });
    expect(computeStreak([...days, day('2026-10-16')], '2026-10-16')).toEqual({ current: 3, trainedToday: true, longest: 3 });
    expect(computeStreak(days, '2026-10-17').current).toBe(0);
    expect(computeStreak([], '2026-10-17')).toEqual({ current: 0, trainedToday: false, longest: 0 });
    // Across a month boundary.
    expect(computeStreak([day('2026-09-30'), day('2026-10-01')], '2026-10-01').current).toBe(2);
  });
});
