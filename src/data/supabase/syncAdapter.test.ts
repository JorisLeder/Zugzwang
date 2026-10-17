import { describe, expect, it, vi } from 'vitest';
import type { OutboxEntry, RemoteChange } from '@/core/storage';
import { outbox } from '../outbox';
import { createFakeSupabaseClient, FakeSupabaseServer, waitFor } from '../testing';
import { createSupabaseSyncAdapter, groupEntries, isRetryableStatus } from './syncAdapter';

function setup() {
  const server = new FakeSupabaseServer();
  const user = server.createUser('lea@example.com');
  const client = createFakeSupabaseClient(server, { session: server.issueSession(user.id) });
  let uid: string | null = user.id;
  const adapter = createSupabaseSyncAdapter({ client: async () => client, userId: () => uid, pageSize: 2 });
  return { server, user, client, adapter, logout: () => (uid = null) };
}

const AT = '2026-10-16T10:00:00.000Z';
const fb = (id: string) => outbox.explanationFeedback({ id, context: 'puzzle', ref: id, vote: 1, createdAt: AT }, 'local-user', AT);

describe('SupabaseSyncAdapter', () => {
  it('classifies retryable statuses and groups consecutive entries of one table/op', () => {
    expect([0, 401, 408, 429, 500, 503, undefined].every(isRetryableStatus)).toBe(true);
    expect([400, 403, 404, 409, 422].some(isRetryableStatus)).toBe(false);
    const a = fb('a');
    const b = fb('b');
    const l = outbox.lessonProgress({ lessonId: 'l', lessonVersion: 1, currentStep: 1, completed: false, stars: 0, mistakes: 0, hintsUsed: 0, updatedAt: AT, completedAt: null }, AT);
    expect(groupEntries([a, b, l, { ...l, id: 'l2' }, fb('c')]).map((g) => g.length)).toEqual([2, 1, 1, 1]);
  });

  it('inserts append-only rows with the logged-in owner and reports duplicates (also within one batch)', async () => {
    const { server, user, adapter } = setup();
    const a = fb('a');
    const res = await adapter.push([a, { ...a, id: 'dup-entry' }, fb('b')]);
    expect(res).toEqual([
      { id: a.id, ok: true },
      { id: 'dup-entry', ok: true, duplicate: true },
      { id: expect.any(String), ok: true },
    ]);
    expect(server.rows('explanation_feedback', user.id).map((r) => r.id)).toEqual(['a', 'b']);
    expect((await adapter.push([fb('a')]))[0]).toMatchObject({ ok: true, duplicate: true });
  });

  it('stops at a retryable failure so later entries never overtake earlier ones', async () => {
    const { server, adapter } = setup();
    server.failNext({ count: 1, status: 503, match: (r) => r.target === 'explanation_feedback' });
    const day = outbox.dailyMinutes('2026-10-16', 5, AT);
    const res = await adapter.push([fb('a'), day]);
    expect(res.map((r) => [r.ok, r.retryable])).toEqual([
      [false, true],
      [false, true],
    ]);
    expect(server.log.filter((l) => l.kind === 'rpc')).toHaveLength(0);
  });

  it('permanent failures do not stop the rest; invalid entries are rejected permanently', async () => {
    const { adapter } = setup();
    const bad: OutboxEntry = { id: 'x', table: 'daily_activity', op: 'rpc', payload: { nope: true }, enqueuedAt: AT, attempts: 0 };
    const unknown: OutboxEntry = { id: 'y', table: 'bots', op: 'upsert', payload: {}, enqueuedAt: AT, attempts: 0 };
    const res = await adapter.push([bad, unknown, outbox.dailyMinutes('2026-10-16', 5, AT)]);
    expect(res.map((r) => r.ok)).toEqual([false, false, true]);
    expect(res[0]).toMatchObject({ retryable: false });
    expect(res[1]).toMatchObject({ retryable: false });
  });

  it('without a session nothing is pushed (retry later)', async () => {
    const { adapter, logout, server } = setup();
    logout();
    expect(await adapter.push([fb('a')])).toEqual([{ id: expect.any(String), ok: false, error: 'Nicht angemeldet', retryable: true }]);
    expect(await adapter.pullAll()).toEqual([]);
    expect(server.log).toHaveLength(0);
  });

  it('pulls all pages of the own rows and receives realtime changes of the own rows only', async () => {
    const { server, user, adapter } = setup();
    await adapter.push(['a', 'b', 'c'].map(fb));
    const pulled = await adapter.pullAll();
    expect(pulled.filter((c) => c.table === 'explanation_feedback')).toHaveLength(3);

    const other = server.createUser('max@example.com');
    const otherClient = createFakeSupabaseClient(server, { session: server.issueSession(other.id) });
    const otherAdapter = createSupabaseSyncAdapter({ client: async () => otherClient, userId: () => other.id });

    const seen: RemoteChange[] = [];
    const off = adapter.subscribe((c) => seen.push(c));
    await waitFor(() => server.subscriptionCount() > 0);
    await otherAdapter.push([fb('m')]);
    await adapter.push([fb('d')]);
    await waitFor(() => seen.length === 1);
    expect(seen[0]).toMatchObject({ table: 'explanation_feedback', op: 'insert', row: { id: 'd', user_id: user.id } });
    off();
    expect(server.subscriptionCount()).toBe(0); // unsubscribing removes the channel
  });

  it('collapses several upserts of the same game in one batch with the merge rules', async () => {
    const { server, user, adapter } = setup();
    const game = {
      id: 'g1',
      source: 'bot' as const,
      externalId: null,
      botId: 'b',
      userColor: 'w' as const,
      assistance: 'training' as const,
      timeControl: { kind: 'none' as const },
      startFen: 'x',
      pgn: '',
      headers: {},
      status: 'active' as const,
      result: '*' as const,
      endReason: null,
      origin: { type: 'new' as const },
      activeDeviceId: 'a',
      activeHeartbeatAt: '2026-10-16T10:00:00.000Z',
      ratingBefore: null,
      ratingAfter: null,
      createdAt: AT,
      updatedAt: AT,
      finishedAt: null,
    };
    const finished = { ...game, status: 'finished' as const, result: '1-0' as const, updatedAt: '2026-10-16T10:01:00.000Z' };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await adapter.push([outbox.game(game, 'x', AT), outbox.game(finished, 'x', AT)]);
    warn.mockRestore();
    expect(res.every((r) => r.ok)).toBe(true);
    expect(server.rows('games', user.id)).toMatchObject([{ id: 'g1', status: 'finished', user_id: user.id }]);
  });
});
