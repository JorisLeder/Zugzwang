/**
 * `@/data/testing` – fake backend for tests of the data layer and of features that need cloud mode:
 * `FakeSupabaseServer` (in-memory Postgres/Auth/Realtime semantics), `createFakeSupabaseClient` (supabase-js subset)
 * and `createFakeDevice` (Dexie data services in cloud mode wired to the fake server – one per simulated device).
 * Needs an IndexedDB implementation (`import 'fake-indexeddb/auto'` in node tests; the dom setup loads it).
 */
import type { SbSession } from '../supabase/types';
import { globalIndexedDb, type IndexedDbDeps } from '../db';
import { createDexieDataServices, type DexieDataOptions, type DexieDataServices } from '../services';
import { manualOnlineSource } from '../sync/syncService';
import { createFakeSupabaseClient, FAKE_AUTH_STORAGE_KEY, type FakeSupabaseClient } from './fakeClient';
import type { FakeSupabaseServer } from './fakeServer';
import { newId } from '@/lib/ids';

export { waitFor } from './waitFor';
export { createFakeSupabaseClient, FAKE_AUTH_STORAGE_KEY, type FakeClientOptions, type FakeSupabaseClient } from './fakeClient';
export { FakeServerError, FakeSupabaseServer, type FailureRule, type FakeRequest, type FakeServerOptions, type FakeUser } from './fakeServer';

/** Options of `createFakeDevice`. */
export interface FakeDeviceOptions {
  /** Log in as this e-mail address (the user is created on the server if needed). */
  email?: string;
  /** Explicit session (overrides `email`); `null` = logged out. */
  session?: SbSession | null;
  /** Persisted auth storage – pass the one of another device object to simulate a reload of the same browser. */
  storage?: Map<string, string>;
  /** IndexedDB database name (default: unique per device; reuse it to simulate a reload). */
  dbName?: string;
  online?: boolean;
  now?: () => Date;
  timeZone?: string;
  deviceId?: string;
  sync?: DexieDataOptions['sync'];
  indexedDb?: IndexedDbDeps;
  mode?: 'local' | 'cloud';
}

/** One simulated device. */
export interface FakeDevice {
  data: DexieDataServices;
  client: FakeSupabaseClient;
  storage: Map<string, string>;
  dbName: string;
  /** Switches the device's network (requests, realtime and the `online` event of the sync service). */
  setOnline(online: boolean): void;
  close(): void;
}

/** Creates a device in cloud mode on `server` (logged in when `email` or `session` is given). */
export function createFakeDevice(server: FakeSupabaseServer, opts: FakeDeviceOptions = {}): FakeDevice {
  const indexedDb = opts.indexedDb ?? globalIndexedDb();
  if (!indexedDb) throw new Error('createFakeDevice needs IndexedDB (import "fake-indexeddb/auto").');
  const online = manualOnlineSource(opts.online ?? true);
  const storage = opts.storage ?? new Map<string, string>();
  let session = opts.session;
  if (session === undefined && opts.email) session = server.issueSession(server.createUser(opts.email).id);
  const client = createFakeSupabaseClient(server, { storage, session, online: () => online.isOnline() });
  const dbName = opts.dbName ?? `zugzwang-test-${newId()}`;
  const data = createDexieDataServices({
    mode: opts.mode ?? 'cloud',
    dbName,
    indexedDb,
    client: async () => client,
    online,
    now: opts.now,
    timeZone: opts.timeZone ?? 'Europe/Berlin',
    deviceId: opts.deviceId ?? newId(),
    redirectUrl: () => 'http://localhost:5208/auth/callback',
    authStorage: { getItem: (k) => storage.get(k) ?? null },
    authStorageKey: FAKE_AUTH_STORAGE_KEY,
    sync: opts.sync,
  });
  return {
    data,
    client,
    storage,
    dbName,
    setOnline(next) {
      online.set(next);
    },
    close: () => data.close(),
  };
}
