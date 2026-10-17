/**
 * Outbox flushing and sync status (PRD "So wird reaktiv umgesetzt").
 *
 * - Flush right after a write (debounce ≤ 100 ms) when online, on the `online` event and at start.
 * - Failures: exponential backoff 1 s → 60 s; the entries stay in the outbox (nothing is lost). Retryable failures
 *   (network, 5xx) stop the run to keep the order; permanent ones are retried with the same backoff while the rest
 *   of the outbox is still pushed.
 * - Idempotent: row ids are client UUIDs, the backend reports duplicates as success.
 * - Status: `local-only` (local mode) · `offline` · `error` (failed, retrying) · `pending` (sending) · `synced`.
 * - Flushes are serialised across tabs with the Web Locks API when available.
 */
import { liveQuery } from 'dexie';
import type { OutboxEntry, PushResult, RemoteChange, SyncService, SyncState } from '@/core/storage';
import type { UserTableName } from '@/core/tables';
import { createValueStore } from '@/lib/observable';
import type { OutboxRow, ZugzwangDb } from '../db';
import { META } from '../db';
import { DERIVED_TABLES } from './tables';

/** Online state source (browser `navigator.onLine` + events; injectable in tests). */
export interface OnlineSource {
  isOnline(): boolean;
  subscribe(cb: (online: boolean) => void): () => void;
}

/** `navigator.onLine` with `online`/`offline` events; always online outside the browser. */
export function browserOnlineSource(): OnlineSource {
  const hasWindow = typeof window !== 'undefined' && typeof window.addEventListener === 'function';
  return {
    isOnline: () => (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true),
    subscribe(cb) {
      if (!hasWindow) return () => {};
      const on = () => cb(true);
      const off = () => cb(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      return () => {
        window.removeEventListener('online', on);
        window.removeEventListener('offline', off);
      };
    },
  };
}

/** Manually controlled online source (tests, fake backend demos). */
export function manualOnlineSource(initial = true): OnlineSource & { set(online: boolean): void } {
  let online = initial;
  const listeners = new Set<(o: boolean) => void>();
  return {
    isOnline: () => online,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set(next) {
      if (next === online) return;
      online = next;
      for (const l of [...listeners]) l(online);
    },
  };
}

/** Retry delay after `failures` consecutive failed runs: 1 s, 2 s, 4 s … capped at 60 s. */
export function backoffDelay(failures: number, baseMs = 1000, maxMs = 60_000): number {
  if (failures <= 0) return 0;
  return Math.min(maxMs, baseMs * 2 ** Math.min(failures - 1, 30));
}

/** Backend adapter of the sync service (`SyncAdapter` + optional partial pull). */
export interface DataSyncAdapter {
  readonly kind: 'none' | 'supabase' | 'memory';
  push(entries: OutboxEntry[]): Promise<PushResult[]>;
  pullAll(): Promise<RemoteChange[]>;
  subscribe(onChange: (c: RemoteChange) => void): () => void;
  /** Pulls only some tables (server-computed values after a flush). */
  pull?(tables: readonly UserTableName[]): Promise<RemoteChange[]>;
}

/** Adapter of local mode: nothing to push or pull. */
export const NO_SYNC_ADAPTER: DataSyncAdapter = {
  kind: 'none',
  push: async (entries) => entries.map((e) => ({ id: e.id, ok: false, retryable: true, error: 'Lokaler Modus' })),
  pullAll: async () => [],
  subscribe: () => () => {},
};

/** Options of `createSyncEngine`. */
export interface SyncEngineOptions {
  db: ZugzwangDb;
  mode: 'local' | 'cloud';
  adapter: DataSyncAdapter;
  /** Applies pulled/realtime changes locally. */
  applyRemote(changes: readonly RemoteChange[]): Promise<void>;
  online?: OnlineSource;
  /** False while nobody is logged in (cloud mode). */
  canSync?: () => boolean;
  /** Debounce after a write (default 50 ms, at most 100 ms). */
  debounceMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Entries per push (default 100). */
  batchSize?: number;
  now?: () => Date;
}

/** Sync engine = `SyncService` + lifecycle used by the data services. */
export interface SyncEngine extends SyncService {
  /** Starts listening (online events, outbox count) and flushes once. */
  start(): void;
  stop(): void;
  /** A write added outbox entries: flush soon. */
  notifyEnqueued(): void;
  /** Pulls everything from the backend and applies it (after login, on reconnect). */
  pullAll(): Promise<void>;
  /** Subscribes to realtime changes (returns the unsubscribe function). */
  subscribeRealtime(): () => void;
  /** Resolves once no flush is running or scheduled by a write (tests). */
  idle(): Promise<void>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Creates the sync engine. */
export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const { db, mode, adapter } = opts;
  const online = opts.online ?? browserOnlineSource();
  const canSync = opts.canSync ?? (() => true);
  const debounceMs = Math.min(100, opts.debounceMs ?? 50);
  const baseMs = opts.backoffBaseMs ?? 1000;
  const maxMs = opts.backoffMaxMs ?? 60_000;
  const batchSize = opts.batchSize ?? 100;
  const now = opts.now ?? (() => new Date());
  const enabled = mode === 'cloud' && adapter.kind !== 'none';

  let pending = 0;
  let failures = 0;
  let lastError: string | undefined;
  let lastSyncedAt: string | undefined;
  let running: Promise<void> | null = null;
  let rerun = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  const unsubs: Array<() => void> = [];

  const store = createValueStore<SyncState>(compute());

  function compute(): SyncState {
    const isOnline = online.isOnline();
    let status: SyncState['status'];
    if (mode === 'local') status = 'local-only';
    else if (!isOnline) status = 'offline';
    else if (lastError && pending > 0) status = 'error';
    else if (pending > 0) status = 'pending';
    else status = 'synced';
    const s: SyncState = { mode, online: isOnline, pending, status };
    if (lastSyncedAt) s.lastSyncedAt = lastSyncedAt;
    if (lastError && status === 'error') s.error = lastError;
    return s;
  }

  function publish(): void {
    const next = compute();
    const cur = store.get();
    if (
      cur.status !== next.status ||
      cur.pending !== next.pending ||
      cur.online !== next.online ||
      cur.lastSyncedAt !== next.lastSyncedAt ||
      cur.error !== next.error
    ) {
      store.set(next);
    }
  }

  async function recount(): Promise<void> {
    pending = await db.outbox.count();
    publish();
  }

  function clearRetry(): void {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry(): void {
    clearRetry();
    if (!started) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void engine.flush();
    }, backoffDelay(failures, baseMs, maxMs));
  }

  async function withLock(fn: () => Promise<void>): Promise<void> {
    const locks = (globalThis.navigator as Navigator | undefined)?.locks;
    if (locks?.request) {
      await locks.request(`zugzwang-sync-${db.name}`, fn);
      return;
    }
    await fn();
  }

  async function refreshDerived(): Promise<void> {
    if (!adapter.pull) return;
    if ((await db.outbox.count()) > 0) return;
    try {
      await opts.applyRemote(await adapter.pull(DERIVED_TABLES));
    } catch (e) {
      console.warn('Sync: refreshing server values failed', e);
    }
  }

  async function flushOnce(): Promise<void> {
    if (!online.isOnline() || !canSync()) return;
    clearRetry();
    let afterSeq = 0;
    let pushed = 0;
    let failed: PushResult | undefined;
    for (;;) {
      const batch: OutboxRow[] = await db.outbox.where('seq').above(afterSeq).limit(batchSize).toArray();
      if (!batch.length) break;
      afterSeq = batch[batch.length - 1]!.seq!;
      let results: PushResult[];
      try {
        results = await adapter.push(batch.map(({ seq: _seq, ...e }) => e));
      } catch (e) {
        results = batch.map((b) => ({ id: b.id, ok: false, retryable: true, error: message(e) }));
      }
      const byId = new Map(results.map((r) => [r.id, r]));
      const okIds = batch.filter((b) => byId.get(b.id)?.ok).map((b) => b.id);
      const bad = batch.map((b) => byId.get(b.id) ?? { id: b.id, ok: false, retryable: true, error: 'Keine Antwort' }).filter((r) => !r.ok);
      await db.transaction('rw', db.outbox, async () => {
        if (okIds.length) await db.outbox.where('id').anyOf(okIds).delete();
        for (const r of bad) {
          await db.outbox
            .where('id')
            .equals(r.id)
            .modify((e) => {
              e.attempts += 1;
              e.lastError = r.error;
            });
        }
      });
      pushed += okIds.length;
      if (bad.length) failed ??= bad[0];
      await recount();
      if (bad.some((r) => r.retryable !== false)) break; // keep the order: retry later
    }
    if (failed) {
      failures += 1;
      lastError = failed.error ?? 'Speichern fehlgeschlagen';
      publish();
      scheduleRetry();
      return;
    }
    failures = 0;
    lastError = undefined;
    lastSyncedAt = now().toISOString();
    publish();
    if (pushed > 0) await refreshDerived();
  }

  const engine: SyncEngine = {
    state: () => store.get(),
    observe: () => store,

    flush() {
      if (!enabled) return Promise.resolve();
      if (running) {
        rerun = true;
        return running;
      }
      running = (async () => {
        try {
          do {
            rerun = false;
            await withLock(flushOnce);
          } while (rerun);
        } catch (e) {
          console.warn('Sync: flush failed', e);
        } finally {
          running = null;
          publish();
        }
      })();
      return running;
    },

    notifyEnqueued() {
      void recount();
      if (!enabled || !started) return;
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void engine.flush();
      }, debounceMs);
    },

    async pullAll() {
      if (!enabled || !online.isOnline() || !canSync()) return;
      await opts.applyRemote(await adapter.pullAll());
      await db.setMeta(META.lastPullAt, now().toISOString());
    },

    subscribeRealtime() {
      if (!enabled) return () => {};
      return adapter.subscribe((change) => {
        opts.applyRemote([change]).catch((e) => console.warn('Sync: applying a realtime change failed', e));
      });
    },

    start() {
      if (started) return;
      started = true;
      unsubs.push(
        online.subscribe((isOnline) => {
          publish();
          if (isOnline && enabled) {
            void engine.flush().then(() => engine.pullAll().catch((e) => console.warn('Sync: pull after reconnect failed', e)));
          }
        }),
      );
      const sub = liveQuery(() => db.outbox.count()).subscribe({
        next: (n) => {
          pending = n;
          publish();
        },
        error: (e: unknown) => console.warn('Sync: outbox count failed', e),
      });
      unsubs.push(() => sub.unsubscribe());
      void engine.flush();
    },

    stop() {
      started = false;
      clearRetry();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = null;
      for (const u of unsubs.splice(0)) u();
    },

    async idle() {
      for (let i = 0; i < 100; i++) {
        if (debounceTimer) await new Promise((r) => setTimeout(r, debounceMs + 5));
        else if (running) await running;
        else return;
      }
    },
  };
  return engine;
}
