/**
 * Regression DS-1: starting the app offline with an expired access token keeps the user logged in; progress is
 * buffered in the outbox and syncing starts only once the token refresh succeeded.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { LessonProgress } from '@/core/lessons';
import type { LessonProgressRow } from '@/core/tables';
import { createFakeDevice, FakeSupabaseServer, waitFor, type FakeDevice } from '../testing';

const devices: FakeDevice[] = [];
afterEach(async () => {
  for (const d of devices.splice(0)) {
    await d.data.settled();
    d.close();
  }
});

const lesson: LessonProgress = {
  lessonId: 'stufe0-figuren-turm',
  lessonVersion: 1,
  currentStep: 2,
  completed: false,
  stars: 0,
  mistakes: 0,
  hintsUsed: 0,
  updatedAt: '',
  completedAt: null,
};

describe('DS-1 offline cold start', () => {
  it('lets the user in, buffers writes and syncs only after the token refresh', async () => {
    let clock = Date.parse('2026-10-19T10:00:00Z');
    const server = new FakeSupabaseServer({ now: () => new Date(clock), sessionTtlSeconds: 60 });
    const first = createFakeDevice(server, { email: 'lea@example.com' });
    devices.push(first);
    await first.data.ready();
    await first.data.settled();
    const uid = server.userByEmail('lea@example.com')!.id;
    const { storage, dbName } = first;
    first.close();

    // Hours later: the app is opened offline (airplane mode); the stored access token is long expired.
    clock += 3 * 3600_000;
    const second = createFakeDevice(server, { storage, dbName, session: undefined, online: false });
    devices.push(second);
    await second.data.ready();
    expect(second.data.auth.session()).toMatchObject({ userId: uid, provider: 'email', unverified: true });

    await second.data.progress.recordLessonProgress(lesson);
    await waitFor(() => second.data.sync.state().pending === 1);
    expect(second.data.sync.state()).toMatchObject({ status: 'offline', pending: 1 });

    // Back online, but the token is not refreshed yet: nothing is sent.
    second.setOnline(true);
    await second.data.settled();
    expect(second.data.sync.state().pending).toBe(1);
    expect(server.rows<LessonProgressRow>('lesson_progress', uid)).toHaveLength(0);

    // The refresh (supabase-js auto refresh) succeeds → the real session arrives and the outbox is flushed.
    await second.client.auth.getSession();
    await waitFor(() => second.data.sync.state().pending === 0 && second.data.sync.state().status === 'synced', 5000);
    expect(second.data.auth.session()?.unverified).toBeUndefined();
    expect(server.rows<LessonProgressRow>('lesson_progress', uid)).toHaveLength(1);
  });
});
