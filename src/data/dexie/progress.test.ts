/** ProgressService on Dexie: write transactions stay short (≤ 50 ms) and queue exactly one outbox entry per write. */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { toRow } from '@/core/tables';
import type { LessonProgress } from '@/core/lessons';
import { applyRemoteChanges } from '../sync/applyRemote';
import { createFakeDevice, FakeSupabaseServer, type FakeDevice } from '../testing';

const devices: FakeDevice[] = [];
afterEach(() => {
  for (const d of devices.splice(0)) d.close();
});

describe('Dexie ProgressService', () => {
  it('each write is one short transaction (median ≤ 50 ms) with its outbox entry', async () => {
    const server = new FakeSupabaseServer();
    // Offline, so the outbox keeps every entry for counting.
    const d = createFakeDevice(server, { email: 'lea@example.com', online: false });
    devices.push(d);
    await d.data.ready();
    await d.data.progress.initializeFromSelfAssessment('beginner');
    const base = await d.data.db.outbox.count();
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const t = performance.now();
      await d.data.progress.recordPuzzleAttempt({
        puzzleId: `p${i}`,
        mode: 'rated',
        solved: i % 3 !== 0,
        firstTry: true,
        hintsUsed: 0,
        solutionShown: false,
        timeMs: 1000,
        themes: ['fork', 'pin'],
        puzzleRating: 600 + i,
        puzzleRd: 80,
      });
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]).toBeLessThanOrEqual(50);
    expect((await d.data.db.outbox.count()) - base).toBe(30);
    const kinds = (await d.data.db.outbox.toArray()).map((e) => `${e.table}:${e.op}`);
    expect(kinds.filter((k) => k === 'puzzle_attempts:insert')).toHaveLength(30);
  });

  it('rated puzzle marker lives in meta and is cleared by the attempt for that puzzle; floor keeps rating >= 100', async () => {
    const d = createFakeDevice(new FakeSupabaseServer(), { email: 'lea@example.com', online: false });
    devices.push(d);
    await d.data.ready();
    await d.data.progress.initializeFromSelfAssessment('beginner');
    await d.data.progress.markRatedPuzzleShown('p1');
    expect(await d.data.progress.pendingRatedPuzzle()).toMatchObject({ puzzleId: 'p1' });
    expect((await d.data.db.meta.get('pendingRated'))?.value).toMatchObject({ puzzleId: 'p1' });
    const failed = { mode: 'rated' as const, solved: false, firstTry: false, hintsUsed: 0 as const, solutionShown: false, timeMs: 1, themes: [], puzzleRating: 150, puzzleRd: 80 };
    for (let i = 0; i < 8; i++) {
      const r = await d.data.progress.recordPuzzleAttempt({ ...failed, puzzleId: i === 0 ? 'p1' : `q${i}` });
      expect(r.rating!.rating).toBeGreaterThanOrEqual(100);
      if (i === 0) expect(await d.data.progress.pendingRatedPuzzle()).toBeNull();
    }
    await d.data.progress.markRatedPuzzleShown('p1'); // already rated: no marker
    expect(await d.data.progress.pendingRatedPuzzle()).toBeNull();
  });

  it('appendGameEvent queues only the move (the game row was queued by createGame)', async () => {
    const server = new FakeSupabaseServer();
    const d = createFakeDevice(server, { email: 'lea@example.com', online: false });
    devices.push(d);
    await d.data.ready();
    const before = await d.data.db.outbox.count();
    const g = await d.data.progress.createGame({
      source: 'bot',
      externalId: null,
      botId: 'b',
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
      finishedAt: null,
    });
    await d.data.progress.appendGameEvent({ gameId: g.id, seq: 1, kind: 'move', ply: 1, uci: 'e2e4', san: 'e4' });
    await d.data.progress.appendGameEvent({ gameId: g.id, seq: 2, kind: 'move', ply: 2, uci: 'e7e5', san: 'e5' });
    const entries = (await d.data.db.outbox.toArray()).slice(before);
    expect(entries.map((e) => e.table)).toEqual(['games', 'game_moves', 'game_moves']);
    expect((await d.data.repos.games.list())[0]!.updatedAt >= g.updatedAt).toBe(true);
  });

  it('lesson progress: a retry after a failed test resumes, a remote copy of the failed run cannot override it (LC-4)', async () => {
    let t = Date.parse('2026-10-20T10:00:00.000Z');
    const d = createFakeDevice(new FakeSupabaseServer(), { email: 'lea@example.com', online: false, now: () => new Date((t += 60_000)) });
    devices.push(d);
    await d.data.ready();
    const rec = (o: Partial<LessonProgress>): LessonProgress => ({
      lessonId: 'test-1', lessonVersion: 1, currentStep: 0, completed: false, stars: 0, mistakes: 0, hintsUsed: 0, updatedAt: '', completedAt: null, ...o,
    });
    const failed = await d.data.progress.recordLessonProgress(rec({ currentStep: 8, score: 0, mistakes: 7 }));
    const retry = await d.data.progress.recordLessonProgress(rec({ currentStep: 4, score: 4 / 7 }));
    expect(retry).toMatchObject({ currentStep: 4, score: 4 / 7, mistakes: 0 });
    // A mistake on the next step is stored with the same currentStep and its step penalty.
    expect(await d.data.progress.recordLessonProgress(rec({ currentStep: 4, score: 4 / 7, mistakes: 1, stepPenalty: 1 }))).toMatchObject({ currentStep: 4, mistakes: 1, stepPenalty: 1 });
    // The server's copy of the failed run (older) arrives afterwards (e.g. from the first pull).
    await applyRemoteChanges(d.data.db, [{ table: 'lesson_progress', op: 'update', row: toRow.lessonProgress(failed, d.data.db.name) }]);
    expect(await d.data.repos.lessonProgress.get('test-1')).toMatchObject({ currentStep: 4, mistakes: 1, stepPenalty: 1, score: 4 / 7 });
  });
});
