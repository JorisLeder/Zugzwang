/**
 * Migrations on PGlite: they apply, create exactly the tables of `@/core/tables` with the contract's columns, enable
 * RLS on every table, grant only what the access rules allow and add the synced tables to the realtime publication.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  APPEND_ONLY_TABLES,
  STATIC_TABLES,
  TABLE_NAMES,
  USER_TABLES,
  type TableName,
} from '@/core/tables';
import { SYNCED_TABLES } from '@/data/sync/tables';
import { createTestDb, MIGRATIONS_DIR, migrationFiles, upsert, type TestDb } from '../../scripts/supabase/testDb';
import { sampleRow } from '../../scripts/supabase/testRows';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

const sorted = (xs: Iterable<string>) => [...xs].sort();

describe('migrations', () => {
  it('apply in name order', () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files).toEqual([...files].sort());
  });

  it('create exactly the tables of the contract', async () => {
    const rows = await db.rows<{ tablename: string }>(`select tablename from pg_tables where schemaname = 'public'`);
    expect(sorted(rows.map((r) => r.tablename))).toEqual(sorted(TABLE_NAMES));
  });

  it.each(TABLE_NAMES)('%s has exactly the columns of its row type', async (table) => {
    const cols = await db.rows<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
      [table],
    );
    expect(sorted(cols.map((c) => c.column_name))).toEqual(sorted(Object.keys(sampleRow(table, { owner: 'x' }))));
  });

  it('stores and returns every sample row unchanged (types match the contract)', async () => {
    const course = sampleRow('courses', { owner: '' });
    const lesson = sampleRow('lessons', { owner: '', courseId: course.id });
    const refs: Partial<Record<TableName, object>> = {};
    for (const table of TABLE_NAMES) {
      const owner = await db.createUser(); // one owner per table: derived rows of one table never collide
      if (table === 'game_moves') {
        const game = sampleRow('games', { owner });
        await upsert(db.pg, 'games', [game]);
        refs[table] = sampleRow(table, { owner, gameId: game.id });
      } else if (table === 'lessons') {
        await upsert(db.pg, 'courses', [course]);
        refs[table] = lesson;
      } else if (table === 'lesson_steps') {
        refs[table] = sampleRow(table, { owner, lessonId: lesson.id });
      } else if (table !== 'courses') {
        refs[table] = sampleRow(table, { owner });
      }
    }
    refs.courses = course;
    for (const table of TABLE_NAMES) {
      if (table === 'courses') continue; // inserted above (before its lesson)
      await upsert(db.pg, table, [refs[table]!]);
    }
    for (const table of TABLE_NAMES) {
      const row = refs[table] as Record<string, unknown>;
      const pk = await primaryKey(table);
      const where = pk.map((c, i) => `"${c}" = $${i + 1}`).join(' and ');
      const back = await db.rows(`select * from public."${table}" where ${where}`, pk.map((c) => row[c]));
      expect(back, table).toEqual([row]);
    }
  });

  it('enforce the unique keys of games and game moves and the game source', async () => {
    const owner = await db.createUser();
    const a = { ...sampleRow('games', { owner }), source: 'pgn' as const, external_id: 'sha-1' };
    await upsert(db.pg, 'games', [a]);
    await expect(upsert(db.pg, 'games', [{ ...a, id: crypto.randomUUID() }])).rejects.toThrow(/games_user_source_external_id_key/);
    // Bot games have no external id: any number of them.
    const bot = sampleRow('games', { owner });
    await upsert(db.pg, 'games', [bot, { ...bot, id: crypto.randomUUID() }]);
    await expect(upsert(db.pg, 'games', [{ ...a, id: crypto.randomUUID(), source: 'chessbase' }])).rejects.toThrow(/check constraint/);
    const move = sampleRow('game_moves', { owner, gameId: bot.id });
    await upsert(db.pg, 'game_moves', [move]);
    await expect(upsert(db.pg, 'game_moves', [{ ...move, id: crypto.randomUUID() }])).rejects.toThrow(/game_moves_game_id_seq_key/);
  });

  it('index the puzzle selection (rating, themes GIN)', async () => {
    const idx = await db.rows<{ indexdef: string }>(`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'puzzles'`);
    const defs = idx.map((i) => i.indexdef);
    expect(defs.some((d) => /USING btree \(rating/.test(d))).toBe(true);
    expect(defs.some((d) => /USING gin \(themes\)/.test(d))).toBe(true);
  });
});

async function primaryKey(table: string): Promise<string[]> {
  const rows = await db.rows<{ attname: string }>(
    `select a.attname from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = ('public.' || $1)::regclass and i.indisprimary
     order by array_position(i.indkey::int2[], a.attnum)`,
    [table],
  );
  return rows.map((r) => r.attname);
}

describe('row level security (catalog)', () => {
  it('is enabled on every table of the public schema', async () => {
    const rows = await db.rows<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')`,
    );
    expect(rows).toHaveLength(TABLE_NAMES.length);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  const policyCommands = async (table: string) =>
    sorted(
      (await db.rows<{ cmd: string }>(`select cmd from pg_policies where schemaname = 'public' and tablename = $1`, [table])).map(
        (r) => r.cmd,
      ),
    );

  it('has no delete (or catch-all) policy on any table', async () => {
    const rows = await db.rows(`select tablename, policyname from pg_policies where schemaname = 'public' and cmd in ('DELETE', 'ALL')`);
    expect(rows).toEqual([]);
  });

  it.each(APPEND_ONLY_TABLES)('append-only %s: select and insert policies only', async (table) => {
    expect(await policyCommands(table)).toEqual(['INSERT', 'SELECT']);
  });

  it.each(STATIC_TABLES)('static %s: select policies only', async (table) => {
    expect(new Set(await policyCommands(table))).toEqual(new Set(['SELECT']));
  });

  it('derived tables are read-only for clients (ratings: initial insert only)', async () => {
    expect(await policyCommands('ratings')).toEqual(['INSERT', 'SELECT']);
    for (const t of ['daily_activity', 'theme_stats', 'explanation_usage']) expect(await policyCommands(t), t).toEqual(['SELECT']);
  });

  it('every user table restricts every policy to the owner column', async () => {
    const rows = await db.rows<{ tablename: string; qual: string | null; with_check: string | null }>(
      `select tablename, qual, with_check from pg_policies where schemaname = 'public'`,
    );
    for (const table of USER_TABLES) {
      const own = rows.filter((r) => r.tablename === table);
      expect(own.length, table).toBeGreaterThan(0);
      for (const p of own) {
        for (const expr of [p.qual, p.with_check]) if (expr !== null) expect(expr, table).toMatch(/auth\.uid\(\)/);
      }
    }
  });
});

describe('privileges', () => {
  const can = async (role: string, table: string, priv: string) =>
    (await db.rows<{ ok: boolean }>(`select has_table_privilege($1, 'public.' || $2, $3) as ok`, [role, table, priv]))[0]!.ok;

  it('clients can never delete, truncate or alter rows of any table', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of TABLE_NAMES) {
        for (const priv of ['DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) expect(await can(role, table, priv), `${role} ${priv} ${table}`).toBe(false);
      }
    }
  });

  it('anon reads puzzles only and writes nothing', async () => {
    for (const table of TABLE_NAMES) {
      expect(await can('anon', table, 'SELECT'), table).toBe(table === 'puzzles');
      expect(await can('anon', table, 'INSERT'), table).toBe(false);
      expect(await can('anon', table, 'UPDATE'), table).toBe(false);
    }
  });

  it('authenticated: static and derived tables read-only, append-only tables without update', async () => {
    for (const table of [...STATIC_TABLES, 'daily_activity', 'theme_stats', 'explanation_usage']) {
      expect(await can('authenticated', table, 'SELECT'), table).toBe(true);
      expect(await can('authenticated', table, 'INSERT'), table).toBe(false);
      expect(await can('authenticated', table, 'UPDATE'), table).toBe(false);
    }
    for (const table of [...APPEND_ONLY_TABLES, 'ratings']) {
      expect(await can('authenticated', table, 'INSERT'), table).toBe(true);
      expect(await can('authenticated', table, 'UPDATE'), table).toBe(false);
    }
  });

  it('clients may call the two RPCs only; every function pins its search_path', async () => {
    const fns = await db.rows<{ proname: string; authenticated: boolean; anon: boolean; config: string[] | null }>(
      `select p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`,
    );
    expect(fns.length).toBeGreaterThan(10);
    expect(sorted(fns.filter((f) => f.authenticated).map((f) => f.proname))).toEqual(['upsert_daily_minutes', 'upsert_lesson_progress']);
    expect(fns.filter((f) => f.anon).map((f) => f.proname)).toEqual([]);
    for (const f of fns) expect(f.config?.some((c) => c.startsWith('search_path=')), f.proname).toBe(true);
  });
});

describe('realtime publication', () => {
  it('is skipped when the publication does not exist (plain Postgres)', async () => {
    expect(await db.rows(`select pubname from pg_publication`)).toEqual([]);
  });

  it('contains exactly the synced user tables on Supabase, idempotently', async () => {
    const rt = await createTestDb({ realtimePublication: true });
    try {
      const tables = async () =>
        sorted(
          (await rt.rows<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)).map(
            (r) => r.tablename,
          ),
        );
      expect(await tables()).toEqual(sorted(SYNCED_TABLES));
      expect(SYNCED_TABLES).not.toContain('explanation_usage');
      // Re-running the guarded block (e.g. migrations re-applied after a reset) adds nothing twice.
      const sql = readFileSync(join(MIGRATIONS_DIR, migrationFiles().at(-1)!), 'utf8');
      const block = sql.slice(sql.lastIndexOf('do $$'));
      expect(block).toMatch(/supabase_realtime/);
      await rt.pg.exec(block);
      expect(await tables()).toEqual(sorted(SYNCED_TABLES));
    } finally {
      await rt.close();
    }
  });
});
