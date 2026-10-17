/**
 * The real supabase-js client (cloud mode only). It is loaded with a dynamic import, so local mode never downloads
 * it. Only the public anon key is used (`VITE_SUPABASE_ANON_KEY`); row level security restricts every user to their
 * own rows. Session: persisted in localStorage, access token refreshed automatically; how long a login lasts
 * (30 days) is the project's session setting (Auth → Sessions) on the server.
 */
import type { SupabaseLike, SupabaseProvider } from './types';

/** Storage key of the persisted session. */
export const AUTH_STORAGE_KEY = 'zz-auth';

/** Lazily creates the client once (`createClient(url, anonKey)`). */
export function createSupabaseProvider(url: string, anonKey: string): SupabaseProvider {
  let client: Promise<SupabaseLike> | null = null;
  return () => {
    client ??= import('@supabase/supabase-js')
      .then(
        ({ createClient }) =>
          createClient(url, anonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              // `/auth/callback` completes the redirect itself (AuthService.handleCallback).
              detectSessionInUrl: false,
              flowType: 'pkce',
              storageKey: AUTH_STORAGE_KEY,
            },
          }) as unknown as SupabaseLike,
      )
      .catch((e: unknown) => {
        client = null; // e.g. the chunk failed to load offline – try again next time
        throw e;
      });
    return client;
  };
}
