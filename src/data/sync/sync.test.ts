/**
 * Sync acceptance tests (P0-02 Given/When/Then) with fake-indexeddb, the fake backend and the real
 * `SupabaseSyncAdapter`/`SupabaseAuthService` on the fake supabase-js client.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { START_FEN } from '@/core/chess';
import type { Game } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import type { PuzzleAttempt } from '@/core/puzzles';
import type { RatingRecord } from '@/core/rating';
import type { SyncState } from '@/core/storage';
import { toRow, type GameRow, type LessonProgressRow, type ProfileRow, type PuzzleAttemptRow, type RatingRow } from '@/core/tables';
import { updateGlicko2 } from '@/lib/rating';
import { createFakeDevice, FakeSupabaseServer, waitFor, type FakeDevice } from '../testing';

const devices: FakeDevice[] = [];
function device(server: FakeSupabaseServer, opts: Parameters<typeof createFakeDevice>[1] = {}): FakeDevice {
  const d = createFakeDevice(server, opts);
  devices.push(d);
  return d;
}

afterEach(async () => {
  for (const d of devices.splice(0)) {
    await d.data.settled();
    d.close();
  }
});

const EMAIL = 'lea@example.com';

function lesson(overrides: Partial<LessonProgress> = {}): LessonProgress {
  return {
    lessonId: 'stufe0-figuren-turm',
    lessonVersion: 1,
    currentStep: 0,
    completed: false,
    stars: 0,
    mistakes: 0,
    hintsUsed: 0,
    updatedAt: '',
    completedAt: null,
    ...overrides,
  };
}

function attempt(i: number, solved: boolean): Omit<PuzzleAttempt, 'id' | 'createdAt' | 'ratingBefore' | 'ratingAfter'> & { puzzleRd: number } {
  return {
    puzzleId: `p${i}`,
    mode: 'rated',
    solved,
    firstTry: solved,
    hintsUsed: 0,
    solutionShown: false,
    timeMs: 4000 + i,
    themes: ['fork'],
    puzzleRating: 600 + i * 40,
    puzzleRd: 80,
  };
}

function newGame(): Omit<Game, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    source: 'bot',
    externalId: null,
    botId: 'bot-anna',
    userColor: 'w',
    assistance: 'competition',
    timeControl: { kind: 'none' },
    startFen: START_FEN,
    pgn: '',
    headers: { White: 'Du', Black: 'Anna', BlackElo: '450' },
    status: 'active',
    result: '*',
    endReason: null,
    origin: { type: 'new' },
    activeDeviceId: null,
    activeHeartbeatAt: null,
    ratingBefore: null,
    ratingAfter: null,
    finishedAt: null,
  };
}

/** Time until `check` holds, in ms. */
async function timeUntil(check: () => boolean | Promise<boolean>, timeoutMs = 3000): Promise<number> {
  const start = Date.now();
  await waitFor(check, timeoutMs, 5);
  return Date.now() - start;
}

describe('P0-02 GWT 1 – two devices', () => {
  it('a lesson completed on A is shown on B ≤ 2 s later without reload (300 ms latency)', async () => {
    const server = new FakeSupabaseServer({ latencyMs: 300 });
    const a = device(server, { email: EMAIL });
    const b = device(server, { email: EMAIL });
    await Promise.all([a.data.ready(), b.data.ready()]);

    const seen: LessonProgress[][] = [];
    const off = b.data.repos.lessonProgress.observeAll().subscribe((l) => seen.push(l));
    const t0 = Date.now();
    await a.data.progress.recordLessonProgress(lesson({ currentStep: 6, completed: true, stars: 3, completedAt: new Date().toISOString() }));
    await waitFor(() => seen.at(-1)?.find((p) => p.lessonId === 'stufe0-figuren-turm')?.completed, 2000, 5);
    const elapsed = Date.now() - t0;
    off();
    expect(elapsed).toBeLessThanOrEqual(2000);
    expect((await b.data.repos.lessonProgress.get('stufe0-figuren-turm'))).toMatchObject({ completed: true, stars: 3, currentStep: 6 });
  });

  it('a move made on A appears in the move list on B (realtime, game takeover fields included)', async () => {
    const server = new FakeSupabaseServer({ latencyMs: 20 });
    const a = device(server, { email: EMAIL, deviceId: 'device-a' });
    const b = device(server, { email: EMAIL, deviceId: 'device-b' });
    await Promise.all([a.data.ready(), b.data.ready()]);
    const g = await a.data.progress.createGame(newGame());
    await a.data.repos.games.heartbeat(g.id, 'device-a');
    await a.data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    await waitFor(async () => (await b.data.repos.gameMoves.list(g.id)).length === 1);
    expect((await b.data.repos.games.get(g.id))?.activeDeviceId).toBe('device-a');
    await b.data.repos.games.takeOver(g.id, 'device-b');
    await waitFor(async () => (await a.data.repos.games.get(g.id))?.activeDeviceId === 'device-b');
    // A's next heartbeat must not steal the game back (B is active now).
    await a.data.repos.games.heartbeat(g.id, 'device-a');
    expect((await a.data.repos.games.get(g.id))?.activeDeviceId).toBe('device-b');
  });
});

describe('P0-02 GWT 2 – offline', () => {
  it('5 attempts offline → after reconnecting exactly 5 stored once; server rating = sequential Glicko-2', async () => {
    const server = new FakeSupabaseServer({ latencyMs: 10 });
    const a = device(server, { email: EMAIL });
    await a.data.ready();
    await a.data.progress.initializeFromSelfAssessment('beginner');
    await a.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;
    await waitFor(() => server.rows<RatingRow>('ratings', uid).length === 2);

    a.setOnline(false);
    await waitFor(() => a.data.sync.state().status === 'offline');
    const results = [true, false, true, true, false];
    const local: RatingRecord[] = [];
    for (let i = 0; i < 5; i++) local.push((await a.data.progress.recordPuzzleAttempt(attempt(i, results[i]!))).rating!);
    expect(local.at(-1)?.provisional).toBe(true);
    await waitFor(() => a.data.sync.state().pending === 5);
    expect(a.data.sync.state()).toMatchObject({ status: 'offline', pending: 5 });
    expect(server.rows('puzzle_attempts')).toHaveLength(0);

    // The first push after reconnecting is processed but its response gets lost → the client resends (duplicates).
    server.failNext({ count: 1, lostResponse: true, match: (r) => r.target === 'puzzle_attempts' });
    a.setOnline(true);
    await waitFor(() => a.data.sync.state().status === 'synced' && a.data.sync.state().pending === 0, 5000);
    await a.data.settled();

    const rows = server.rows<PuzzleAttemptRow>('puzzle_attempts', uid);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.id)).size).toBe(5);
    expect(server.log.filter((l) => l.target === 'puzzle_attempts' && l.kind === 'upsert').length).toBeGreaterThanOrEqual(2);

    let expected = { rating: 600, rd: 350, volatility: 0.06 };
    for (let i = 0; i < 5; i++) {
      expected = updateGlicko2(expected, [{ opponentRating: 600 + i * 40, opponentRd: 80, score: results[i] ? 1 : 0 }]);
    }
    const serverRating = server.rows<RatingRow>('ratings', uid).find((r) => r.kind === 'puzzle')!;
    expect(serverRating.rating).toBeCloseTo(expected.rating, 9);
    expect(serverRating.rd).toBeCloseTo(expected.rd, 9);
    expect(serverRating.games_count).toBe(5);
    expect(local.at(-1)!.rating).toBeCloseTo(expected.rating, 9);

    // The provisional client value is replaced by the confirmed server value.
    await waitFor(async () => (await a.data.repos.ratings.get('puzzle'))?.provisional === false);
    expect((await a.data.repos.ratings.get('puzzle'))?.rating).toBeCloseTo(expected.rating, 9);
    const attempts = await a.data.repos.puzzleAttempts.list();
    expect(attempts).toHaveLength(5);
    expect(server.rows('daily_activity', uid)).toMatchObject([{ puzzles: 5 }]);
    expect(server.rows('theme_stats', uid)).toMatchObject([{ theme: 'fork', attempts: 5, successes: 3 }]);
  });
});

describe('P0-02 GWT 3 – failing saves', () => {
  it('shows "error" (Nicht synchronisiert), retries automatically with backoff and finally stores everything', async () => {
    const server = new FakeSupabaseServer({ latencyMs: 5 });
    const a = device(server, { email: EMAIL, sync: { backoffBaseMs: 40, backoffMaxMs: 200 } });
    await a.data.ready();
    await a.data.settled();
    const states: SyncState['status'][] = [];
    const off = a.data.sync.observe().subscribe((s) => states.push(s.status));
    server.failNext({ count: 3, status: 503 });
    await a.data.progress.recordPuzzleAttempt({ ...attempt(1, true), mode: 'learning' });
    await a.data.progress.recordLessonProgress(lesson({ currentStep: 2 }));
    await waitFor(() => a.data.sync.state().status === 'error');
    expect(a.data.sync.state().error).toBe('Service Unavailable');
    expect(a.data.sync.state().pending).toBe(2);
    await waitFor(() => a.data.sync.state().status === 'synced', 5000);
    off();
    const uid = server.userByEmail(EMAIL)!.id;
    expect(server.rows('puzzle_attempts', uid)).toHaveLength(1);
    expect(server.rows<LessonProgressRow>('lesson_progress', uid)).toMatchObject([{ current_step: 2 }]);
    expect(states).toContain('error');
    expect(states.at(-1)).toBe('synced');
    // 3 failed runs + the successful one, spaced by the backoff (40, 80, 160 ms).
    expect(server.log.filter((l) => l.status === 503)).toHaveLength(3);
  });

  it('drops an entry the server rejects permanently after 5 attempts (dead letter) and syncs the rest', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL, sync: { backoffBaseMs: 5, backoffMaxMs: 20 } });
    await a.data.ready();
    // A move without its game on the server violates the foreign key → permanent (409) failure.
    await a.data.db.outbox.add({
      id: 'orphan',
      table: 'game_moves',
      op: 'insert',
      payload: { id: 'm1', game_id: 'missing', user_id: 'x', seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4', fen_after: null, plies: null, created_at: new Date().toISOString() },
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      rev: 0,
    });
    await a.data.progress.recordLessonProgress(lesson({ currentStep: 1 }));
    await waitFor(() => a.data.sync.state().deadLetterCount === 1 && a.data.sync.state().pending === 0, 5000);
    expect(server.rows('lesson_progress')).toHaveLength(1);
    const letters = (await a.data.db.getMeta<Array<{ id: string; attempts: number }>>('deadLetters')) ?? [];
    expect(letters).toMatchObject([{ id: 'orphan', attempts: 5 }]);
    // DS-2: dead letters are never shown as "synced".
    expect(a.data.sync.state()).toMatchObject({ status: 'error', pending: 0, deadLetterCount: 1 });
  });

  it('DS-2: one permanently rejected game of a group does not block the others; their moves are accepted', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL, sync: { backoffBaseMs: 5, backoffMaxMs: 20 } });
    await a.data.ready();
    await a.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;
    // The server already stores this lichess game under another id (imported on another device).
    server.upsert('games', uid, [toRow.game({ ...newGame(), id: 'server-copy', externalId: 'abc', source: 'lichess', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' } as Game, uid) as never], {});
    a.setOnline(false);
    await waitFor(() => a.data.sync.state().status === 'offline');
    const l1 = await a.data.progress.createGame({ ...newGame(), source: 'lichess', externalId: 'abc' });
    const l2 = await a.data.progress.createGame(newGame());
    const g = await a.data.progress.createGame(newGame());
    await a.data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    a.setOnline(true);
    await waitFor(() => a.data.sync.state().deadLetterCount === 1 && a.data.sync.state().pending === 0, 5000);
    expect(server.rows<GameRow>('games', uid).map((r) => r.id).sort()).toEqual([g.id, l2.id, 'server-copy'].sort());
    expect(server.rows('game_moves', uid)).toHaveLength(1);
    expect(a.data.sync.state()).toMatchObject({ status: 'error', deadLetterCount: 1 });
    const letters = (await a.data.db.getMeta<Array<{ id: string; table: string }>>('deadLetters')) ?? [];
    expect(letters).toMatchObject([{ table: 'games' }]);
    expect(l1.id).not.toBe(g.id);
  });
});

describe('DS2-3 – dead letters', () => {
  it('dismissDeadLetters empties the list and the status returns to synced', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL, sync: { backoffBaseMs: 5, backoffMaxMs: 20 } });
    await a.data.ready();
    await a.data.db.outbox.add({
      id: 'orphan',
      table: 'game_moves',
      op: 'insert',
      payload: { id: 'm1', game_id: 'missing', user_id: 'x', seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4', fen_after: null, plies: null, created_at: new Date().toISOString() },
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      rev: 0,
    });
    await a.data.sync.flush();
    await waitFor(() => a.data.sync.state().deadLetterCount === 1 && a.data.sync.state().pending === 0, 5000);
    expect(a.data.sync.state().status).toBe('error');
    await a.data.sync.dismissDeadLetters?.();
    expect(await a.data.db.getMeta<unknown[]>('deadLetters')).toEqual([]);
    expect(a.data.sync.state()).toMatchObject({ status: 'synced', pending: 0 });
    expect(a.data.sync.state().deadLetterCount).toBeUndefined();
  });
});

describe('DS2-2 – the same PGN imported on two devices', () => {
  it('the server copy replaces the local one; its moves and entries are dropped without dead letters', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL, sync: { backoffBaseMs: 5, backoffMaxMs: 20 } });
    const b = device(server, { email: EMAIL, sync: { backoffBaseMs: 5, backoffMaxMs: 20 } });
    await a.data.ready();
    await b.data.ready();
    await a.data.settled();
    await b.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;
    b.setOnline(false);
    await waitFor(() => b.data.sync.state().status === 'offline');
    const pgn = { ...newGame(), source: 'pgn' as const, externalId: 'hash1', botId: null, userColor: null, assistance: null };
    const ga = await a.data.progress.createGame(pgn);
    await a.data.progress.appendGameEvent({ gameId: ga.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    await waitFor(() => server.rows('game_moves', uid).length === 1, 5000);
    // B imports the same PGN while offline, with a move.
    const gb = await b.data.progress.createGame(pgn);
    await b.data.progress.appendGameEvent({ gameId: gb.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    expect(gb.id).not.toBe(ga.id);
    b.setOnline(true);
    await waitFor(async () => (await b.data.db.games.get(gb.id)) === undefined && (await b.data.db.games.get(ga.id)) !== undefined, 5000);
    await waitFor(() => b.data.sync.state().pending === 0, 5000);
    await b.data.settled();
    expect((await b.data.db.games.toArray()).map((g) => g.id)).toEqual([ga.id]);
    expect(await b.data.db.gameMoves.where('gameId').equals(gb.id).count()).toBe(0);
    expect(await b.data.db.gameMoves.where('gameId').equals(ga.id).count()).toBe(1);
    expect(await b.data.db.outbox.count()).toBe(0);
    expect(await b.data.db.getMeta('deadLetters')).toBeUndefined();
    expect(b.data.sync.state()).toMatchObject({ status: 'synced', pending: 0 });
    expect(server.rows<GameRow>('games', uid).map((r) => r.id)).toEqual([ga.id]);
    expect(server.rows('game_moves', uid)).toHaveLength(1);
  });
});

describe('P0-02 – push latency', () => {
  it('each action reaches the database ≤ 1 s after the action at 300 ms latency', async () => {
    const server = new FakeSupabaseServer({ latencyMs: 300 });
    const a = device(server, { email: EMAIL });
    await a.data.ready();
    await a.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;

    let t0 = Date.now();
    const { attempt: att } = await a.data.progress.recordPuzzleAttempt(attempt(1, true));
    const attemptMs = await timeUntil(() => server.rows<PuzzleAttemptRow>('puzzle_attempts', uid).some((r) => r.id === att.id));
    expect(Date.now() - t0).toBeLessThanOrEqual(1000);
    await a.data.settled();

    t0 = Date.now();
    await a.data.progress.recordLessonProgress(lesson({ currentStep: 3 }));
    await timeUntil(() => server.rows<LessonProgressRow>('lesson_progress', uid).some((r) => r.current_step === 3));
    const lessonMs = Date.now() - t0;
    await a.data.settled();

    const g = await a.data.progress.createGame(newGame());
    await a.data.settled();
    t0 = Date.now();
    const move = await a.data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    await timeUntil(() => server.rows('game_moves', uid).some((r) => r.id === move.id));
    const moveMs = Date.now() - t0;
    await a.data.settled();

    t0 = Date.now();
    await a.data.repos.profile.updateSettings({ notation: 'en' });
    await timeUntil(() => server.rows<ProfileRow>('profiles', uid).some((r) => r.settings.notation === 'en'));
    const settingsMs = Date.now() - t0;

    for (const ms of [attemptMs, lessonMs, moveMs, settingsMs]) expect(ms).toBeLessThanOrEqual(1000);
  });
});

describe('P0-02 – conflict rules', () => {
  it('duplicate pushes are ignored and reported as success', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL });
    await a.data.ready();
    await a.data.progress.recordExplanationFeedback({ context: 'puzzle', ref: 'p1', vote: 1 });
    await a.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;
    expect(server.rows('explanation_feedback', uid)).toHaveLength(1);
    const row = server.rows('explanation_feedback', uid)[0]!;
    const { createSupabaseSyncAdapter } = await import('../supabase/syncAdapter');
    const adapter = createSupabaseSyncAdapter({ client: async () => a.client, userId: () => uid });
    const entry = { id: 'e1', table: 'explanation_feedback' as const, op: 'insert' as const, payload: row, enqueuedAt: '', attempts: 0 };
    const res = await adapter.push([entry, { ...entry, id: 'e2' }]);
    expect(res).toEqual([
      { id: 'e1', ok: true, duplicate: true },
      { id: 'e2', ok: true, duplicate: true },
    ]);
    expect(server.rows('explanation_feedback', uid)).toHaveLength(1);
  });

  it('lesson progress: the furthest progress wins across devices', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL });
    const b = device(server, { email: EMAIL });
    await Promise.all([a.data.ready(), b.data.ready()]);
    b.setOnline(false);
    await a.data.progress.recordLessonProgress(lesson({ currentStep: 6, completed: true, stars: 2, completedAt: '2026-10-16T10:00:00.000Z' }));
    await a.data.settled();
    await b.data.progress.recordLessonProgress(lesson({ currentStep: 3, stars: 3 }));
    b.setOnline(true);
    await waitFor(() => b.data.sync.state().status === 'synced' && b.data.sync.state().pending === 0);
    await b.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;
    expect(server.rows<LessonProgressRow>('lesson_progress', uid)).toMatchObject([{ current_step: 6, completed: true, stars: 3 }]);
    await waitFor(async () => (await b.data.repos.lessonProgress.get('stufe0-figuren-turm'))?.completed);
    await waitFor(async () => (await a.data.repos.lessonProgress.get('stufe0-figuren-turm'))?.stars === 3);
    expect(await b.data.repos.lessonProgress.get('stufe0-figuren-turm')).toMatchObject({ currentStep: 6, completed: true, stars: 3 });
  });

  it('settings: the last writer wins', async () => {
    const server = new FakeSupabaseServer();
    let clockA = Date.parse('2026-10-16T10:00:00Z');
    let clockB = Date.parse('2026-10-16T10:00:00Z');
    const a = device(server, { email: EMAIL, now: () => new Date(clockA) });
    const b = device(server, { email: EMAIL, now: () => new Date(clockB) });
    await Promise.all([a.data.ready(), b.data.ready()]);
    b.setOnline(false);
    clockB += 60_000;
    await b.data.repos.profile.updateSettings({ notation: 'en' }); // later, but offline
    clockA += 1_000;
    await a.data.repos.profile.updateSettings({ sound: false }); // earlier, reaches the server first
    await a.data.settled();
    b.setOnline(true);
    await waitFor(() => b.data.sync.state().pending === 0 && b.data.sync.state().status === 'synced');
    await b.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;
    const settings = server.rows<ProfileRow>('profiles', uid)[0]!.settings;
    expect(settings).toMatchObject({ notation: 'en', sound: true, updatedAt: '2026-10-16T10:01:00.000Z' });
    await waitFor(async () => (await a.data.repos.profile.get())?.settings.notation === 'en');
    expect((await a.data.repos.profile.get())?.settings.sound).toBe(true);

    // A stale write never overwrites newer settings on the server.
    clockA += 1_000;
    a.setOnline(false);
    await a.data.repos.profile.updateSettings({ boardTheme: 'holz' });
    clockB += 60_000;
    await b.data.repos.profile.updateSettings({ boardTheme: 'moos', showCoordinates: false });
    await b.data.settled();
    a.setOnline(true);
    await waitFor(() => a.data.sync.state().pending === 0 && a.data.sync.state().status === 'synced');
    await a.data.settled();
    expect(server.rows<ProfileRow>('profiles', uid)[0]!.settings).toMatchObject({ boardTheme: 'moos', showCoordinates: false });
    await waitFor(async () => (await a.data.repos.profile.get())?.settings.showCoordinates === false);
  });

  it('heartbeats while offline are coalesced into one queued game row', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL, deviceId: 'device-a' });
    await a.data.ready();
    const g = await a.data.progress.createGame(newGame());
    await a.data.settled();
    a.setOnline(false);
    for (let i = 0; i < 5; i++) await a.data.repos.games.heartbeat(g.id, 'device-a');
    await a.data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    for (let i = 0; i < 5; i++) await a.data.repos.games.heartbeat(g.id, 'device-a');
    expect(await a.data.db.outbox.count()).toBe(2);
    a.setOnline(true);
    await waitFor(() => a.data.sync.state().status === 'synced' && a.data.sync.state().pending === 0);
    const uid = server.userByEmail(EMAIL)!.id;
    expect(server.rows('game_moves', uid)).toHaveLength(1);
    expect(server.rows<{ active_device_id: string }>('games', uid)[0]!.active_device_id).toBe('device-a');
  });
});

describe('server-computed values', () => {
  it('a finished competition game is rated on the server with the bot Elo (RD 50); the client value is replaced', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL });
    await a.data.ready();
    await a.data.progress.initializeFromSelfAssessment('beginner');
    const g = await a.data.progress.createGame(newGame());
    await a.data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    const { rating } = await a.data.progress.finishGame(g.id, '1-0', 'resignation', '1. e4 1-0');
    expect(rating?.provisional).toBe(true);
    await a.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;
    const expected = updateGlicko2({ rating: 400, rd: 350, volatility: 0.06 }, [{ opponentRating: 450, opponentRd: 50, score: 1 }]);
    const row = server.rows<RatingRow>('ratings', uid).find((r) => r.kind === 'bot')!;
    expect(row.rating).toBeCloseTo(expected.rating, 9);
    await waitFor(async () => (await a.data.repos.ratings.get('bot'))?.provisional === false);
    expect(server.rows('daily_activity', uid)).toMatchObject([{ games: 1 }]);
  });

  it('pulls everything after login on a new device', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL });
    await a.data.ready();
    await a.data.progress.initializeFromSelfAssessment('club');
    await a.data.progress.saveProfile({ displayName: 'Lea', onboardingCompleted: true });
    await a.data.progress.recordPuzzleAttempt(attempt(1, true));
    await a.data.progress.recordLessonProgress(lesson({ currentStep: 4 }));
    await a.data.settled();
    const b = device(server, { email: EMAIL });
    await b.data.ready();
    expect(await b.data.repos.profile.get()).toMatchObject({ displayName: 'Lea', onboardingCompleted: true, selfAssessment: 'club' });
    expect(await b.data.repos.puzzleAttempts.list()).toHaveLength(1);
    expect((await b.data.repos.ratings.get('puzzle'))?.gamesCount).toBe(1);
    expect((await b.data.repos.lessonProgress.get('stufe0-figuren-turm'))?.currentStep).toBe(4);
  });

  it('a first login on a device used in local mode uploads the local progress once', async () => {
    const server = new FakeSupabaseServer();
    const local = device(server, { mode: 'local' });
    await local.data.ready();
    await local.data.progress.initializeFromSelfAssessment('beginner');
    await local.data.progress.recordPuzzleAttempt(attempt(1, true));
    await local.data.progress.recordPuzzleAttempt(attempt(2, false));
    await local.data.progress.recordLessonProgress(lesson({ currentStep: 2 }));
    expect(local.data.sync.state()).toMatchObject({ mode: 'local', status: 'local-only', pending: 0 });
    const localRating = (await local.data.repos.ratings.get('puzzle'))!.rating;
    const dbName = local.dbName;
    local.close();
    devices.splice(devices.indexOf(local), 1);

    const cloud = device(server, { email: EMAIL, dbName });
    await cloud.data.ready();
    await waitFor(() => cloud.data.sync.state().pending === 0 && cloud.data.sync.state().status === 'synced');
    await cloud.data.settled();
    const uid = server.userByEmail(EMAIL)!.id;
    expect(server.rows('puzzle_attempts', uid)).toHaveLength(2);
    expect(server.rows<RatingRow>('ratings', uid).find((r) => r.kind === 'puzzle')!.rating).toBeCloseTo(localRating, 9);
    expect(server.rows<LessonProgressRow>('lesson_progress', uid)).toMatchObject([{ current_step: 2 }]);
    expect((await cloud.data.repos.profile.get())?.id).toBe(uid);
  });

  it('a different account on the same device never sees or uploads the previous account’s data', async () => {
    const server = new FakeSupabaseServer();
    const a = device(server, { email: EMAIL });
    await a.data.ready();
    await a.data.progress.recordLessonProgress(lesson({ currentStep: 2 }));
    await a.data.settled();
    const dbName = a.dbName;
    a.close();
    devices.splice(devices.indexOf(a), 1);
    const other = device(server, { email: 'max@example.com', dbName });
    await other.data.ready();
    await other.data.settled();
    expect(await other.data.repos.lessonProgress.list()).toEqual([]);
    const maxId = server.userByEmail('max@example.com')!.id;
    expect(server.rows('lesson_progress', maxId)).toEqual([]);
  });
});
