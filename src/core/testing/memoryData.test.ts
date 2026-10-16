import { describe, expect, it } from 'vitest';
import { updateGlicko2 } from '@/lib/rating';
import { START_FEN } from '../chess';
import type { Game } from '../games';
import { movesFromEvents } from '../games';
import { FIXTURE_PUZZLES } from './fixtures';
import { createMemoryDataServices } from './memoryData';

const fixedNow = () => new Date('2026-10-16T10:00:00Z');

function newGame(overrides: Partial<Game> = {}): Omit<Game, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    source: 'bot',
    externalId: null,
    botId: 'fixture-bot-easy',
    userColor: 'w',
    assistance: 'competition',
    timeControl: { kind: 'none' },
    startFen: START_FEN,
    pgn: '',
    headers: { White: 'Du', Black: 'Testbot', BlackElo: '400' },
    status: 'active',
    result: '*',
    endReason: null,
    origin: { type: 'new' },
    activeDeviceId: null,
    activeHeartbeatAt: null,
    ratingBefore: null,
    ratingAfter: null,
    finishedAt: null,
    ...overrides,
  };
}

describe('createMemoryDataServices – profile and settings', () => {
  it('has no profile until written; updateSettings creates one and observers update', async () => {
    const data = createMemoryDataServices({ now: fixedNow });
    expect(await data.repos.profile.get()).toBeNull();
    const seen: Array<string | undefined> = [];
    const off = data.repos.profile.observe().subscribe((p) => seen.push(p?.settings.notation));
    const s = await data.repos.profile.updateSettings({ notation: 'en' });
    off();
    expect(s.notation).toBe('en');
    expect(s.updatedAt).toBe('2026-10-16T10:00:00.000Z');
    expect(seen).toEqual([undefined, 'en']);
    expect((await data.repos.profile.get())?.settings.theme).toBe('dark');
  });

  it('saveProfile merges and keeps the newer settings (LWW)', async () => {
    const data = createMemoryDataServices({ now: fixedNow, profile: { displayName: 'Lea' } });
    await data.repos.profile.updateSettings({ sound: false });
    const stale = { ...(await data.repos.profile.get())!.settings, sound: true, updatedAt: '2020-01-01T00:00:00.000Z' };
    const p = await data.progress.saveProfile({ settings: stale, onboardingCompleted: true });
    expect(p.settings.sound).toBe(false);
    expect(p.onboardingCompleted).toBe(true);
    expect(p.displayName).toBe('Lea');
  });
});

describe('createMemoryDataServices – puzzles and ratings', () => {
  it('initialises ratings from the self-assessment (D-10)', async () => {
    const data = createMemoryDataServices();
    await data.progress.initializeFromSelfAssessment('beginner');
    expect(await data.repos.ratings.get('puzzle')).toMatchObject({ rating: 600, rd: 350, volatility: 0.06 });
    expect(await data.repos.ratings.get('bot')).toMatchObject({ rating: 400, rd: 350 });
    expect((await data.repos.profile.get())?.selfAssessment).toBe('beginner');
  });

  it('rated attempts update the puzzle rating with Glicko-2; a hint counts as not solved', async () => {
    const data = createMemoryDataServices({ now: fixedNow });
    await data.progress.initializeFromSelfAssessment('beginner');
    const base = { puzzleId: 'p1', mode: 'rated' as const, firstTry: true, solutionShown: false, timeMs: 5000, themes: ['fork'], puzzleRating: 650, puzzleRd: 80 };
    const r1 = await data.progress.recordPuzzleAttempt({ ...base, solved: true, hintsUsed: 0 });
    const expected = updateGlicko2({ rating: 600, rd: 350, volatility: 0.06 }, [{ opponentRating: 650, opponentRd: 80, score: 1 }]);
    expect(r1.rating?.rating).toBeCloseTo(expected.rating, 6);
    expect(r1.attempt).toMatchObject({ ratingBefore: 600, ratingAfter: r1.rating!.rating });
    const r2 = await data.progress.recordPuzzleAttempt({ ...base, puzzleId: 'p2', solved: true, hintsUsed: 1, firstTry: false });
    expect(r2.rating!.rating).toBeLessThan(r1.rating!.rating);
    expect(await data.repos.puzzleAttempts.ratedPuzzleIds()).toEqual(new Set(['p1', 'p2']));
    expect((await data.repos.ratings.history('puzzle')).map((h) => h.rating)).toEqual([r1.rating!.rating, r2.rating!.rating]);
    expect(await data.repos.themeStats.list()).toEqual([{ theme: 'fork', attempts: 2, successes: 1 }]);
    expect((await data.repos.dailyActivity.get('2026-10-16'))?.puzzles).toBe(2);
  });

  it('learning/theme attempts do not change the rating; demo attempts are not stored', async () => {
    const data = createMemoryDataServices();
    const base = { puzzleId: 'p1', firstTry: true, solutionShown: false, timeMs: 1, themes: ['pin'], puzzleRating: 500, puzzleRd: 80, solved: true, hintsUsed: 0 as const };
    expect((await data.progress.recordPuzzleAttempt({ ...base, mode: 'learning' })).rating).toBeNull();
    expect((await data.progress.recordPuzzleAttempt({ ...base, mode: 'demo' })).rating).toBeNull();
    expect(await data.repos.puzzleAttempts.list()).toHaveLength(1);
    expect(await data.repos.ratings.get('puzzle')).toBeNull();
  });

  it('queries the puzzle bank by rating, theme, exclusion and limit', async () => {
    const data = createMemoryDataServices({ puzzles: FIXTURE_PUZZLES });
    const easy = await data.repos.puzzles.query({ ratingMax: 450, limit: 10 });
    expect(easy.map((p) => p.rating)).toEqual([300, 350, 450]);
    expect((await data.repos.puzzles.query({ themes: ['fork'], limit: 5 })).map((p) => p.id)).toEqual(['fixture-knight-fork']);
    expect(await data.repos.puzzles.count({ excludeIds: ['fixture-two-mates'] })).toBe(4);
    expect(await data.repos.puzzles.query({ limit: 2, shuffle: true })).toHaveLength(2);
    await data.repos.puzzles.setBankVersion('v1');
    expect(await data.repos.puzzles.bankVersion()).toBe('v1');
  });
});

describe('createMemoryDataServices – lessons, games, analyses', () => {
  it('lesson progress: furthest progress wins (D-13)', async () => {
    const data = createMemoryDataServices({ now: fixedNow });
    const base = { lessonId: 'l1', lessonVersion: 1, mistakes: 0, hintsUsed: 0, updatedAt: '', completedAt: null };
    await data.progress.recordLessonProgress({ ...base, currentStep: 5, completed: true, stars: 3, completedAt: '2026-10-15T00:00:00Z' });
    const merged = await data.progress.recordLessonProgress({ ...base, currentStep: 2, completed: false, stars: 1 });
    expect(merged).toMatchObject({ currentStep: 5, completed: true, stars: 3, completedAt: '2026-10-15T00:00:00Z' });
  });

  it('creates games, appends events, resumes the move list and rates competition games only', async () => {
    const data = createMemoryDataServices();
    await data.progress.initializeFromSelfAssessment('beginner');
    const g = await data.progress.createGame(newGame());
    await data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    await data.progress.appendGameEvent({ gameId: g.id, seq: 2, kind: 'move', ply: 2, uci: 'e7e5', san: 'e5' });
    await data.progress.appendGameEvent({ gameId: g.id, seq: 3, kind: 'takeback', ply: 0, plies: 2 });
    await data.progress.appendGameEvent({ gameId: g.id, seq: 4, kind: 'move', ply: 1, uci: 'd2d4', san: 'd4' });
    await expect(data.progress.appendGameEvent({ gameId: g.id, seq: 4, kind: 'move', ply: 2, uci: 'd7d5' })).rejects.toThrow();
    expect(movesFromEvents(await data.repos.gameMoves.list(g.id))).toEqual(['d2d4']);

    const finished = await data.progress.finishGame(g.id, '1-0', 'checkmate', '1. d4 *');
    expect(finished.rating).not.toBeNull();
    expect(finished.game).toMatchObject({ status: 'finished', ratingBefore: 400 });
    expect(finished.game.ratingAfter).toBeGreaterThan(400);

    const t = await data.progress.createGame(newGame({ assistance: 'training' }));
    expect((await data.progress.finishGame(t.id, '0-1', 'resignation', '')).rating).toBeNull();
    expect(await data.repos.games.list({ status: 'finished' })).toHaveLength(2);
  });

  it('observeList, heartbeat, takeOver and findByExternalId', async () => {
    const data = createMemoryDataServices();
    const counts: number[] = [];
    data.repos.games.observeList({ status: 'active' }).subscribe((l) => counts.push(l.length));
    const g = await data.progress.createGame(newGame({ source: 'pgn', externalId: 'abc', botId: null, assistance: null }));
    await data.repos.games.heartbeat(g.id, 'device-a');
    await data.repos.games.takeOver(g.id, 'device-b');
    expect((await data.repos.games.get(g.id))?.activeDeviceId).toBe('device-b');
    expect((await data.repos.games.findByExternalId('pgn', 'abc'))?.id).toBe(g.id);
    expect(counts[0]).toBe(0);
    expect(counts.at(-1)).toBe(1);
  });

  it('stores analyses and feedback; exports and deletes user data', async () => {
    const data = createMemoryDataServices({ puzzles: FIXTURE_PUZZLES });
    await data.progress.recordExplanationFeedback({ context: 'analysis', ref: 'g1:27', vote: 1 });
    expect((await data.repos.explanationFeedback.get('analysis', 'g1:27'))?.vote).toBe(1);
    await data.progress.saveProfile({ displayName: 'Lea' });
    const json = JSON.parse(await (await data.account.exportData()).text());
    expect(json.profile.displayName).toBe('Lea');
    expect(json.explanationFeedback).toHaveLength(1);
    await data.account.deleteAccount();
    expect(await data.repos.profile.get()).toBeNull();
    expect(await data.repos.puzzles.count()).toBe(5);
  });

  it('local auth and sync state', async () => {
    const data = createMemoryDataServices({ userId: 'u1' });
    expect(data.auth.mode).toBe('local');
    expect(data.auth.session()).toEqual({ userId: 'u1', provider: 'local' });
    expect(await data.auth.accessToken()).toBeNull();
    expect(data.sync.state()).toMatchObject({ mode: 'local', status: 'local-only', pending: 0 });
    data.testing.addActiveMinutes(25, new Date('2026-10-16T10:00:00Z'));
    expect(await data.repos.dailyActivity.range('2026-10-01', '2026-10-31')).toMatchObject([{ date: '2026-10-16', minutes: 25, goalReached: true }]);
  });
});
