/**
 * Fake supabase-js client on top of `FakeSupabaseServer` (implements the `SupabaseLike` subset), so the real
 * `SupabaseSyncAdapter` and `SupabaseAuthService` run unchanged in tests. Each client is one device: it has its own
 * network state (`setOnline`), its own persisted session (`storage`, survives a "reload" when passed to a new client)
 * and its own realtime channels.
 */
import type {
  SbAuth,
  SbChannel,
  SbRealtimePayload,
  SbResponse,
  SbSelectBuilder,
  SbSession,
  SbTableBuilder,
  SbUpsertBuilder,
  SupabaseLike,
} from '../supabase/types';
import { FakeServerError, type FakeRequest, type FakeSupabaseServer } from './fakeServer';

type Row = Record<string, unknown>;

/** Options of `createFakeSupabaseClient`. */
export interface FakeClientOptions {
  /** Persisted auth storage (share it between clients to simulate a reload of the same browser). */
  storage?: Map<string, string>;
  /** Start logged in as this session. */
  session?: SbSession | null;
  /** Network state of this device (default online). */
  online?: boolean | (() => boolean);
  /** Called with the URL the browser would be redirected to (OAuth). */
  onRedirect?: (url: string) => void;
}

/** The fake client plus test controls. */
export interface FakeSupabaseClient extends SupabaseLike {
  testing: {
    setOnline(online: boolean): void;
    isOnline(): boolean;
    /** Current session as stored. */
    session(): SbSession | null;
    /** Emits an auth event (e.g. `TOKEN_REFRESHED`). */
    emitAuth(event: string): void;
  };
}

const STORAGE_KEY = 'sb-fake-auth-token';

/** Creates a fake client connected to `server`. */
export function createFakeSupabaseClient(server: FakeSupabaseServer, opts: FakeClientOptions = {}): FakeSupabaseClient {
  const storage = opts.storage ?? new Map<string, string>();
  let manualOnline = typeof opts.online === 'boolean' ? opts.online : true;
  const isOnline = typeof opts.online === 'function' ? opts.online : () => manualOnline;
  const listeners = new Set<(event: string, session: SbSession | null) => void>();

  if (opts.session !== undefined) {
    if (opts.session) storage.set(STORAGE_KEY, JSON.stringify(opts.session));
    else storage.delete(STORAGE_KEY);
  }

  const readSession = (): SbSession | null => {
    const raw = storage.get(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SbSession) : null;
  };
  const writeSession = (s: SbSession | null, event: string) => {
    if (s) storage.set(STORAGE_KEY, JSON.stringify(s));
    else storage.delete(STORAGE_KEY);
    for (const l of [...listeners]) l(event, s);
  };

  /** Refreshes an expired session (autoRefreshToken). */
  const validSession = (): SbSession | null => {
    const s = readSession();
    if (!s) return null;
    if (s.expires_at && s.expires_at * 1000 <= server.now().getTime() && s.refresh_token && isOnline()) {
      try {
        const next = server.refreshSession(s.refresh_token);
        writeSession(next, 'TOKEN_REFRESHED');
        return next;
      } catch {
        writeSession(null, 'SIGNED_OUT');
        return null;
      }
    }
    return s;
  };

  const userId = (): string | null => validSession()?.user.id ?? null;

  /** Runs an authenticated data request. */
  function call<T>(req: Omit<FakeRequest, 'userId'>, exec: (uid: string) => T): Promise<SbResponse<T>> {
    const token = validSession()?.access_token;
    return server.request({ ...req, userId: userId() }, isOnline, () => exec(server.authenticate(token)));
  }

  function selectBuilder(table: string, columns: string): SbSelectBuilder {
    const q: Parameters<FakeSupabaseServer['select']>[2] = { eq: [], in: [], columns };
    const builder: SbSelectBuilder = {
      eq(column, value) {
        q.eq.push([column, value]);
        return builder;
      },
      in(column, values) {
        q.in.push([column, values]);
        return builder;
      },
      order(column, o) {
        q.order = { column, ascending: o?.ascending !== false };
        return builder;
      },
      range(from, to) {
        q.range = [from, to];
        return builder;
      },
      then(onFulfilled, onRejected) {
        return call({ kind: 'select', target: table }, (uid) => server.select(table, uid, q)).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  function upsertBuilder(table: string, rows: Row[], o: { onConflict?: string; ignoreDuplicates?: boolean }): SbUpsertBuilder {
    const run = <T>(map: (written: Row[]) => T) =>
      call({ kind: 'upsert', target: table }, (uid) => map(server.upsert(table, uid, rows, o)));
    return {
      select(columns = '*') {
        return {
          then(onFulfilled, onRejected) {
            return run((written) => written.map((r) => pick(r, columns))).then(onFulfilled, onRejected);
          },
        };
      },
      then(onFulfilled, onRejected) {
        return run(() => null).then(onFulfilled, onRejected);
      },
    };
  }

  const authOp = async <T>(target: string, exec: () => T): Promise<{ value: T | null; error: { message: string; status?: number } | null }> => {
    const res = await server.request({ kind: 'auth', target, userId: userId() }, isOnline, exec);
    if (res.error) return { value: null, error: { message: res.error.message, status: res.status } };
    return { value: res.data, error: null };
  };

  const sessionResult = (r: { value: SbSession | null; error: { message: string; status?: number } | null }, event: string) => {
    if (r.error || !r.value) return { data: { session: null }, error: r.error ?? { message: 'Keine Sitzung' } };
    writeSession(r.value, event);
    return { data: { session: r.value }, error: null };
  };

  const auth: SbAuth = {
    async getSession() {
      return { data: { session: validSession() }, error: null };
    },
    onAuthStateChange(cb) {
      listeners.add(cb);
      queueMicrotask(() => {
        if (listeners.has(cb)) cb('INITIAL_SESSION', readSession());
      });
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },
    async signInWithOtp({ email, options }) {
      const r = await authOp('otp', () => server.sendMagicLink(email, options?.emailRedirectTo ?? 'http://localhost/auth/callback', options?.shouldCreateUser));
      return { error: r.error };
    },
    async signInWithOAuth({ options }) {
      const r = await authOp('oauth', () => server.startOAuth(options?.redirectTo ?? 'http://localhost/auth/callback'));
      if (!r.error && r.value) opts.onRedirect?.(r.value);
      return { error: r.error };
    },
    async exchangeCodeForSession(code) {
      return sessionResult(await authOp('token?grant_type=pkce', () => server.exchangeCode(code)), 'SIGNED_IN');
    },
    async verifyOtp({ token_hash }) {
      return sessionResult(await authOp('verify', () => server.exchangeCode(token_hash)), 'SIGNED_IN');
    },
    async setSession({ access_token, refresh_token }) {
      return sessionResult(await authOp('token?grant_type=refresh_token', () => server.sessionFromTokens(access_token, refresh_token)), 'SIGNED_IN');
    },
    async signOut() {
      const s = readSession();
      // supabase-js clears the local session even when the server call fails.
      await authOp('logout', () => server.revoke(s?.access_token, s?.refresh_token));
      writeSession(null, 'SIGNED_OUT');
      return { error: null };
    },
  };

  const client: FakeSupabaseClient = {
    from(table): SbTableBuilder {
      return {
        select: (columns = '*') => selectBuilder(table, columns),
        upsert: (rows, o = {}) => upsertBuilder(table, (Array.isArray(rows) ? rows : [rows]) as Row[], o),
      };
    },
    rpc(fn, args = {}) {
      return call({ kind: 'rpc', target: fn }, (uid) => server.rpc(fn, uid, args));
    },
    channel(name) {
      const bindings: Array<{ table: string; filter?: string; cb: (p: SbRealtimePayload) => void }> = [];
      const offs: Array<() => void> = [];
      const channel: SbChannel & { unsubscribeAll(): void; name: string } = {
        name,
        on(_type, filter, cb) {
          bindings.push({ table: filter.table, filter: filter.filter, cb });
          return channel;
        },
        subscribe(cb) {
          const uid = userId();
          if (!uid) {
            cb?.('CHANNEL_ERROR', new Error('Nicht angemeldet'));
            return channel;
          }
          for (const b of bindings) {
            offs.push(
              server.subscribe(uid, b.table, b.filter, (p) => {
                if (isOnline()) b.cb(p); // events while the device is offline are lost (the pull catches up)
              }),
            );
          }
          cb?.('SUBSCRIBED');
          return channel;
        },
        unsubscribeAll() {
          for (const off of offs.splice(0)) off();
        },
      };
      return channel;
    },
    removeChannel(channel) {
      (channel as SbChannel & { unsubscribeAll?: () => void }).unsubscribeAll?.();
      return Promise.resolve('ok');
    },
    functions: {
      async invoke(name, o) {
        const res = await call({ kind: 'function', target: name }, (uid) => server.invokeFunction(name, uid, o?.body));
        if (res.error) return { data: null, error: { message: res.error.message } };
        return { data: res.data, error: null };
      },
    },
    auth,
    testing: {
      setOnline(online) {
        manualOnline = online;
      },
      isOnline,
      session: readSession,
      emitAuth(event) {
        for (const l of [...listeners]) l(event, readSession());
      },
    },
  };
  return client;
}

function pick(row: Row, columns: string): Row {
  const cols = columns.split(',').map((c) => c.trim()).filter(Boolean);
  if (!cols.length || cols.includes('*')) return { ...row };
  return Object.fromEntries(cols.map((c) => [c, row[c]]));
}

export { FakeServerError };
