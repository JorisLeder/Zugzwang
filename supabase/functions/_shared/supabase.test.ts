/**
 * Adapters of the edge-function ports on a mocked supabase-js client: the exact calls (tables, filters, RPC names and
 * arguments) and the handling of their results and errors.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { GameRow } from '@/core/tables';
import { supabaseAccountAdmin, supabaseAuth, supabaseGames, supabaseQuota, UNIQUE_VIOLATION } from './supabase';

type Result = { data?: unknown; error: { message: string; code?: string } | null };

/** A query builder that records its calls and resolves to `result`. */
function builder(result: Result, log: unknown[][]) {
  const b = {
    select: (...a: unknown[]) => (log.push(['select', ...a]), b),
    eq: (...a: unknown[]) => (log.push(['eq', ...a]), b),
    maybeSingle: async () => (log.push(['maybeSingle']), result),
    insert: async (...a: unknown[]) => (log.push(['insert', ...a]), result),
  };
  return b;
}

function client(opts: { from?: Result; rpc?: Result; getUser?: Result; deleteUser?: Result } = {}) {
  const log: unknown[][] = [];
  const c = {
    from: vi.fn((table: string) => (log.push(['from', table]), builder(opts.from ?? { data: null, error: null }, log))),
    rpc: vi.fn(async (fn: string, args: unknown) => (log.push(['rpc', fn, args]), opts.rpc ?? { data: null, error: null })),
    auth: {
      getUser: vi.fn(async (token: string) => (log.push(['getUser', token]), opts.getUser ?? { data: { user: null }, error: null })),
      admin: { deleteUser: vi.fn(async (id: string) => (log.push(['deleteUser', id]), opts.deleteUser ?? { data: {}, error: null })) },
    },
  };
  return { sb: c as unknown as SupabaseClient, log };
}

describe('supabaseAuth', () => {
  it('returns the user id of a valid token and null otherwise', async () => {
    const ok = client({ getUser: { data: { user: { id: 'alice' } }, error: null } });
    expect(await supabaseAuth(ok.sb).userId('jwt')).toBe('alice');
    expect(ok.log).toEqual([['getUser', 'jwt']]);
    const bad = client({ getUser: { data: { user: null }, error: { message: 'invalid JWT' } } });
    expect(await supabaseAuth(bad.sb).userId('jwt')).toBeNull();
    expect(await supabaseAuth(client().sb).userId('jwt')).toBeNull();
  });
});

describe('supabaseQuota', () => {
  it('calls consume_explanation_quota with user and limit', async () => {
    const c = client({ rpc: { data: { allowed: true, used: 3 }, error: null } });
    expect(await supabaseQuota(c.sb).consume('alice', 200)).toBe(true);
    expect(c.log).toEqual([['rpc', 'consume_explanation_quota', { p_user_id: 'alice', p_limit: 200 }]]);
  });

  it('reads an object or a one-row array; anything else is not allowed', async () => {
    expect(await supabaseQuota(client({ rpc: { data: [{ allowed: true, used: 1 }], error: null } }).sb).consume('a', 200)).toBe(true);
    expect(await supabaseQuota(client({ rpc: { data: { allowed: false, used: 200 }, error: null } }).sb).consume('a', 200)).toBe(false);
    expect(await supabaseQuota(client({ rpc: { data: null, error: null } }).sb).consume('a', 200)).toBe(false);
  });

  it('throws on a database error', async () => {
    await expect(supabaseQuota(client({ rpc: { error: { message: 'permission denied', code: '42501' } } }).sb).consume('a', 200)).rejects.toThrow(
      /consume_explanation_quota failed \(42501\)/,
    );
  });
});

describe('supabaseGames', () => {
  const row = { id: 'g1', user_id: 'alice', source: 'pgn', external_id: 'abc' } as GameRow;

  it('finds a game by user, source and external id', async () => {
    const c = client({ from: { data: { id: 'g0' }, error: null } });
    expect(await supabaseGames(c.sb).findByExternalId('alice', 'pgn', 'abc')).toBe('g0');
    expect(c.log).toEqual([
      ['from', 'games'],
      ['select', 'id'],
      ['eq', 'user_id', 'alice'],
      ['eq', 'source', 'pgn'],
      ['eq', 'external_id', 'abc'],
      ['maybeSingle'],
    ]);
    expect(await supabaseGames(client({ from: { data: null, error: null } }).sb).findByExternalId('alice', 'pgn', 'abc')).toBeNull();
    await expect(supabaseGames(client({ from: { error: { message: 'timeout' } } }).sb).findByExternalId('alice', 'pgn', 'abc')).rejects.toThrow(/games select failed/);
  });

  it('inserts the row; a unique violation is a duplicate, other errors throw', async () => {
    const c = client({ from: { error: null } });
    expect(await supabaseGames(c.sb).insert(row)).toBe('inserted');
    expect(c.log).toEqual([['from', 'games'], ['insert', row]]);
    expect(await supabaseGames(client({ from: { error: { message: 'duplicate key', code: UNIQUE_VIOLATION } } }).sb).insert(row)).toBe('duplicate');
    await expect(supabaseGames(client({ from: { error: { message: 'new row violates row-level security policy', code: '42501' } } }).sb).insert(row)).rejects.toThrow(
      /games insert failed \(42501\)/,
    );
  });
});

describe('supabaseAccountAdmin', () => {
  it('deletes the rows with delete_user_data and then the auth user', async () => {
    const c = client({ rpc: { data: 12, error: null } });
    const admin = supabaseAccountAdmin(c.sb);
    expect(await admin.deleteUserData('alice')).toBe(12);
    await admin.deleteAuthUser('alice');
    expect(c.log).toEqual([
      ['rpc', 'delete_user_data', { p_user_id: 'alice' }],
      ['deleteUser', 'alice'],
    ]);
  });

  it('throws when a step fails', async () => {
    await expect(supabaseAccountAdmin(client({ rpc: { error: { message: 'boom' } } }).sb).deleteUserData('a')).rejects.toThrow(/delete_user_data failed/);
    await expect(supabaseAccountAdmin(client({ deleteUser: { error: { message: 'User not allowed' } } }).sb).deleteAuthUser('a')).rejects.toThrow(
      /auth.admin.deleteUser failed/,
    );
  });
});
