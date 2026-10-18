/**
 * Test database for the Supabase migrations (Vitest + PGlite, i.e. real Postgres in WebAssembly).
 *
 * - A stub of the Supabase `auth` schema: `auth.users` and `auth.uid()`, which reads the user id from the session
 *   setting `request.jwt.claim.sub` (as PostgREST sets it from the JWT).
 * - The roles `anon`, `authenticated` and `service_role` (BYPASSRLS) – like on Supabase.
 * - All files of `supabase/migrations` applied in name order.
 * - `as(role, userId, fn)` runs statements in one transaction with that role and user (rolled back on error), and
 *   `upsert()` builds the statements PostgREST sends for `from(table).upsert(rows, { onConflict, ignoreDuplicates })`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';

/** Repository root. */
export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Directory of the SQL migrations. */
export const MIGRATIONS_DIR = join(ROOT_DIR, 'supabase/migrations');

/** Database roles of Supabase. */
export type DbRole = 'anon' | 'authenticated' | 'service_role';

/** Something that runs queries (the database or a transaction). */
export type Queryable = Pick<Transaction, 'query' | 'exec'>;

type Row = Record<string, unknown>;

/** Stub of the Supabase `auth` schema and the API roles. */
export const AUTH_STUB_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    email text unique,
    created_at timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

/** Migration files in apply order (file names). */
export function migrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
}

/** Options of `createTestDb`. */
export interface TestDbOptions {
  /** Create the `supabase_realtime` publication before the migrations (as on Supabase). */
  realtimePublication?: boolean;
}

let userCounter = 0;

/** Deterministic, valid UUID for test users. */
export function testUuid(n: number, prefix = 'aaaaaaaa'): string {
  return `${prefix}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** The database plus helpers. */
export interface TestDb {
  /** Superuser connection (no RLS). */
  pg: PGlite;
  /** Creates an auth user and returns its id. */
  createUser(email?: string): Promise<string>;
  /** Runs `fn` in a transaction as `role` with `auth.uid() = userId`. */
  as<T>(role: DbRole, userId: string | null, fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** Shorthand for `as('authenticated', userId, fn)`. */
  asUser<T>(userId: string, fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** Rows of a query as superuser. */
  rows<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

/** Creates a fresh in-memory database with the auth stub and all migrations. */
export async function createTestDb(opts: TestDbOptions = {}): Promise<TestDb> {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(AUTH_STUB_SQL);
  if (opts.realtimePublication) await pg.exec('create publication supabase_realtime');
  for (const file of migrationFiles()) {
    try {
      await pg.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  }

  const as = <T>(role: DbRole, userId: string | null, fn: (tx: Queryable) => Promise<T>): Promise<T> =>
    pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`, [
        userId ?? '',
        role,
      ]);
      await tx.exec(`set local role ${role}`);
      return fn(tx);
    });

  return {
    pg,
    async createUser(email) {
      userCounter += 1;
      const id = testUuid(userCounter + Math.floor(Math.random() * 1e9));
      await pg.query('insert into auth.users (id, email) values ($1, $2)', [id, email ?? `nutzer-${id}@example.com`]);
      return id;
    },
    as,
    asUser: (userId, fn) => as('authenticated', userId, fn),
    async rows<T = Row>(sql: string, params: unknown[] = []) {
      return (await pg.query<T>(sql, params)).rows;
    },
    close: () => pg.close(),
  };
}

/** Options of `upsert` (same meaning as in supabase-js). */
export interface UpsertOptions {
  /** Conflict target columns (comma separated). Without it: a plain insert. */
  onConflict?: string;
  /** `on conflict do nothing` instead of `do update`. */
  ignoreDuplicates?: boolean;
  /** Columns to return (default: none). */
  returning?: string;
}

const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid identifier ${name}`);
  return `"${name}"`;
};

/**
 * The statement PostgREST runs for an insert/upsert of JSON rows:
 * `insert into t (cols) select cols from json_populate_recordset(null::t, $1) on conflict … returning …`.
 */
export function upsertSql(table: string, columns: readonly string[], opts: UpsertOptions = {}): string {
  const cols = columns.map(ident).join(', ');
  let sql = `insert into public.${ident(table)} (${cols}) select ${cols} from json_populate_recordset(null::public.${ident(table)}, $1::json)`;
  if (opts.onConflict) {
    const target = opts.onConflict.split(',').map((c) => ident(c.trim())).join(', ');
    if (opts.ignoreDuplicates) sql += ` on conflict (${target}) do nothing`;
    else sql += ` on conflict (${target}) do update set ${columns.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ')}`;
  }
  if (opts.returning) sql += ` returning ${opts.returning === '*' ? '*' : opts.returning.split(',').map((c) => ident(c.trim())).join(', ')}`;
  return sql;
}

/** Inserts/upserts JSON rows like PostgREST and returns the `returning` rows. */
export async function upsert<T = Row>(q: Queryable, table: string, rows: readonly Row[], opts: UpsertOptions = {}): Promise<T[]> {
  if (rows.length === 0) return [];
  const columns = Object.keys(rows[0]!);
  const res = await q.query<T>(upsertSql(table, columns, opts), [JSON.stringify(rows)]);
  return res.rows;
}

/** Calls an RPC with named arguments like PostgREST (`select * from fn(a => $1, …)`). */
export async function rpc<T = Row>(q: Queryable, fn: string, args: Record<string, unknown>): Promise<T[]> {
  const names = Object.keys(args);
  const list = names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ');
  const res = await q.query<T>(`select * from public.${ident(fn)}(${list})`, names.map((n) => args[n]));
  return res.rows;
}
