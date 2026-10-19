import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '@/lib/ids';
import { EXPORT_FORMAT, wipeUserData } from './account';
import { USER_DATA_TABLES } from './db';
import { createDexieDataServices, type DexieDataServices } from './services';
import { createFakeDevice, FakeSupabaseServer, waitFor, type FakeDevice } from './testing';

const open: Array<{ close(): void }> = [];
afterEach(() => {
  for (const o of open.splice(0)) o.close();
});

async function fill(data: DexieDataServices): Promise<void> {
  await data.progress.saveProfile({ displayName: 'Lea' });
  await data.progress.initializeFromSelfAssessment('beginner');
  await data.progress.recordPuzzleAttempt({ puzzleId: 'p1', mode: 'rated', solved: true, firstTry: true, hintsUsed: 0, solutionShown: false, timeMs: 1, themes: ['fork'], puzzleRating: 700, puzzleRd: 80 });
  await data.progress.recordLessonProgress({ lessonId: 'l1', lessonVersion: 1, currentStep: 2, completed: false, stars: 0, mistakes: 0, hintsUsed: 0, updatedAt: '', completedAt: null });
  const g = await data.progress.createGame({
    source: 'pgn',
    externalId: null,
    botId: null,
    userColor: 'w',
    assistance: null,
    timeControl: { kind: 'none' },
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pgn: '1. e4 *',
    headers: {},
    status: 'finished',
    result: '*',
    endReason: null,
    origin: { type: 'new' },
    activeDeviceId: null,
    activeHeartbeatAt: null,
    ratingBefore: null,
    ratingAfter: null,
    finishedAt: null,
  });
  await data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
  await data.progress.saveAnalysis({ gameId: g.id, engineId: 'sf', engineVersion: '18', depth: 14, createdAt: new Date().toISOString(), accuracy: { w: 1, b: 1 }, counts: { w: {}, b: {} } as never, moves: [], keyMoments: [], evalGraph: [] });
  await data.repos.reviewQueue.upsert({ id: 'r1', itemType: 'puzzle', objectId: 'p1', dueAt: new Date().toISOString(), intervalDays: 1 });
  await data.progress.recordExplanationFeedback({ context: 'puzzle', ref: 'p1', vote: -1 });
  await data.addActiveMinutes(3);
}

const ENTITY_COUNTS: Record<string, number> = {
  ratings: 2,
  puzzleAttempts: 1,
  games: 1,
  gameMoves: 1,
  gameAnalyses: 1,
  lessonProgress: 1,
  dailyActivity: 1,
  themeStats: 1,
  reviewQueue: 1,
  explanationFeedback: 1,
};

async function userRows(data: DexieDataServices): Promise<number> {
  let n = 0;
  for (const t of USER_DATA_TABLES) if (t !== 'profile') n += await data.db[t].count();
  return n;
}

describe('AccountService – local mode', () => {
  it('exports every entity as JSON and wipes all user data after deletion (fresh local profile)', async () => {
    const data = createDexieDataServices({ mode: 'local', dbName: `acc-${newId()}`, timeZone: 'Europe/Berlin', deviceId: 'd' });
    open.push(data);
    await data.ready();
    const firstId = (await data.repos.profile.get())!.id;
    await fill(data);
    await data.repos.puzzles.bulkUpsert([{ id: 'p1', fen: '8/8/8/8/8/8/8/K6k w - - 0 1', moves: ['a1a2'], rating: 700, ratingDeviation: 80, themes: ['fork'], openingTags: [], source: 'generated' }]);

    const blob = await data.account.exportData();
    expect(blob.type).toBe('application/json');
    const json = JSON.parse(await blob.text());
    expect(json).toMatchObject({ ...EXPORT_FORMAT, mode: 'local', profile: { id: firstId, displayName: 'Lea', selfAssessment: 'beginner' } });
    expect(typeof json.exportedAt).toBe('string');
    for (const [key, n] of Object.entries(ENTITY_COUNTS)) expect(json[key], key).toHaveLength(n);
    expect(json.dailyActivity[0]).toMatchObject({ minutes: 3, puzzles: 1, lessons: 2 });

    await data.account.deleteAccount();
    expect(await userRows(data)).toBe(0);
    const fresh = await data.repos.profile.get();
    expect(fresh).toMatchObject({ displayName: 'Du', onboardingCompleted: false, selfAssessment: null });
    expect(fresh!.id).not.toBe(firstId);
    expect(data.auth.session()?.userId).toBe(fresh!.id);
    expect(await data.repos.puzzles.count()).toBe(1); // static puzzle bank stays
  });
});

describe('AccountService – dead letters (DS-5)', () => {
  it('exports dead letters and removes them with the user data', async () => {
    const data = createDexieDataServices({ mode: 'local', dbName: `acc-${newId()}`, timeZone: 'Europe/Berlin', deviceId: 'd' });
    open.push(data);
    await data.ready();
    const letter = { id: 'x', table: 'game_moves', op: 'insert', payload: {}, enqueuedAt: '2026-10-16T10:00:00.000Z', attempts: 5, lastError: 'fk', droppedAt: '2026-10-16T10:01:00.000Z' };
    await data.db.setMeta('deadLetters', [letter]);
    const json = JSON.parse(await (await data.account.exportData()).text());
    expect(json.deadLetters).toEqual([letter]);
    await wipeUserData(data.db);
    expect(await data.db.getMeta('deadLetters')).toBeUndefined();
    expect(JSON.parse(await (await data.account.exportData()).text()).deadLetters).toEqual([]);
  });
});

describe('AccountService – cloud mode', () => {
  const devices: FakeDevice[] = [];
  afterEach(async () => {
    for (const d of devices.splice(0)) {
      await d.data.settled();
      d.close();
    }
  });

  it('exports the server state (flush + pull first)', async () => {
    const server = new FakeSupabaseServer();
    const a = createFakeDevice(server, { email: 'lea@example.com' });
    devices.push(a);
    await a.data.ready();
    await fill(a.data);
    const json = JSON.parse(await (await a.data.account.exportData()).text());
    expect(json.mode).toBe('cloud');
    for (const [key, n] of Object.entries(ENTITY_COUNTS)) expect(json[key], key).toHaveLength(n);
    // Server-confirmed values (not provisional) after the pull.
    expect(json.ratings.every((r: { provisional: boolean }) => !r.provisional)).toBe(true);
    expect(json.puzzleAttempts[0].ratingAfter).toBeGreaterThan(600);
  });

  it('delete calls the delete-account function, wipes the local copy and signs out', async () => {
    const server = new FakeSupabaseServer();
    const a = createFakeDevice(server, { email: 'lea@example.com' });
    devices.push(a);
    await a.data.ready();
    await fill(a.data);
    await a.data.settled();
    const uid = server.userByEmail('lea@example.com')!.id;
    expect(server.rows('puzzle_attempts', uid)).toHaveLength(1);

    await a.data.account.deleteAccount();
    expect(server.functionCalls).toMatchObject([{ name: 'delete-account', userId: uid }]);
    expect(server.rows('puzzle_attempts', uid)).toEqual([]);
    expect(server.rows('profiles', uid)).toEqual([]);
    expect(server.userByEmail('lea@example.com')).toBeUndefined();
    expect(await userRows(a.data)).toBe(0);
    expect(await a.data.repos.profile.get()).toBeNull();
    await waitFor(() => a.data.auth.session() === null);
    expect(a.client.testing.session()).toBeNull();
  });

  it('keeps everything when the function fails', async () => {
    const server = new FakeSupabaseServer();
    const a = createFakeDevice(server, { email: 'lea@example.com' });
    devices.push(a);
    await a.data.ready();
    await fill(a.data);
    await a.data.settled();
    server.failNext({ count: 1, status: 500, message: 'boom', match: (r) => r.kind === 'function' });
    await expect(a.data.account.deleteAccount()).rejects.toThrow(/nicht gelöscht/);
    expect(await a.data.repos.puzzleAttempts.list()).toHaveLength(1);
    expect(a.data.auth.session()).not.toBeNull();
    // Sync keeps working afterwards.
    await a.data.progress.recordExplanationFeedback({ context: 'puzzle', ref: 'p2', vote: 1 });
    await a.data.settled();
    expect(server.rows('explanation_feedback')).toHaveLength(2);
  });
});
