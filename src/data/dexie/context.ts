/** Shared context of the Dexie repositories and the ProgressService. */
import { liveQuery } from 'dexie';
import type { Profile } from '@/core/profile';
import { DEFAULT_DAILY_GOAL_MINUTES, DEFAULT_SETTINGS } from '@/core/profile';
import type { OutboxEntry, Subscribable } from '@/core/storage';
import { fromObservable } from '@/lib/observable';
import type { ZugzwangDb } from '../db';

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
  /** Called after a transaction added outbox entries (schedules a flush). */
  enqueued(): void;
}

/** Live query adapted to `Subscribable`. */
export function live<T>(query: () => Promise<T>): Subscribable<T> {
  return fromObservable(liveQuery(query));
}

/** Adds outbox entries inside the current transaction. */
export async function enqueue(ctx: DataContext, ...entries: OutboxEntry[]): Promise<void> {
  await ctx.db.outbox.bulkAdd(entries);
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
