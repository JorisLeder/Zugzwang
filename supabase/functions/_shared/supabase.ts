/**
 * Ports of the edge functions to Supabase (auth, RPCs, tables) and their adapters on supabase-js. The handlers only
 * see the ports, so tests run them with fakes; `index.ts` creates the supabase-js clients from the function's env:
 * - `SUPABASE_URL` + `SUPABASE_ANON_KEY`: auth checks and user-scoped clients (the caller's JWT, RLS applies).
 * - `SUPABASE_SERVICE_ROLE_KEY` (explain, delete-account only): the RPCs granted to the service role and
 *   `auth.admin.deleteUser`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameSource } from '@/core/games';
import type { GameRow } from '@/core/tables';

/** Resolves the caller from the access token. */
export interface AuthPort {
  /** Id of the user the token belongs to, or `null` for a missing, expired or forged token. */
  userId(token: string): Promise<string | null>;
}

/** The daily explanation quota (`consume_explanation_quota`, service role). */
export interface QuotaPort {
  /** Counts one explanation; `false` when the limit of the day (Europe/Berlin) is reached. */
  consume(userId: string, limit: number): Promise<boolean>;
}

/** The caller's games (user-scoped client: RLS limits every statement to the caller's rows). */
export interface GamesPort {
  /** Id of the caller's game with this source and external id, or `null`. */
  findByExternalId(userId: string, source: GameSource, externalId: string): Promise<string | null>;
  /** Inserts the row; `duplicate` when `(user_id, source, external_id)` exists already (unique key). */
  insert(row: GameRow): Promise<'inserted' | 'duplicate'>;
}

/** Account deletion (service role). */
export interface AccountAdminPort {
  /** Deletes every row of the user (`delete_user_data`); returns the number of deleted rows. */
  deleteUserData(userId: string): Promise<number>;
  /** Deletes the auth user (cascades to anything left). */
  deleteAuthUser(userId: string): Promise<void>;
}

/** Postgres error code of a unique violation. */
export const UNIQUE_VIOLATION = '23505';

function fail(what: string, error: { message: string; code?: string }): never {
  throw new Error(`${what} failed${error.code ? ` (${error.code})` : ''}: ${error.message}`);
}

/** `AuthPort` on `auth.getUser(token)` (checked by the Auth server, so revoked sessions fail too). */
export function supabaseAuth(client: SupabaseClient): AuthPort {
  return {
    async userId(token) {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user.id;
    },
  };
}

/** `QuotaPort` on the RPC `consume_explanation_quota` (service-role client). */
export function supabaseQuota(admin: SupabaseClient): QuotaPort {
  return {
    async consume(userId, limit) {
      const { data, error } = await admin.rpc('consume_explanation_quota', { p_user_id: userId, p_limit: limit });
      if (error) fail('consume_explanation_quota', error);
      // A function with OUT parameters answers with one object (older PostgREST versions: a one-row array).
      const row = (Array.isArray(data) ? data[0] : data) as { allowed?: unknown } | null | undefined;
      return row?.allowed === true;
    },
  };
}

/** `GamesPort` on the `games` table (client with the caller's JWT). */
export function supabaseGames(client: SupabaseClient): GamesPort {
  return {
    async findByExternalId(userId, source, externalId) {
      const { data, error } = await client
        .from('games')
        .select('id')
        .eq('user_id', userId)
        .eq('source', source)
        .eq('external_id', externalId)
        .maybeSingle();
      if (error) fail('games select', error);
      return (data as { id: string } | null)?.id ?? null;
    },
    async insert(row) {
      const { error } = await client.from('games').insert(row);
      if (!error) return 'inserted';
      if (error.code === UNIQUE_VIOLATION) return 'duplicate';
      fail('games insert', error);
    },
  };
}

/** `AccountAdminPort` on `delete_user_data` and `auth.admin.deleteUser` (service-role client). */
export function supabaseAccountAdmin(admin: SupabaseClient): AccountAdminPort {
  return {
    async deleteUserData(userId) {
      const { data, error } = await admin.rpc('delete_user_data', { p_user_id: userId });
      if (error) fail('delete_user_data', error);
      return typeof data === 'number' ? data : 0;
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) fail('auth.admin.deleteUser', error);
    },
  };
}
