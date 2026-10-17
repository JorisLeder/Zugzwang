/** Shared context of the Dexie repositories and the ProgressService. */
import { liveQuery } from 'dexie';
import type { Profile } from '@/core/profile';
import { DEFAULT_DAILY_GOAL_MINUTES, DEFAULT_SETTINGS } from '@/core/profile';
import type { OutboxEntry, Subscribable } from '@/core/storage';
import { fromObservable } from '@/lib/observable';
import type { ZugzwangDb } from '../db';
import { isUserTable, rowKey } from '../sync/tables';

/** Everything the repositories need. */
export interface DataContext {
  db: ZugzwangDb;
  now(): Date;
  nowIso(): string;
  /** Time zone of daily activity. */
  timeZone: string;
  /** Owner id for new rows (auth user id in cloud mode, local profile id in local mode). */
  userId(): string;
  /** Client-computed ratings are provisional until the server confirms them (cloud mode). */
  provisional: boolean;
  /**
   * Writes add outbox entries (cloud mode). Local mode has no backend: nothing is queued; the first cloud login
   * uploads a snapshot of the local data instead (`snapshotEntries`).
   */
  outboxEnabled: boolean;
  /** Called after a transaction added outbox entries (schedules a flush). */
  enqueued(): void;
}

/** Errors of a live query: a closed database (deleted in another tab, page unloading) is expected and silent. */
function onLiveError(e: unknown): void {
  if ((e as { name?: string } | null)?.name === 'DatabaseClosedError') return;
  console.warn('Daten: live query failed', e);
}

/** Live query adapted to `Subscribable`. */
export function live<T>(query: () => Promise<T>): Subscribable<T> {
  return fromObservable(liveQuery(query), onLiveError);
}

/** Upsert tables whose pending entry for the same row is replaced instead of queueing another one (heartbeats). */
const COALESCED_TABLES = new Set(['profiles', 'games', 'game_analyses', 'review_queue']);

/**
 * Adds outbox entries inside the current transaction. An `upsert` of a row that already has a pending upsert
 * replaces that entry's payload in place (same position, `rev + 1`): the payload is always the full current row, so
 * the newest state wins and e.g. a game row still precedes the moves that reference it.
 */
export async function enqueue(ctx: DataContext, ...entries: OutboxEntry[]): Promise<void> {
  if (!ctx.outboxEnabled) return;
  for (const e of entries) {
    if (e.op === 'upsert' && COALESCED_TABLES.has(e.table) && isUserTable(e.table)) {
      const table = e.table;
      const key = rowKey(table, e.payload as Record<string, unknown>);
      const pending = await ctx.db.outbox
        .where('table')
        .equals(table)
        .filter((r) => r.op === 'upsert' && rowKey(table, r.payload as Record<string, unknown>) === key)
        .first();
      if (pending?.seq !== undefined) {
        await ctx.db.outbox.update(pending.seq, { payload: e.payload, rev: (pending.rev ?? 0) + 1 });
        continue;
      }
    }
    await ctx.db.outbox.add({ ...e, rev: 0 });
  }
}

/** The default profile of a new user. */
export function defaultProfile(id: string, at: string): Profile {
  return {
    id,
    displayName: 'Du',
    settings: { ...DEFAULT_SETTINGS },
    dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
    selfAssessment: null,
    onboardingCompleted: false,
    stageZeroSkipped: false,
    createdAt: at,
    updatedAt: at,
  };
}

/** The stored profile (there is at most one). */
export async function currentProfile(db: ZugzwangDb): Promise<Profile | null> {
  return (await db.profile.toCollection().first()) ?? null;
}

/** Replaces the stored profile (keeps a single row even when the id changes, e.g. local → cloud). */
export async function putProfile(db: ZugzwangDb, p: Profile): Promise<void> {
  const existing = await db.profile.toCollection().primaryKeys();
  const stale = existing.filter((k) => k !== p.id);
  if (stale.length) await db.profile.bulkDelete(stale);
  await db.profile.put(p);
}
