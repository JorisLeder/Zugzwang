/**
 * Authentication (D-15).
 *
 * - Local mode: a permanent `local` session for the local profile id – no login.
 * - Cloud mode (Supabase): e-mail magic link (`signInWithOtp`) and Google (`signInWithOAuth`), both redirecting to
 *   `/auth/callback`. supabase-js persists the session in localStorage and refreshes the access token
 *   automatically; how long a login lasts (30 days) is the project's session setting on the server.
 *   `observe()` emits only once the stored session has been read (`session()` is `null` until then).
 */
import type { AuthService, AuthSession, Subscribable } from '@/core/storage';
import { createValueStore } from '@/lib/observable';
import type { SbSession, SupabaseProvider } from '../supabase/types';

/** Error codes of auth failures (the UI shows its own German text per code). */
export type AuthErrorCode = 'local-mode' | 'invalid-email' | 'rate-limited' | 'network' | 'callback' | 'unknown';

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

/** Auth service of local mode. */
export function createLocalAuthService(userId: () => string): AuthService {
  const store = createValueStore<AuthSession | null>({ userId: userId(), provider: 'local' });
  return {
    mode: 'local',
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toAuthError(err: { message?: string; status?: number; code?: string } | null | undefined, fallback: AuthErrorCode): AuthError {
  const msg = err?.message ?? '';
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

  const set = (s: SbSession | null | undefined) => {
    const next = toAuthSession(s);
    const cur = store.get();
    if (cur === undefined || JSON.stringify(cur) !== JSON.stringify(next)) store.set(next);
  };

  const ready = (async () => {
    try {
      const client = await opts.client();
      client.auth.onAuthStateChange((_event, session) => set(session));
      const { data } = await client.auth.getSession();
      set(data.session);
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
      let result: { data: { session: SbSession | null }; error: { message?: string } | null } | null = null;
      if (code) result = await client.auth.exchangeCodeForSession(code);
      else if (tokenHash) {
        const type = param('type');
        result = await client.auth.verifyOtp({ token_hash: tokenHash, type: type === 'magiclink' || type === 'signup' ? type : 'email' });
      } else if (accessToken && refreshToken) result = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (result) {
        if (result.error || !result.data.session) throw toAuthError(result.error, 'callback');
        set(result.data.session);
        return;
      }
      if (!store.get()) throw new AuthError('callback', 'Die Anmeldung konnte nicht abgeschlossen werden. Der Link ist vielleicht abgelaufen.');
    },

    async signOut() {
      const client = await opts.client();
      const { error } = await client.auth.signOut();
      if (error) console.warn('Auth: sign-out failed on the server', error);
      store.set(null);
    },

    async accessToken() {
      const client = await opts.client();
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
  };
}
