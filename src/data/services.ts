/**
 * Dexie-based `DataServices` (local and cloud mode). `createDataServices` (`./index.ts`) builds it for the app; tests
 * build it with fake-indexeddb and the fake backend (`./testing`).
 *
 * Start-up is synchronous; the database opens lazily. When it opens, local mode creates the local profile on the first
 * start (D-15). Cloud mode follows the auth session:
 * - login: the local data is assigned to the account (data of another account is wiped first, data from local mode
 *   is uploaded once as a snapshot), then the outbox is flushed, realtime is subscribed and everything is pulled;
 * - logout: syncing stops (pending entries stay queued for the same account).
 */
import { DEFAULT_SETTINGS } from '@/core/profile';
import type { AuthService, DataServices, SyncService } from '@/core/storage';
import { newId } from '@/lib/ids';
import { userTimeZone } from '@/lib/time';
import { createAccountService, wipeUserData } from './account';
import { createActivityTracker, type ActiveTimeOptions } from './activity';
import { createLocalAuthService, createSupabaseAuthService, type CloudAuthService, type LocalAuthService } from './auth/authService';
import { DB_NAME, META, ZugzwangDb, type IndexedDbDeps } from './db';
import { currentProfile, defaultProfile, enqueue, putProfile, type DataContext } from './dexie/context';
import { createProgressService } from './dexie/progress';
import { createRepositories } from './dexie/repos';
import { outbox } from './outbox';
import { snapshotEntries } from './snapshot';
import { applyRemoteChanges } from './sync/applyRemote';
import { browserOnlineSource, createSyncEngine, NO_SYNC_ADAPTER, type OnlineSource, type SyncEngine, type SyncEngineOptions } from './sync/syncService';
import { createSupabaseSyncAdapter } from './supabase/syncAdapter';
import type { SupabaseProvider } from './supabase/types';

/** Options of `createDexieDataServices`. */
export interface DexieDataOptions {
  mode: 'local' | 'cloud';
  /** IndexedDB database name (default `zugzwang`). */
  dbName?: string;
  /** IndexedDB implementation (default: the global one). */
  indexedDb?: IndexedDbDeps;
  /** Supabase client (cloud mode). */
  client?: SupabaseProvider;
  online?: OnlineSource;
  now?: () => Date;
  /** Time zone of daily activity (default: the user's). */
  timeZone?: string;
  deviceId?: string;
  /** Random source of shuffled puzzle queries. */
  random?: () => number;
  /** Absolute URL of `/auth/callback` (default: current origin). */
  redirectUrl?: () => string;
  /** Sync tuning (tests). */
  sync?: Pick<SyncEngineOptions, 'debounceMs' | 'backoffBaseMs' | 'backoffMaxMs' | 'batchSize' | 'maxPermanentAttempts'>;
  /** ActivityTracker tuning (tests). */
  activity?: Partial<Omit<ActiveTimeOptions, 'onMinute'>>;
  /** Start listeners and the initial flush right away (default true). */
  autoStart?: boolean;
}

/** The Dexie data services plus lifecycle helpers. */
export interface DexieDataServices extends DataServices {
  readonly db: ZugzwangDb;
  readonly sync: SyncService & Pick<SyncEngine, 'pullAll' | 'idle'>;
  /** Resolves once the database is open and the start-up work (local profile / initial session) is done. */
  ready(): Promise<void>;
  /** Resolves once no login processing or flush is running (tests). */
  settled(): Promise<void>;
  /** Adds active minutes (what the ActivityTracker does each minute). */
  addActiveMinutes(minutes: number, date?: Date): Promise<void>;
  /** Starts listeners (only needed with `autoStart: false`). */
  start(): void;
  /** Stops listeners and closes the database. */
  close(): void;
}

/**
 * Id of this tab for the active-game lease (takeover dialog, P0-02). Kept in sessionStorage: a reload keeps it (the
 * game resumes without a question), while every other tab or device gets its own id (it asks to take over instead of
 * playing the same game twice). A fresh id when storage is unavailable.
 */
export function stableDeviceId(storageKey = 'zz-device-id', storage: () => Storage = () => sessionStorage): string {
  try {
    const store = storage();
    const stored = store.getItem(storageKey);
    if (stored) return stored;
    const id = newId();
    store.setItem(storageKey, id);
    return id;
  } catch {
    return newId();
  }
}

const EPOCH = DEFAULT_SETTINGS.updatedAt;

/** Creates the Dexie data services. */
export function createDexieDataServices(opts: DexieDataOptions): DexieDataServices {
  const mode = opts.mode;
  const cloud = mode === 'cloud';
  if (cloud && !opts.client) throw new Error('Cloud-Modus braucht einen Supabase-Client.');
  const now = opts.now ?? (() => new Date());
  const nowIso = () => now().toISOString();
  const timeZone = opts.timeZone ?? userTimeZone();
  const db = new ZugzwangDb(opts.dbName ?? DB_NAME, opts.indexedDb);
  const owner: { id: string | null; kind: 'local' | 'cloud' | null } = { id: null, kind: null };
  /** Account the sync engine works for (`null` = do not sync). */
  let syncUserId: string | null = null;
  let deleting = false;

  const ctx: DataContext = {
    db,
    now,
    nowIso,
    timeZone,
    userId: () => syncUserId ?? owner.id ?? 'local-user',
    provisional: cloud,
    outboxEnabled: cloud,
    enqueued: () => engine.notifyEnqueued(),
  };
  const repos = createRepositories(ctx, opts.random);
  const progress = createProgressService(ctx);

  const adapter = cloud ? createSupabaseSyncAdapter({ client: opts.client!, userId: () => syncUserId }) : NO_SYNC_ADAPTER;
  const engine = createSyncEngine({
    db,
    mode,
    adapter,
    applyRemote: (changes) => applyRemoteChanges(db, changes),
    online: opts.online ?? browserOnlineSource(),
    canSync: () => syncUserId !== null && !deleting,
    now,
    ...opts.sync,
  });

  const localAuth: LocalAuthService | null = cloud ? null : createLocalAuthService('local-user');
  const cloudAuth: CloudAuthService | null = cloud ? createSupabaseAuthService({ client: opts.client!, redirectUrl: opts.redirectUrl }) : null;

  /** Local mode: the local profile exists from the first start on. */
  async function ensureLocalProfile(d: ZugzwangDb): Promise<void> {
    const profile = await currentProfile(d);
    const id = profile?.id ?? owner.id ?? newId();
    if (!profile) await d.profile.put(defaultProfile(id, nowIso()));
    const kind = owner.kind ?? 'local';
    if (owner.id !== id || owner.kind === null) {
      await d.meta.bulkPut([
        { key: META.ownerId, value: id },
        { key: META.ownerKind, value: kind },
      ]);
    }
    owner.id = id;
    owner.kind = kind;
    localAuth?.setUserId(id);
  }

  db.on(
    'ready',
    async (vip) => {
      const d = vip as ZugzwangDb;
      try {
        owner.id = (await d.getMeta<string>(META.ownerId)) ?? null;
        owner.kind = (await d.getMeta<'local' | 'cloud'>(META.ownerKind)) ?? null;
        if (!cloud) await ensureLocalProfile(d);
      } catch (e) {
        console.warn('Daten: Start-up of the local database failed', e);
      }
    },
    true,
  );

  // ---- cloud session handling -------------------------------------------------------------------------------------

  let sessionChain: Promise<void> = Promise.resolve();
  let stopRealtime: (() => void) | null = null;

  /** Assigns the local data to `uid` (wipes data of another account, uploads data from local mode once). */
  async function adoptOwner(uid: string): Promise<void> {
    const ownerId = (await db.getMeta<string>(META.ownerId)) ?? null;
    const ownerKind = (await db.getMeta<'local' | 'cloud'>(META.ownerKind)) ?? null;
    if (ownerKind === 'cloud' && ownerId && ownerId !== uid) {
      const lost = await db.outbox.count();
      if (lost) console.warn(`Sync: ${lost} nicht gesendete Einträge eines anderen Kontos wurden verworfen`);
      await wipeUserData(db);
    }
    const snapshot = ownerKind === 'local' ? await snapshotEntries(db, uid, nowIso()) : [];
    await db.transaction('rw', [db.profile, db.outbox, db.meta], async () => {
      const p = await currentProfile(db);
      if (p && p.id !== uid) await putProfile(db, { ...p, id: uid });
      if (snapshot.length) await enqueue(ctx, ...snapshot);
      await db.meta.bulkPut([
        { key: META.ownerId, value: uid },
        { key: META.ownerKind, value: 'cloud' },
      ]);
    });
    owner.id = uid;
    owner.kind = 'cloud';
  }

  /** After login: realtime first (nothing is missed during the pull), flush, full pull, profile. */
  async function afterLogin(uid: string): Promise<void> {
    stopRealtime = engine.subscribeRealtime();
    await engine.flush();
    let pulled = false;
    try {
      await engine.pullAll();
      pulled = true;
    } catch (e) {
      console.warn('Sync: full pull after login failed', e);
    }
    if (syncUserId !== uid || (await currentProfile(db))) return;
    // No profile on the server either: a placeholder with an epoch timestamp, so any server value wins the merge.
    const placeholder = { ...defaultProfile(uid, nowIso()), updatedAt: EPOCH };
    await db.transaction('rw', db.profile, db.outbox, async () => {
      if (await currentProfile(db)) return;
      await putProfile(db, placeholder);
      if (pulled) await enqueue(ctx, outbox.profile(placeholder, nowIso()));
    });
    engine.notifyEnqueued();
  }

  async function onSession(uid: string | null): Promise<void> {
    if (uid === syncUserId) return;
    stopRealtime?.();
    stopRealtime = null;
    syncUserId = null;
    if (!uid) return;
    await adoptOwner(uid);
    syncUserId = uid;
    await afterLogin(uid);
  }

  let started = false;
  let stopAuth: (() => void) | null = null;

  function start(): void {
    if (started) return;
    started = true;
    engine.start();
    db.open().catch((e) => console.warn('Daten: opening the local database failed', e));
    if (cloudAuth) {
      stopAuth = cloudAuth.observe().subscribe((s) => {
        const uid = s?.userId ?? null;
        sessionChain = sessionChain.then(() => onSession(uid)).catch((e) => console.warn('Sync: processing the login failed', e));
      });
    }
  }

  const auth: AuthService = cloudAuth
    ? {
        ...cloudAuth,
        mode: 'cloud',
        async signOut() {
          // Send what is still queued while the session is valid (best effort).
          await engine.flush().catch(() => undefined);
          await cloudAuth.signOut();
        },
      }
    : localAuth!;

  const account = createAccountService({
    db,
    mode,
    nowIso,
    syncBeforeExport: async () => {
      await engine.flush();
      await engine.pullAll();
    },
    deleteRemote: cloud
      ? async () => {
          const client = await opts.client!();
          deleting = true;
          const { error } = await client.functions.invoke('delete-account', { method: 'POST' });
          if (error) {
            deleting = false;
            throw new Error(`Das Konto konnte nicht gelöscht werden: ${error.message}`);
          }
        }
      : undefined,
    signOut: async () => {
      stopRealtime?.();
      stopRealtime = null;
      await cloudAuth?.signOut();
      deleting = false;
    },
    afterWipe: async () => {
      owner.id = null;
      owner.kind = null;
      if (!cloud) await ensureLocalProfile(db);
    },
  });

  const activity = createActivityTracker((m) => progress.addActiveMinutes(m), opts.activity);

  const services: DexieDataServices = {
    db,
    repos,
    progress,
    sync: engine,
    auth,
    account,
    activity,
    deviceId: opts.deviceId ?? stableDeviceId(),
    addActiveMinutes: (m, date) => progress.addActiveMinutes(m, date),
    async ready() {
      await db.open();
      if (cloudAuth) {
        await cloudAuth.ready();
        await Promise.resolve();
        await sessionChain;
      }
    },
    async settled() {
      for (let i = 0; i < 20; i++) {
        const chain = sessionChain;
        await chain;
        await engine.idle();
        if (chain === sessionChain) return;
      }
    },
    start,
    close() {
      stopAuth?.();
      stopRealtime?.();
      engine.stop();
      started = false;
      db.close();
    },
  };
  if (opts.autoStart !== false) start();
  return services;
}
