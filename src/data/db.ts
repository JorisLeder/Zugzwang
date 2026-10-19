/**
 * Dexie database `zugzwang`: one table per entity plus `outbox` (unsent writes, ordered by `seq`) and `meta`
 * (key/value: owner, bank version). Versioned schema – add a new `version(n)` with an upgrade for every change,
 * never edit an existing version.
 */
import Dexie, { type Table } from 'dexie';
import type { GameAnalysis } from '@/core/analysis';
import type { ExplanationFeedback } from '@/core/explain';
import type { Game, GameMoveEvent } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import type { DailyActivity, Profile, ReviewQueueItem, ThemeStat } from '@/core/profile';
import type { Puzzle, PuzzleAttempt } from '@/core/puzzles';
import type { RatingKind, RatingRecord } from '@/core/rating';
import type { OutboxEntry } from '@/core/storage';

/** Default database name. */
export const DB_NAME = 'zugzwang';

/** Outbox row: the entry plus its auto-increment position (push order). */
export interface OutboxRow extends OutboxEntry {
  seq?: number;
  /**
   * Revision of the payload: a newer write of the same row (upsert tables) replaces the payload of the pending entry
   * in place and increments `rev`; a push confirms the entry only if `rev` is unchanged.
   */
  rev?: number;
}

/** An outbox entry the backend rejected permanently (kept in `meta` for support and the export). */
export interface DeadLetter extends OutboxEntry {
  droppedAt: string;
}

/** Key/value row of `meta`. */
export interface MetaRow {
  key: string;
  value: unknown;
}

/** Keys used in `meta`. */
export const META = {
  /** User id the local data belongs to. */
  ownerId: 'ownerId',
  /** `local` (local mode – may be adopted by the first cloud login) or `cloud`. */
  ownerKind: 'ownerKind',
  /** Version of the loaded puzzle bank. */
  bankVersion: 'bankVersion',
  /** Last successful full pull (cloud mode). */
  lastPullAt: 'lastPullAt',
  /** Rated puzzle shown but without an attempt yet (`{puzzleId, startedAt}`). */
  pendingRated: 'pendingRated',
  /** Entries the backend rejected permanently (`DeadLetter[]`). */
  deadLetters: 'deadLetters',
} as const;

/** Schema version 1 (primary key first, then indexes). */
export const SCHEMA_V1: Record<string, string> = {
  profile: 'id',
  ratings: 'kind',
  puzzles: 'id, rating, [rating+id], *themes, *openingTags',
  puzzleAttempts: 'id, createdAt, mode, puzzleId',
  games: 'id, updatedAt, status, source, [source+externalId]',
  gameMoves: 'id, gameId, &[gameId+seq]',
  gameAnalyses: 'gameId',
  lessonProgress: 'lessonId',
  dailyActivity: 'date',
  themeStats: 'theme',
  reviewQueue: 'id, dueAt',
  explanationFeedback: 'id, [context+ref], createdAt',
  outbox: '++seq, &id, table',
  meta: 'key',
};

/** Tables holding user data (wiped on account deletion; the puzzle bank is static content). */
export const USER_DATA_TABLES = [
  'profile',
  'ratings',
  'puzzleAttempts',
  'games',
  'gameMoves',
  'gameAnalyses',
  'lessonProgress',
  'dailyActivity',
  'themeStats',
  'reviewQueue',
  'explanationFeedback',
  'outbox',
] as const;

/** IndexedDB implementation (the browser's, or fake-indexeddb in tests). */
export interface IndexedDbDeps {
  indexedDB: IDBFactory;
  IDBKeyRange: typeof IDBKeyRange;
}

/** The typed Dexie database. Opens lazily on first use. */
export class ZugzwangDb extends Dexie {
  profile!: Table<Profile, string>;
  ratings!: Table<RatingRecord, RatingKind>;
  puzzles!: Table<Puzzle, string>;
  puzzleAttempts!: Table<PuzzleAttempt, string>;
  games!: Table<Game, string>;
  gameMoves!: Table<GameMoveEvent, string>;
  gameAnalyses!: Table<GameAnalysis, string>;
  lessonProgress!: Table<LessonProgress, string>;
  dailyActivity!: Table<DailyActivity, string>;
  themeStats!: Table<ThemeStat, string>;
  reviewQueue!: Table<ReviewQueueItem, string>;
  explanationFeedback!: Table<ExplanationFeedback, string>;
  outbox!: Table<OutboxRow, number>;
  meta!: Table<MetaRow, string>;

  constructor(name: string = DB_NAME, deps?: IndexedDbDeps) {
    super(name, deps ? { indexedDB: deps.indexedDB, IDBKeyRange: deps.IDBKeyRange } : undefined);
    this.version(1).stores(SCHEMA_V1);
  }

  /** Reads a meta value. */
  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.meta.get(key))?.value as T | undefined;
  }

  /** Writes a meta value. */
  async setMeta(key: string, value: unknown): Promise<void> {
    await this.meta.put({ key, value });
  }
}

/** The global IndexedDB, or `null` when the environment has none (old WebView, SSR, Node without a shim). */
export function globalIndexedDb(): IndexedDbDeps | null {
  const g = globalThis as { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange };
  try {
    if (g.indexedDB && g.IDBKeyRange) return { indexedDB: g.indexedDB, IDBKeyRange: g.IDBKeyRange };
  } catch {
    // Accessing indexedDB can throw (e.g. sandboxed iframes).
  }
  return null;
}
