import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabaseClient, FakeSupabaseServer } from '../testing';
import type { SbAuth, SbSession, SupabaseLike } from '../supabase/types';
import { AuthError, createLocalAuthService, createSupabaseAuthService, toAuthSession } from './authService';

const REDIRECT = 'http://localhost:5208/auth/callback';

function setup(opts: { storage?: Map<string, string>; now?: () => Date; ttl?: number } = {}) {
  const server = new FakeSupabaseServer({ now: opts.now, sessionTtlSeconds: opts.ttl });
  const redirects: string[] = [];
  const storage = opts.storage ?? new Map<string, string>();
  const client = createFakeSupabaseClient(server, { storage, onRedirect: (u) => redirects.push(u) });
  const auth = createSupabaseAuthService({ client: async () => client, redirectUrl: () => REDIRECT });
  return { server, client, auth, redirects, storage };
}

describe('SupabaseAuthService (cloud mode, fake supabase-js client)', () => {
  it('magic link: sends the e-mail with the callback URL, completes the callback, persists and signs out', async () => {
    const { server, auth, storage } = setup();
    const seen: Array<string | null> = [];
    auth.observe().subscribe((s) => seen.push(s?.userId ?? null));
    await auth.ready();
    expect(auth.mode).toBe('cloud');
    expect(auth.session()).toBeNull();
    expect(seen).toEqual([null]);

    await expect(auth.signInWithEmailLink('keine-adresse')).rejects.toMatchObject({ code: 'invalid-email' });
    await auth.signInWithEmailLink('  lea@example.com ');
    const link = server.lastMagicLink('lea@example.com')!;
    expect(link.startsWith(`${REDIRECT}?code=`)).toBe(true);

    await auth.handleCallback(link);
    const user = server.userByEmail('lea@example.com')!;
    expect(auth.session()).toMatchObject({ userId: user.id, email: 'lea@example.com', provider: 'email' });
    expect(auth.session()?.expiresAt).toMatch(/^\d{4}-/);
    expect(seen.at(-1)).toBe(user.id);
    expect(await auth.accessToken()).toMatch(/^at-/);
    // The code is single use.
    await expect(auth.handleCallback(link)).rejects.toMatchObject({ code: 'callback' });

    // Reload: a new client on the same storage restores the session without a new login.
    const reloaded = createSupabaseAuthService({ client: async () => createFakeSupabaseClient(server, { storage }), redirectUrl: () => REDIRECT });
    await reloaded.ready();
    expect(reloaded.session()?.userId).toBe(user.id);

    await auth.signOut();
    expect(auth.session()).toBeNull();
    expect(await auth.accessToken()).toBeNull();
    expect(seen.at(-1)).toBeNull();
  });

  it('Google: redirects to the provider and completes the OAuth callback', async () => {
    const { server, auth, redirects } = setup();
    await auth.ready();
    await auth.signInWithGoogle();
    expect(redirects).toHaveLength(1);
    await auth.handleCallback(redirects[0]!);
    expect(auth.session()).toMatchObject({ provider: 'google', email: server.googleEmail });
  });

  it('maps failures to German messages (rate limit, network, aborted callback)', async () => {
    const { server, client, auth } = setup();
    await auth.ready();
    server.failNext({ count: 1, status: 429, message: 'email rate limit exceeded' });
    const rate = await auth.signInWithEmailLink('lea@example.com').catch((e: unknown) => e);
    expect(rate).toBeInstanceOf(AuthError);
    expect(rate).toMatchObject({ code: 'rate-limited', message: expect.stringContaining('Zu viele Versuche') });

    client.testing.setOnline(false);
    await expect(auth.signInWithEmailLink('lea@example.com')).rejects.toMatchObject({ code: 'network' });
    client.testing.setOnline(true);

    await expect(auth.handleCallback(`${REDIRECT}?error=access_denied&error_description=abgebrochen`)).rejects.toMatchObject({ code: 'callback' });
    await expect(auth.handleCallback(`${REDIRECT}?code=falsch`)).rejects.toMatchObject({ code: 'callback' });
    await expect(auth.handleCallback(REDIRECT)).rejects.toMatchObject({ code: 'callback' });
  });

  it('refreshes an expired access token automatically (persisted session)', async () => {
    let t = Date.parse('2026-10-16T10:00:00Z');
    const { server, auth, client } = setup({ now: () => new Date(t), ttl: 60 });
    await auth.ready();
    await auth.signInWithEmailLink('lea@example.com');
    await auth.handleCallback(server.lastMagicLink('lea@example.com')!);
    const first = await auth.accessToken();
    t += 61_000;
    const second = await auth.accessToken();
    expect(second).not.toBe(first);
    expect(server.authenticate(second)).toBe(server.userByEmail('lea@example.com')!.id);
    expect(client.testing.session()?.access_token).toBe(second);
    expect(auth.session()?.userId).toBe(server.userByEmail('lea@example.com')!.id);
  });

  it('completes token-hash and implicit (hash) callbacks with a mocked supabase auth client', async () => {
    const session: SbSession = { access_token: 'a', refresh_token: 'r', expires_at: 2_000_000_000, user: { id: 'u1', email: 'x@y.de' } };
    const mock = {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
      signInWithOtp: vi.fn(async () => ({ error: null })),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
      exchangeCodeForSession: vi.fn(),
      verifyOtp: vi.fn(async () => ({ data: { session }, error: null })),
      setSession: vi.fn(async () => ({ data: { session: { ...session, user: { id: 'u2' } } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    } satisfies SbAuth;
    const client = { auth: mock } as unknown as SupabaseLike;
    const auth = createSupabaseAuthService({ client: async () => client, redirectUrl: () => REDIRECT });
    await auth.ready();
    await auth.handleCallback(`${REDIRECT}?token_hash=th1&type=magiclink`);
    expect(mock.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th1', type: 'magiclink' });
    expect(auth.session()).toMatchObject({ userId: 'u1', email: 'x@y.de', provider: 'email', expiresAt: new Date(2_000_000_000_000).toISOString() });
    await auth.handleCallback(`${REDIRECT}#access_token=at&refresh_token=rt&expires_in=3600`);
    expect(mock.setSession).toHaveBeenCalledWith({ access_token: 'at', refresh_token: 'rt' });
    expect(auth.session()?.userId).toBe('u2');
    await auth.signInWithGoogle();
    expect(mock.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: REDIRECT } });
    await auth.signInWithEmailLink('x@y.de');
    expect(mock.signInWithOtp).toHaveBeenCalledWith({ email: 'x@y.de', options: { emailRedirectTo: REDIRECT, shouldCreateUser: true } });
    await auth.signOut();
    expect(mock.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('DS-6: a code link without the PKCE verifier in this storage gets a clear German hint', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const storage = new Map<string, string>();
    const client = createClient('https://abc.supabase.co', 'anon', {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'pkce',
        storageKey: 'zz-auth',
        storage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v), removeItem: (k) => void storage.delete(k) },
      },
      global: { fetch: (async () => new Response('{}', { status: 500 })) as typeof fetch },
    });
    const auth = createSupabaseAuthService({ client: async () => client as unknown as SupabaseLike, redirectUrl: () => REDIRECT, storage: null });
    await auth.ready();
    await expect(auth.handleCallback(`${REDIRECT}?code=abc`)).rejects.toMatchObject({
      code: 'pkce-verifier',
      message: 'Öffne den Link im selben Browser oder in der App, in der du ihn angefordert hast, oder fordere einen neuen Link an.',
    });
    await client.auth.stopAutoRefresh();
  });

  it('DS-6: a thrown verifier error is mapped the same way; other exchange errors stay generic', async () => {
    const make = (exchange: () => Promise<never>) =>
      createSupabaseAuthService({
        client: async () =>
          ({
            auth: {
              getSession: async () => ({ data: { session: null }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              exchangeCodeForSession: exchange,
            },
          }) as unknown as SupabaseLike,
      });
    const missing = make(async () => {
      throw Object.assign(new Error('PKCE code verifier not found in storage.'), { name: 'AuthPKCECodeVerifierMissingError' });
    });
    await missing.ready();
    await expect(missing.handleCallback(`${REDIRECT}?code=x`)).rejects.toMatchObject({ code: 'pkce-verifier' });
    const other = make(async () => {
      throw new Error('boom');
    });
    await other.ready();
    await expect(other.handleCallback(`${REDIRECT}?code=x`)).rejects.toMatchObject({ code: 'callback' });
  });

  it('DS-6: a token_hash link completes without any code verifier (other browser storage)', async () => {
    const { server, auth } = setup();
    await auth.ready();
    await auth.signInWithEmailLink('lea@example.com');
    const hash = new URL(server.lastMagicLink('lea@example.com')!).searchParams.get('code')!;
    // A second browser (empty storage, no verifier) opens the template link `?token_hash=…&type=email`.
    const fresh = createSupabaseAuthService({ client: async () => createFakeSupabaseClient(server, { storage: new Map() }), redirectUrl: () => REDIRECT });
    await fresh.ready();
    await fresh.handleCallback(`${REDIRECT}?token_hash=${hash}&type=email`);
    expect(fresh.session()).toMatchObject({ email: 'lea@example.com', provider: 'email' });
  });

  it('a broken client yields a logged-out state instead of hanging', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const auth = createSupabaseAuthService({ client: () => Promise.reject(new Error('chunk failed')) });
    await auth.ready();
    expect(auth.session()).toBeNull();
    const seen: unknown[] = [];
    auth.observe().subscribe((s) => seen.push(s));
    expect(seen).toEqual([null]);
    warn.mockRestore();
  });
});

describe('local auth', () => {
  it('has a permanent local session and refuses logins', async () => {
    const auth = createLocalAuthService('local-1');
    const seen: Array<string | undefined> = [];
    auth.observe().subscribe((s) => seen.push(s?.userId));
    expect(auth.session()).toEqual({ userId: 'local-1', provider: 'local' });
    auth.setUserId('local-2');
    expect(seen).toEqual(['local-1', 'local-2']);
    await expect(auth.signInWithEmailLink('a@b.de')).rejects.toMatchObject({ code: 'local-mode' });
    await expect(auth.signInWithGoogle()).rejects.toMatchObject({ code: 'local-mode' });
    await auth.handleCallback('/auth/callback');
    await auth.signOut();
    expect(auth.session()?.userId).toBe('local-2');
    expect(await auth.accessToken()).toBeNull();
  });

  it('maps supabase sessions', () => {
    expect(toAuthSession(null)).toBeNull();
    expect(toAuthSession({ access_token: 'a', user: { id: 'u', app_metadata: { provider: 'google' } } })).toEqual({ userId: 'u', provider: 'google' });
  });
});
