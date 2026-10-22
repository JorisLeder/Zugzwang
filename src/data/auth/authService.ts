/**
 * Authentication (D-15).
 *
 * - Local mode: a permanent `local` session for the local profile id – no login.
 * - Cloud mode (Supabase): e-mail magic link (`signInWithOtp`) and Google (`signInWithOAuth`), both redirecting to
 *   `/auth/callback`. supabase-js persists the session in localStorage and refreshes the access token
 *   automatically; how long a login lasts (30 days) is the project's session setting on the server.
 *   `observe()` emits only once the stored session has been read (`session()` is `null` until then).
 * - Offline cold start: when the access token is expired and the refresh fails for network reasons, the stored session
 *   is exposed as `unverified` so the user can keep working; syncing waits for the real session (token refresh).
 */
import type { AuthService, AuthSession, Subscribable } from '@/core/storage';
import { createValueStore } from '@/lib/observable';
import { AUTH_STORAGE_KEY } from '../supabase/client';
import type { SbError, SbSession, SupabaseLike, SupabaseProvider } from '../supabase/types';

/** Error codes of auth failures (the UI shows its own German text per code). */
export type AuthErrorCode = 'local-mode' | 'invalid-email' | 'rate-limited' | 'network' | 'callback' | 'pkce-verifier' | 'unknown';

/** Auth failure with a code and a German message. */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const LOCAL_MODE_MESSAGE = 'Lokaler Modus: Eine Anmeldung ist nicht nötig.';

/** Local-mode auth service; `setUserId` updates the session once the local profile is known. */
export interface LocalAuthService extends AuthService {
  setUserId(userId: string): void;
}

/** Auth service of local mode: a permanent `local` session, nothing to log in to. */
export function createLocalAuthService(initialUserId: string): LocalAuthService {
  const store = createValueStore<AuthSession | null>({ userId: initialUserId, provider: 'local' });
  return {
    mode: 'local',
    setUserId(userId) {
      if (store.get()?.userId !== userId) store.set({ userId, provider: 'local' });
    },
    session: () => store.get(),
    observe: () => store,
    signInWithEmailLink: async () => {
      throw new AuthError('local-mode', LOCAL_MODE_MESSAGE);
    },
    signInWithGoogle: async () => {
      throw new AuthError('local-mode', LOCAL_MODE_MESSAGE);
    },
    handleCallback: async () => {},
    signOut: async () => {},
    accessToken: async () => null,
  };
}

/** Maps a supabase-js session to `AuthSession`. */
export function toAuthSession(s: SbSession | null | undefined): AuthSession | null {
  if (!s?.user?.id) return null;
  const session: AuthSession = { userId: s.user.id, provider: s.user.app_metadata?.provider === 'google' ? 'google' : 'email' };
  if (s.user.email) session.email = s.user.email;
  if (s.expires_at) session.expiresAt = new Date(s.expires_at * 1000).toISOString();
  return session;
}

/** Reads the persisted supabase-js session (JSON under the storage key) as an unverified `AuthSession`. */
function readStoredSession(storage: Pick<Storage, 'getItem'> | null | undefined, key: string): AuthSession | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as SbSession | null;
    const session = toAuthSession(stored);
    return session ? { ...session, unverified: true } : null;
  } catch {
    return null;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The magic link was opened in a browser/app whose storage lacks the code verifier of the request (PKCE). */
const PKCE_VERIFIER_MESSAGE =
  'Öffne den Link im selben Browser oder in der App, in der du ihn angefordert hast, oder fordere einen neuen Link an.';

function isPkceVerifierMissing(err: { name?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.name === 'AuthPKCECodeVerifierMissingError' || /code verifier/i.test(err.message ?? ''));
}

function toAuthError(err: { name?: string; message?: string; status?: number; code?: string } | null | undefined, fallback: AuthErrorCode): AuthError {
  const msg = err?.message ?? '';
  if (fallback === 'callback' && isPkceVerifierMissing(err)) return new AuthError('pkce-verifier', PKCE_VERIFIER_MESSAGE);
  if (err?.status === 429 || /rate limit|too many/i.test(msg)) {
    return new AuthError('rate-limited', 'Zu viele Versuche. Warte kurz und versuch es dann noch einmal.');
  }
  if (/fetch|network|offline/i.test(msg)) return new AuthError('network', 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.');
  if (fallback === 'callback') return new AuthError('callback', 'Die Anmeldung konnte nicht abgeschlossen werden. Der Link ist vielleicht abgelaufen.');
  return new AuthError(fallback, 'Das hat nicht geklappt. Versuch es nochmal.');
}

/** Options of `createSupabaseAuthService`. */
export interface SupabaseAuthOptions {
  client: SupabaseProvider;
  /** Absolute URL of `/auth/callback` (default: current origin). */
  redirectUrl?: () => string;
  /** Where supabase-js persists the session (default: `localStorage`; `null` = no offline fallback). */
  storage?: (Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'removeItem'>>) | null;
  /** Storage key of the persisted session (default `AUTH_STORAGE_KEY`). */
  storageKey?: string;
  /** Browser connectivity (default `navigator.onLine`). */
  isOnline?: () => boolean;
}

/** Cloud-mode auth service with its readiness promise. */
export interface CloudAuthService extends AuthService {
  /** Resolves once the stored session is known. */
  ready(): Promise<void>;
}

/** Auth service of cloud mode (Supabase). */
export function createSupabaseAuthService(opts: SupabaseAuthOptions): CloudAuthService {
  /** `undefined` = not yet known. */
  const store = createValueStore<AuthSession | null | undefined>(undefined);
  const redirectUrl =
    opts.redirectUrl ?? (() => (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback'));

  const storage = opts.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : opts.storage;
  const storageKey = opts.storageKey ?? AUTH_STORAGE_KEY;
  const isOnline = opts.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);

  const setSession = (next: AuthSession | null) => {
    const cur = store.get();
    if (cur === undefined || JSON.stringify(cur) !== JSON.stringify(next)) store.set(next);
  };
  const set = (s: SbSession | null | undefined) => setSession(toAuthSession(s));
  /** A failed sign-out stopped the auto refresh; the next login restarts it. */
  let autoRefreshStopped = false;
  const restartAutoRefresh = async (client: SupabaseLike) => {
    if (!autoRefreshStopped) return;
    autoRefreshStopped = false;
    try {
      await client.auth.startAutoRefresh?.();
    } catch {
      /* ignore */
    }
  };

  /** The refresh failed for network reasons (as opposed to a rejected refresh token, which signs the user out). */
  const isOfflineError = (e: SbError | null | undefined): boolean =>
    !!e && (e.name === 'AuthRetryableFetchError' || !isOnline());

  const ready = (async () => {
    try {
      const client = await opts.client();
      client.auth.onAuthStateChange((event, session) => {
        // A null session counts only on sign-out; the initial one is read below (it may be an offline start).
        if (!session && event !== 'SIGNED_OUT') return;
        set(session);
      });
      const { data, error } = await client.auth.getSession();
      if (!data.session && isOfflineError(error)) setSession(readStoredSession(storage, storageKey));
      else set(data.session);
    } catch (e) {
      console.warn('Auth: reading the session failed', e);
      if (store.get() === undefined) store.set(null);
    }
  })();

  const observable: Subscribable<AuthSession | null> = {
    subscribe(cb) {
      return store.subscribe((v) => {
        if (v !== undefined) cb(v);
      });
    },
  };

  return {
    mode: 'cloud',
    ready: () => ready,
    session: () => store.get() ?? null,
    observe: () => observable,

    async signInWithEmailLink(email) {
      const address = email.trim();
      if (!EMAIL_RE.test(address)) throw new AuthError('invalid-email', 'Bitte gib eine gültige E-Mail-Adresse ein.');
      const client = await opts.client();
      const { error } = await client.auth.signInWithOtp({ email: address, options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true } });
      if (error) throw toAuthError(error, 'unknown');
    },

    async signInWithGoogle() {
      const client = await opts.client();
      const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectUrl() } });
      if (error) throw toAuthError(error, 'unknown');
    },

    async handleCallback(url) {
      await ready;
      const client = await opts.client();
      const u = new URL(url, 'http://localhost');
      const hash = new URLSearchParams(u.hash.startsWith('#') ? u.hash.slice(1) : u.hash);
      const param = (k: string) => u.searchParams.get(k) ?? hash.get(k);
      if (param('error') || param('error_description')) {
        throw new AuthError('callback', 'Die Anmeldung wurde abgebrochen oder der Link ist abgelaufen.');
      }
      const code = param('code');
      const tokenHash = param('token_hash');
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      let result: { data: { session: SbSession | null }; error: { name?: string; message?: string } | null } | null = null;
      if (code) {
        try {
          result = await client.auth.exchangeCodeForSession(code);
        } catch (e) {
          throw toAuthError(e as Error, 'callback'); // supabase-js normally returns the error; a throw is treated alike
        }
      }
      else if (tokenHash) {
        // Works in any browser: no code verifier needed (e-mail template with `token_hash`, see README).
        const type = param('type');
        result = await client.auth.verifyOtp({ token_hash: tokenHash, type: type === 'magiclink' || type === 'signup' ? type : 'email' });
      } else if (accessToken && refreshToken) result = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (result) {
        if (result.error || !result.data.session) throw toAuthError(result.error, 'callback');
        await restartAutoRefresh(client);
        set(result.data.session);
        return;
      }
      if (!store.get()) throw new AuthError('callback', 'Die Anmeldung konnte nicht abgeschlossen werden. Der Link ist vielleicht abgelaufen.');
    },

    async signOut() {
      const client = await opts.client();
      // `local`: ends the session on this device only (other devices stay logged in).
      let failed: unknown = null;
      try {
        const { error } = await client.auth.signOut({ scope: 'local' });
        failed = error;
      } catch (e) {
        failed = e;
      }
      if (failed) {
        // supabase-js returns early on e.g. AuthRetryableFetchError (offline) without removing the stored session; the
        // auto refresh would bring it back later. End the session on this device ourselves.
        console.warn('Auth: sign-out failed on the server', failed);
        try {
          await client.auth.stopAutoRefresh?.();
          autoRefreshStopped = true;
        } catch {
          /* ignore */
        }
        try {
          storage?.removeItem?.(storageKey);
        } catch {
          /* ignore */
        }
      }
      store.set(null);
    },

    async accessToken() {
      const client = await opts.client();
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
  };
}
