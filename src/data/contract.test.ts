/**
 * Contract suite: the same tests run against the reference implementation (`createMemoryDataServices`) and the Dexie
 * data services (local mode, fake-indexeddb), so both behave identically for every package that uses them.
 * Documented difference: the Dexie local mode creates the local profile on the first start (D-15); the memory
 * services have no profile until one is written.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import type { Game } from '@/core/games';
import { movesFromEvents } from '@/core/games';
import type { DataServices } from '@/core/storage';
import { createMemoryDataServices, FIXTURE_PUZZLES } from '@/core/testing';
import { newId } from '@/lib/ids';
import { updateGlicko2 } from '@/lib/rating';
import { createDexieDataServices } from './services';
import { waitFor } from './testing/waitFor';

const NOW = '2026-10-16T10:00:00.000Z';
const fixedNow = () => new Date(NOW);

interface Impl {
  name: string;
  make(opts?: { userId?: string; puzzles?: boolean; now?: () => Date }): Promise<{ data: DataServices; addMinutes(m: number, at: Date): Promise<void> }>;
}

const closers: Array<() => void> = [];
afterEach(() => {
  for (const c of closers.splice(0)) c();
});

const IMPLS: Impl[] = [
  {
    name: 'memory',
    async make(opts = {}) {
      const data = createMemoryDataServices({ now: opts.now ?? fixedNow, userId: opts.userId, puzzles: opts.puzzles ? FIXTURE_PUZZLES : [], random: () => 0.5 });
      return { data, addMinutes: async (m, at) => data.testing.addActiveMinutes(m, at) };
    },
  },
  {
    name: 'dexie',
    async make(opts = {}) {
      const data = createDexieDataServices({ mode: 'local', dbName: `contract-${newId()}`, now: opts.now ?? fixedNow, timeZone: 'Europe/Berlin', deviceId: 'device-1', random: () => 0.5 });
      closers.push(() => data.close());
      await data.ready();
      if (opts.puzzles) await data.repos.puzzles.bulkUpsert(FIXTURE_PUZZLES);
      return { data, addMinutes: (m, at) => data.addActiveMinutes(m, at) };
    },
  },
];

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

describe.each(IMPLS)('DataServices contract – $name', (impl) => {
  it('updateSettings merges, sets updatedAt and notifies observers', async () => {
    const { data } = await impl.make();
    const seen: Array<string | undefined> = [];
    const off = data.repos.profile.observe().subscribe((p) => seen.push(p?.settings.notation));
    const s = await data.repos.profile.updateSettings({ notation: 'en' });
    expect(s).toMatchObject({ notation: 'en', theme: 'dark', updatedAt: NOW });
    await waitFor(() => seen.at(-1) === 'en');
    off();
    expect((await data.repos.profile.get())?.settings).toMatchObject({ notation: 'en', sound: true });
  });

  it('saveProfile merges fields and keeps newer settings (LWW)', async () => {
    const { data } = await impl.make();
    await data.progress.saveProfile({ displayName: 'Lea' });
    await data.repos.profile.updateSettings({ sound: false });
    const stale = { ...(await data.repos.profile.get())!.settings, sound: true, updatedAt: '2020-01-01T00:00:00.000Z' };
    const p = await data.progress.saveProfile({ settings: stale, onboardingCompleted: true });
    expect(p).toMatchObject({ displayName: 'Lea', onboardingCompleted: true });
    expect(p.settings.sound).toBe(false);
    const newer = { ...p.settings, sound: true, updatedAt: '2026-10-17T00:00:00.000Z' };
    expect((await data.progress.saveProfile({ settings: newer })).settings.sound).toBe(true);
  });

  it('initialises ratings from the self-assessment with RD 350 (D-10)', async () => {
    const { data } = await impl.make();
    await data.progress.initializeFromSelfAssessment('beginner');
    expect(await data.repos.ratings.get('puzzle')).toMatchObject({ rating: 600, rd: 350, volatility: 0.06, gamesCount: 0, provisional: false });
    expect(await data.repos.ratings.get('bot')).toMatchObject({ rating: 400, rd: 350 });
    expect((await data.repos.profile.get())?.selfAssessment).toBe('beginner');
    await expect(data.progress.initializeFromSelfAssessment('nope' as never)).rejects.toThrow();
  });

  it('rated attempts: Glicko-2 vs puzzle rating/RD, a hint counts as not solved, stats and daily activity', async () => {
    const { data } = await impl.make();
    await data.progress.initializeFromSelfAssessment('beginner');
    const base = { puzzleId: 'p1', mode: 'rated' as const, firstTry: true, solutionShown: false, timeMs: 5000, themes: ['fork'], puzzleRating: 650, puzzleRd: 80 };
    const r1 = await data.progress.recordPuzzleAttempt({ ...base, solved: true, hintsUsed: 0 });
    const expected = updateGlicko2({ rating: 600, rd: 350, volatility: 0.06 }, [{ opponentRating: 650, opponentRd: 80, score: 1 }]);
    expect(r1.rating?.rating).toBeCloseTo(expected.rating, 9);
    expect(r1.rating?.provisional).toBe(false);
    expect(r1.attempt).toMatchObject({ ratingBefore: 600, ratingAfter: r1.rating!.rating, createdAt: NOW });
    const r2 = await data.progress.recordPuzzleAttempt({ ...base, puzzleId: 'p2', solved: true, hintsUsed: 1, firstTry: false });
    expect(r2.rating!.rating).toBeLessThan(r1.rating!.rating);
    expect(r2.rating!.gamesCount).toBe(2);
    expect(await data.repos.puzzleAttempts.ratedPuzzleIds()).toEqual(new Set(['p1', 'p2']));
    expect((await data.repos.ratings.history('puzzle')).map((h) => h.rating)).toEqual([r1.rating!.rating, r2.rating!.rating]);
    expect(await data.repos.themeStats.list()).toEqual([{ theme: 'fork', attempts: 2, successes: 1 }]);
    expect((await data.repos.dailyActivity.get('2026-10-16'))?.puzzles).toBe(2);
    expect(await data.repos.puzzleAttempts.list({ limit: 1 })).toHaveLength(1);
    expect(await data.repos.puzzleAttempts.list({ mode: 'learning' })).toEqual([]);
  });

  it('learning/theme attempts keep the rating; demo attempts are not stored; recent attempts are observable', async () => {
    const { data } = await impl.make();
    const seen: number[] = [];
    const off = data.repos.puzzleAttempts.observeRecent(10).subscribe((l) => seen.push(l.length));
    const base = { puzzleId: 'p1', firstTry: true, solutionShown: false, timeMs: 1, themes: ['pin'], puzzleRating: 500, puzzleRd: 80, solved: true, hintsUsed: 0 as const };
    expect((await data.progress.recordPuzzleAttempt({ ...base, mode: 'learning' })).rating).toBeNull();
    expect((await data.progress.recordPuzzleAttempt({ ...base, mode: 'theme' })).rating).toBeNull();
    expect((await data.progress.recordPuzzleAttempt({ ...base, mode: 'demo' })).rating).toBeNull();
    expect(await data.repos.puzzleAttempts.list()).toHaveLength(2);
    expect(await data.repos.ratings.get('puzzle')).toBeNull();
    expect(await data.repos.themeStats.list()).toEqual([{ theme: 'pin', attempts: 2, successes: 2 }]);
    await waitFor(() => seen.at(-1) === 2);
    off();
  });

  it('queries the puzzle bank by rating, theme, exclusion and limit', async () => {
    const { data } = await impl.make({ puzzles: true });
    const easy = await data.repos.puzzles.query({ ratingMax: 450, limit: 10 });
    expect(easy.map((p) => p.rating)).toEqual([300, 350, 450]);
    expect((await data.repos.puzzles.query({ themes: ['fork'], limit: 5 })).map((p) => p.id)).toEqual(['fixture-knight-fork']);
    expect(await data.repos.puzzles.count()).toBe(5);
    expect(await data.repos.puzzles.count({ excludeIds: ['fixture-two-mates'] })).toBe(4);
    expect(await data.repos.puzzles.query({ limit: 2, shuffle: true })).toHaveLength(2);
    expect(await data.repos.puzzles.get('fixture-knight-fork')).toMatchObject({ id: 'fixture-knight-fork' });
    expect(await data.repos.puzzles.get('missing')).toBeNull();
    expect(await data.repos.puzzles.bankVersion()).toBeNull();
    await data.repos.puzzles.setBankVersion('v1');
    expect(await data.repos.puzzles.bankVersion()).toBe('v1');
  });

  it('lesson progress: the furthest progress wins (D-13) and is observable', async () => {
    const { data } = await impl.make();
    const seen: number[] = [];
    const off = data.repos.lessonProgress.observeAll().subscribe((l) => seen.push(l[0]?.currentStep ?? -1));
    const base = { lessonId: 'l1', lessonVersion: 1, mistakes: 0, hintsUsed: 0, updatedAt: '', completedAt: null };
    await data.progress.recordLessonProgress({ ...base, currentStep: 5, completed: true, stars: 3, completedAt: '2026-10-15T00:00:00Z' });
    const merged = await data.progress.recordLessonProgress({ ...base, currentStep: 2, completed: false, stars: 1 });
    expect(merged).toMatchObject({ currentStep: 5, completed: true, stars: 3, completedAt: '2026-10-15T00:00:00Z', updatedAt: NOW });
    expect(await data.repos.lessonProgress.get('l1')).toMatchObject({ currentStep: 5, completed: true });
    expect((await data.repos.dailyActivity.get('2026-10-16'))?.lessons).toBe(6);
    await waitFor(() => seen.at(-1) === 5);
    off();
  });

  it('games: create, append events, resume the move list; only competition bot games are rated', async () => {
    const { data } = await impl.make();
    await data.progress.initializeFromSelfAssessment('beginner');
    const g = await data.progress.createGame(newGame());
    expect(g).toMatchObject({ createdAt: NOW, updatedAt: NOW, status: 'active' });
    await data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    await data.progress.appendGameEvent({ gameId: g.id, seq: 2, kind: 'move', ply: 2, uci: 'e7e5', san: 'e5' });
    await data.progress.appendGameEvent({ gameId: g.id, seq: 3, kind: 'takeback', ply: 0, plies: 2 });
    await data.progress.appendGameEvent({ gameId: g.id, seq: 4, kind: 'move', ply: 1, uci: 'd2d4', san: 'd4' });
    await expect(data.progress.appendGameEvent({ gameId: g.id, seq: 4, kind: 'move', ply: 2, uci: 'd7d5' })).rejects.toThrow();
    expect(movesFromEvents(await data.repos.gameMoves.list(g.id))).toEqual(['d2d4']);

    const finished = await data.progress.finishGame(g.id, '1-0', 'checkmate', '1. d4 *');
    const expected = updateGlicko2({ rating: 400, rd: 350, volatility: 0.06 }, [{ opponentRating: 400, opponentRd: 50, score: 1 }]);
    expect(finished.rating?.rating).toBeCloseTo(expected.rating, 9);
    expect(finished.game).toMatchObject({ status: 'finished', result: '1-0', endReason: 'checkmate', ratingBefore: 400, finishedAt: NOW });
    expect((await data.repos.ratings.history('bot')).map((h) => h.rating)).toEqual([finished.rating!.rating]);

    const t = await data.progress.createGame(newGame({ assistance: 'training' }));
    expect((await data.progress.finishGame(t.id, '0-1', 'resignation', '')).rating).toBeNull();
    expect(await data.repos.games.list({ status: 'finished' })).toHaveLength(2);
    expect((await data.repos.dailyActivity.get('2026-10-16'))?.games).toBe(2);
    await expect(data.progress.finishGame('missing', '1-0', 'checkmate', '')).rejects.toThrow();
  });

  it('observeList, heartbeat, takeOver and findByExternalId', async () => {
    const { data } = await impl.make();
    const counts: number[] = [];
    const off = data.repos.games.observeList({ status: 'active' }).subscribe((l) => counts.push(l.length));
    await waitFor(() => counts.length > 0);
    const g = await data.progress.createGame(newGame({ source: 'pgn', externalId: 'abc', botId: null, assistance: null }));
    await data.repos.games.heartbeat(g.id, 'device-a');
    expect((await data.repos.games.get(g.id))).toMatchObject({ activeDeviceId: 'device-a', activeHeartbeatAt: NOW });
    await data.repos.games.takeOver(g.id, 'device-b');
    expect((await data.repos.games.get(g.id))?.activeDeviceId).toBe('device-b');
    expect((await data.repos.games.findByExternalId('pgn', 'abc'))?.id).toBe(g.id);
    expect(await data.repos.games.findByExternalId('pgn', 'nope')).toBeNull();
    await waitFor(() => counts.at(-1) === 1);
    off();
    expect(counts[0]).toBe(0);
    const seen: Array<string | null | undefined> = [];
    const off2 = data.repos.games.observe(g.id).subscribe((x) => seen.push(x?.activeDeviceId));
    await waitFor(() => seen.at(-1) === 'device-b');
    off2();
  });

  it('stores analyses, review items and feedback; exports all entities and deletes user data', async () => {
    const { data, addMinutes } = await impl.make({ puzzles: true });
    await data.progress.saveProfile({ displayName: 'Lea' });
    await data.progress.initializeFromSelfAssessment('club');
    await data.progress.recordExplanationFeedback({ context: 'analysis', ref: 'g1:27', vote: 1 });
    expect((await data.repos.explanationFeedback.get('analysis', 'g1:27'))?.vote).toBe(1);
    const g = await data.progress.createGame(newGame());
    await data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    const analysis = {
      gameId: g.id,
      engineId: 'fake',
      engineVersion: '1',
      depth: 12,
      createdAt: NOW,
      accuracy: { w: 90, b: 80 },
      counts: { w: {}, b: {} } as never,
      moves: [],
      keyMoments: [],
      evalGraph: [],
    };
    await data.progress.saveAnalysis(analysis);
    expect((await data.repos.gameAnalyses.get(g.id))?.depth).toBe(12);
    expect(await data.repos.gameAnalyses.list()).toHaveLength(1);
    await data.repos.reviewQueue.upsert({ id: 'r1', itemType: 'puzzle', objectId: 'p1', dueAt: '2026-10-15T00:00:00.000Z', intervalDays: 1 });
    await data.repos.reviewQueue.upsert({ id: 'r2', itemType: 'puzzle', objectId: 'p2', dueAt: '2026-10-20T00:00:00.000Z', intervalDays: 3 });
    expect((await data.repos.reviewQueue.due(NOW)).map((i) => i.id)).toEqual(['r1']);
    await data.progress.recordPuzzleAttempt({ puzzleId: 'p1', mode: 'rated', solved: true, firstTry: true, hintsUsed: 0, solutionShown: false, timeMs: 1, themes: ['fork'], puzzleRating: 900, puzzleRd: 80 });
    await data.progress.recordLessonProgress({ lessonId: 'l1', lessonVersion: 1, currentStep: 1, completed: false, stars: 0, mistakes: 0, hintsUsed: 0, updatedAt: '', completedAt: null });
    await addMinutes(25, new Date(NOW));

    const json = JSON.parse(await (await data.account.exportData()).text());
    expect(json.profile.displayName).toBe('Lea');
    for (const key of ['ratings', 'puzzleAttempts', 'games', 'gameMoves', 'gameAnalyses', 'lessonProgress', 'dailyActivity', 'themeStats', 'reviewQueue', 'explanationFeedback']) {
      expect(json[key], key).not.toHaveLength(0);
    }
    expect(json.dailyActivity).toMatchObject([{ date: '2026-10-16', minutes: 25, goalReached: true }]);

    await data.account.deleteAccount();
    expect((await data.repos.profile.get())?.displayName ?? null).not.toBe('Lea');
    expect(await data.repos.puzzleAttempts.list()).toEqual([]);
    expect(await data.repos.games.list()).toEqual([]);
    expect(await data.repos.ratings.get('puzzle')).toBeNull();
    expect(await data.repos.puzzles.count()).toBe(5); // the puzzle bank is static content, not user data
  });

  it('local auth and sync state', async () => {
    const { data } = await impl.make();
    expect(data.auth.mode).toBe('local');
    expect(data.auth.session()?.provider).toBe('local');
    expect(await data.auth.accessToken()).toBeNull();
    await expect(data.auth.signInWithEmailLink('a@b.de')).rejects.toThrow(/Lokaler Modus/);
    await expect(data.auth.signInWithGoogle()).rejects.toThrow(/Lokaler Modus/);
    expect(data.sync.state()).toMatchObject({ mode: 'local', status: 'local-only', pending: 0 });
    await data.sync.flush();
    expect(typeof data.deviceId).toBe('string');
  });
});
