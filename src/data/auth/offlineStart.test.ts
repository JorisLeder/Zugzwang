/**
 * Offline cold start with the real supabase-js client (stubbed fetch): an expired stored session must not log the
 * user out when the token refresh fails for network reasons (P0-02, regression DS-1).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { AUTH_STORAGE_KEY } from '../supabase/client';
import type { SupabaseLike } from '../supabase/types';
import { createSupabaseAuthService } from './authService';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function storedSession(expiresInSeconds = -7200) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.x',
    refresh_token: 'r1',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + expiresInSeconds,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
      email: 'a@example.com',
    },
  };
}

function memStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

function setup(fetchImpl: () => Promise<Response>, autoRefreshToken = false) {
  const storage = memStorage({ [AUTH_STORAGE_KEY]: JSON.stringify(storedSession()) });
  const client = createClient('https://abc.supabase.co', 'anon', {
    auth: { persistSession: true, autoRefreshToken, detectSessionInUrl: false, flowType: 'pkce', storageKey: AUTH_STORAGE_KEY, storage },
    global: { fetch: fetchImpl as unknown as typeof fetch },
  });
  const auth = createSupabaseAuthService({ client: async () => client as unknown as SupabaseLike, storage });
  return { storage, client, auth };
}

/** supabase-js retries network failures with a growing back-off; fake timers skip the waiting. */
async function readyWithFakeTimers(auth: { ready(): Promise<void> }) {
  vi.useFakeTimers();
  const ready = auth.ready();
  await vi.runAllTimersAsync();
  await ready;
  vi.useRealTimers();
}

afterEach(() => vi.useRealTimers());

describe('offline cold start (real supabase-js)', () => {
  it('keeps the user logged in (unverified) when the refresh fails because of the network', async () => {
    const { auth, storage, client } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    const seen: Array<string | null> = [];
    auth.observe().subscribe((s) => seen.push(s ? `${s.userId}${s.unverified ? ':unverified' : ''}` : null));
    await readyWithFakeTimers(auth);
    expect(auth.session()).toMatchObject({ userId: USER_ID, email: 'a@example.com', provider: 'email', unverified: true });
    expect(seen).toEqual([`${USER_ID}:unverified`]);
    expect(storage.m.has(AUTH_STORAGE_KEY)).toBe(true);
    // No token while the refresh is pending.
    vi.useFakeTimers();
    const token = auth.accessToken();
    await vi.runAllTimersAsync();
    expect(await token).toBeNull();
    vi.useRealTimers();
    await client.auth.stopAutoRefresh();
  });

  it('SIGNED_OUT ends the offline session', async () => {
    const { auth, client } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    await readyWithFakeTimers(auth);
    expect(auth.session()?.unverified).toBe(true);
    vi.useFakeTimers();
    const out = auth.signOut();
    await vi.runAllTimersAsync();
    await out;
    vi.useRealTimers();
    expect(auth.session()).toBeNull();
    await client.auth.stopAutoRefresh();
  });

  it('a rejected refresh token (invalid_grant) yields a logged-out state', async () => {
    const { auth, storage, client } = setup(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await readyWithFakeTimers(auth);
    expect(auth.session()).toBeNull();
    expect(storage.m.has(AUTH_STORAGE_KEY)).toBe(false);
    await client.auth.stopAutoRefresh();
  });

  it('a later successful refresh replaces the unverified session by the real one', async () => {
    const { auth, client } = setup(async () => {
      throw new TypeError('Failed to fetch');
    });
    await readyWithFakeTimers(auth);
    expect(auth.session()?.unverified).toBe(true);
    const seen: Array<boolean | undefined> = [];
    auth.observe().subscribe((s) => seen.push(s?.unverified));
    const fresh = storedSession(3600);
    // supabase-js announces the refreshed session via onAuthStateChange(TOKEN_REFRESHED).
    const listeners = (client.auth as unknown as { stateChangeEmitters: Map<string, { callback: (e: string, s: unknown) => void }> }).stateChangeEmitters;
    for (const l of listeners.values()) l.callback('TOKEN_REFRESHED', fresh);
    expect(auth.session()?.unverified).toBeUndefined();
    expect(auth.session()?.userId).toBe(USER_ID);
    expect(seen.at(-1)).toBeUndefined();
    await client.auth.stopAutoRefresh();
  });

  it('DS2-1: signing out offline with an expired token ends the session for good (storage cleared, no re-emit)', async () => {
    let online = false;
    const refreshed = { ...storedSession(3600), access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.fresh', refresh_token: 'r2' };
    const { auth, storage, client } = setup(async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify(refreshed), { status: 200, headers: { 'content-type': 'application/json' } });
    }, true);
    const seen: Array<string | null> = [];
    auth.observe().subscribe((s) => seen.push(s ? s.userId : null));
    // The auto refresh ticks forever, so time is advanced in bounded steps instead of running all timers.
    vi.useFakeTimers();
    const ready = auth.ready();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await ready;
    expect(auth.session()?.unverified).toBe(true);

    const out = auth.signOut();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await out;
    expect(auth.session()).toBeNull();
    expect(storage.m.has(AUTH_STORAGE_KEY)).toBe(false);

    // The connection comes back: the auto refresh must not bring the previous user back.
    online = true;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    vi.useRealTimers();
    expect(storage.m.has(AUTH_STORAGE_KEY)).toBe(false);
    expect(auth.session()).toBeNull();
    expect(seen.at(-1)).toBeNull();
    expect(seen.filter((x) => x !== null)).toEqual([USER_ID]); // only the unverified start, no later session event
    expect(await client.auth.getSession()).toMatchObject({ data: { session: null } });
    await client.auth.stopAutoRefresh();
  });
});
