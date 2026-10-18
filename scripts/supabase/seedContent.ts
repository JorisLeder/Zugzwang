/**
 * Static content seed for Supabase (`npm run supabase:seed-content`, CLI in `seed-content.ts`).
 *
 * Builds `supabase/seed.sql` from the repository, i.e. from exactly what the app ships:
 * - `bots`: the roster `BOT_ROSTER` (`src/bots/roster.ts`);
 * - `courses`, `lessons`, `lesson_steps`: `content/lessons/` (catalog + lesson files; schema, path and legality checks
 *   as when the app loads them – engine claims are `npm run validate:content`'s job);
 * - `puzzles`: the puzzle bank `public/data/puzzles/` (sha256 and counts checked against the manifest) plus the five
 *   demo puzzles `demo-…` of `src/puzzles/demoPuzzles.json` (RLS lets `anon` read only those). The bank must equal
 *   `supabase/seed/puzzles.csv` (same rows for `COPY`), so both ways of loading the bank give the same table.
 *
 * Rows come from the client mappers `toRow.*` of `@/core/tables`. The SQL is idempotent: it upserts every row and
 * deletes static rows that are no longer in the repository (no user table references static rows by foreign key).
 * It has no `begin`/`commit`: the Supabase CLI (`db push --include-seed`, `db reset`), the SQL editor and `psql -1`
 * run it as one transaction. `verifySeed` applies it twice to the real migrations (PGlite) and reads every row back.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { BOT_ROSTER } from '@/bots/roster';
import type { Puzzle } from '@/core/puzzles';
import { puzzleChunkSchema } from '@/core/schemas';
import { type STATIC_TABLES, toRow, type TableRows } from '@/core/tables';
import { lessonPositionErrors } from '@/lessons/validate';
import { checkCatalogAndFiles } from '../content/lessonChecks';
import { puzzlesCsv } from '../puzzles/generate/output';
import { readLessonContent } from '../validate/lessons';
import { DEMO_PUZZLES_FILE, readBank } from '../validate/puzzles';
import { createTestDb, ROOT_DIR } from './testDb';

/** Default output file (the Supabase CLI's default seed path, see `supabase/config.toml`). */
export const SEED_SQL_FILE = 'supabase/seed.sql';
/** The bank as CSV for `COPY public.puzzles` (written by `npm run puzzles:generate`). */
export const PUZZLES_CSV_FILE = 'supabase/seed/puzzles.csv';
/** Id prefix of the demo puzzles (RLS policy `puzzles_select_demo`). */
export const DEMO_ID_PREFIX = 'demo-';
/** Rows per `insert` statement. */
export const ROWS_PER_INSERT = 250;

/** A static content table. */
export type StaticTableName = (typeof STATIC_TABLES)[number];

/** Rows of every static table. */
export type StaticRows = { [K in StaticTableName]: Array<TableRows[K]> };

/** Everything the seed is built from. */
export interface StaticContent {
  rows: StaticRows;
  /** Version of the puzzle bank manifest. */
  bankVersion: string;
  /** Number of demo puzzles among `rows.puzzles`. */
  demoPuzzles: number;
  /** Content problems (`file: message`); the seed must not be written when there are any. */
  errors: string[];
}

interface TableSpec {
  /** Primary key columns (conflict target). */
  key: readonly string[];
  /** `text[]` columns. */
  arrays: readonly string[];
  /** `jsonb` columns. */
  json: readonly string[];
}

/** Column types the SQL needs to know (all other columns are text/number scalars). */
const SPECS: Record<StaticTableName, TableSpec> = {
  courses: { key: ['id'], arrays: ['lesson_ids'], json: [] },
  lessons: { key: ['id'], arrays: ['practice_themes', 'sources'], json: [] },
  lesson_steps: { key: ['lesson_id', 'step_index'], arrays: [], json: ['content'] },
  bots: { key: ['id'], arrays: [], json: ['engine', 'repertoire', 'chat'] },
  puzzles: { key: ['id'], arrays: ['moves', 'themes', 'opening_tags'], json: ['explanation'] },
};

/** Insert order (parents first). */
export const SEED_ORDER: readonly StaticTableName[] = ['courses', 'lessons', 'lesson_steps', 'bots', 'puzzles'];

// ---------------------------------------------------------------------------------------------------------------
// Content

const zodMessage = (issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): string =>
  issues
    .slice(0, 3)
    .map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message))
    .join('; ');

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** Reads and checks all static content below `rootDir`. */
export function loadStaticContent(rootDir: string = ROOT_DIR): StaticContent {
  const errors: string[] = [];
  const err = (file: string | undefined, message: string, id?: string) =>
    errors.push(`${file ?? '?'}${id ? ` (${id})` : ''}: ${message}`);

  // Courses and lessons – as the app loads them (schema, ids = path, legal positions and moves).
  const catalog = checkCatalogAndFiles(readLessonContent(rootDir));
  for (const e of catalog.errors) err(e.file, e.message, e.id);
  const lessons = catalog.lessons.filter(({ file, lesson }) => {
    const legality = lessonPositionErrors(lesson);
    for (const m of legality) err(file, m);
    return legality.length === 0;
  });

  // Puzzle bank (manifest, sha256, counts, sources) + demo puzzles.
  const bank = readBank(rootDir);
  for (const e of bank.errors) err(e.file, e.message, e.id);
  const puzzles: Puzzle[] = [];
  for (const group of bank.groups) {
    const parsed = puzzleChunkSchema.safeParse(group.items);
    if (parsed.success) puzzles.push(...(parsed.data as Puzzle[]));
    else err(group.file, `Puzzles entsprechen nicht dem Schema: ${zodMessage(parsed.error.issues)}`);
  }
  const csvPath = join(rootDir, PUZZLES_CSV_FILE);
  if (!existsSync(csvPath)) err(PUZZLES_CSV_FILE, 'Datei fehlt (npm run puzzles:generate).');
  else if (readFileSync(csvPath, 'utf8') !== puzzlesCsv(bank.groups.flatMap((g) => g.items) as Puzzle[])) {
    err(PUZZLES_CSV_FILE, 'passt nicht zur Puzzle-Bank in public/data/puzzles (npm run puzzles:generate neu ausführen).');
  }
  let demo: Puzzle[] = [];
  const demoPath = join(rootDir, DEMO_PUZZLES_FILE);
  const demoParsed = existsSync(demoPath) ? puzzleChunkSchema.safeParse(readJsonFile(demoPath)) : null;
  if (!demoParsed) err(DEMO_PUZZLES_FILE, 'Datei fehlt.');
  else if (!demoParsed.success) err(DEMO_PUZZLES_FILE, `Puzzles entsprechen nicht dem Schema: ${zodMessage(demoParsed.error.issues)}`);
  else demo = demoParsed.data as Puzzle[];
  for (const p of demo) if (!p.id.startsWith(DEMO_ID_PREFIX)) err(DEMO_PUZZLES_FILE, `Demo-Puzzle-IDs beginnen mit „${DEMO_ID_PREFIX}“.`, p.id);
  for (const p of puzzles) if (p.id.startsWith(DEMO_ID_PREFIX)) err('public/data/puzzles', `IDs mit „${DEMO_ID_PREFIX}“ sind den Demo-Puzzles vorbehalten.`, p.id);

  const rows: StaticRows = {
    courses: catalog.courses.map(toRow.course),
    lessons: lessons.map(({ lesson }) => toRow.lesson(lesson)),
    lesson_steps: lessons.flatMap(({ lesson }) => toRow.lessonSteps(lesson)),
    bots: BOT_ROSTER.map(toRow.bot),
    puzzles: [...puzzles, ...demo].map(toRow.puzzle),
  };
  for (const table of SEED_ORDER) {
    const seen = new Set<string>();
    for (const row of rows[table] as object[]) {
      const key = rowKey(table, row);
      if (seen.has(key)) err(table, 'Schlüssel ist doppelt.', key);
      seen.add(key);
    }
  }
  return { rows, bankVersion: bank.manifest?.version ?? '?', demoPuzzles: demo.length, errors };
}

function rowKey(table: StaticTableName, row: object): string {
  return SPECS[table].key.map((c) => String((row as Record<string, unknown>)[c])).join('/');
}

// ---------------------------------------------------------------------------------------------------------------
// SQL

/** SQL string literal (`standard_conforming_strings = on`, the Postgres default). */
export function sqlString(value: string): string {
  if (value.includes('\0')) throw new Error('Text values must not contain NUL characters.');
  return `'${value.replace(/'/g, "''")}'`;
}

/** Literal of one column value. */
export function sqlValue(value: unknown, kind: 'scalar' | 'array' | 'json', where: string): string {
  if (value === null || value === undefined) return 'null';
  if (kind === 'json') return `${sqlString(JSON.stringify(value))}::jsonb`;
  if (kind === 'array') {
    if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) throw new Error(`${where}: expected an array of strings.`);
    return value.length === 0 ? `'{}'::text[]` : `array[${value.map(sqlString).join(', ')}]::text[]`;
  }
  if (typeof value === 'string') return sqlString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${where}: ${value} is not a finite number.`);
    return String(value);
  }
  throw new Error(`${where}: column type unknown to the seed (add it to SPECS in scripts/supabase/seedContent.ts).`);
}

const ident = (name: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid identifier ${name}`);
  return name;
};

/** `insert … on conflict … do update` statements of one table (`ROWS_PER_INSERT` rows each). */
export function upsertStatements(table: StaticTableName, rows: readonly object[]): string[] {
  if (rows.length === 0) return [];
  const spec = SPECS[table];
  const columns = Object.keys(rows[0]!).map(ident);
  const kindOf = (c: string) => (spec.arrays.includes(c) ? 'array' : spec.json.includes(c) ? 'json' : 'scalar');
  const updates = columns.filter((c) => !spec.key.includes(c));
  const statements: string[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const values = rows.slice(i, i + ROWS_PER_INSERT).map((row) => {
      const record = row as Record<string, unknown>;
      const keys = Object.keys(record);
      if (keys.length !== columns.length || keys.some((k) => !columns.includes(k))) {
        throw new Error(`${table} ${rowKey(table, row)}: columns differ from the first row.`);
      }
      return `  (${columns.map((c) => sqlValue(record[c], kindOf(c), `${table}.${c} (${rowKey(table, row)})`)).join(', ')})`;
    });
    statements.push(
      `insert into public.${table} (${columns.join(', ')}) values\n${values.join(',\n')}\n` +
        `on conflict (${spec.key.join(', ')}) do ${updates.length ? `update set ${updates.map((c) => `${c} = excluded.${c}`).join(', ')}` : 'nothing'};`,
    );
  }
  return statements;
}

const textArray = (values: readonly string[]): string =>
  values.length === 0 ? `'{}'::text[]` : `array[${values.map(sqlString).join(', ')}]::text[]`;

/** Statements removing static rows that are no longer in the repository. */
export function cleanupStatements(rows: StaticRows): string[] {
  const out: string[] = [];
  const counts = new Map<string, number>();
  for (const s of rows.lesson_steps) counts.set(s.lesson_id, Math.max(counts.get(s.lesson_id) ?? 0, s.step_index + 1));
  if (counts.size > 0) {
    const list = [...counts].map(([id, n]) => `(${sqlString(id)}, ${n})`).join(', ');
    out.push(
      `delete from public.lesson_steps s using (values ${list}) as k (lesson_id, steps)\n` +
        `where s.lesson_id = k.lesson_id and s.step_index >= k.steps;`,
    );
  }
  // Lesson steps of removed lessons and lessons of removed courses go by `on delete cascade`.
  out.push(`delete from public.lessons where id <> all (${textArray(rows.lessons.map((r) => r.id))});`);
  out.push(`delete from public.courses where id <> all (${textArray(rows.courses.map((r) => r.id))});`);
  out.push(`delete from public.bots where id <> all (${textArray(rows.bots.map((r) => r.id))});`);
  out.push(`delete from public.puzzles where id <> all (${textArray(rows.puzzles.map((r) => r.id))});`);
  return out;
}

/** The complete seed file. */
export function seedSql(content: Pick<StaticContent, 'rows' | 'bankVersion' | 'demoPuzzles'>): string {
  const { rows } = content;
  const header = [
    '-- Zugzwang – static content seed. GENERATED by `npm run supabase:seed-content` – do not edit.',
    '-- Sources: content/lessons (catalog + lessons), src/bots/roster.ts, public/data/puzzles (bank',
    `-- ${content.bankVersion}), src/puzzles/demoPuzzles.json. Rows: ${SEED_ORDER.map((t) => `${t} ${rows[t].length}`).join(', ')}`,
    `-- (puzzles incl. ${content.demoPuzzles} demo puzzles).`,
    '-- Idempotent (upserts, then removes rows that are no longer in the repository). Apply after the migrations:',
    '-- `supabase db push --include-seed` or `psql -1 -v ON_ERROR_STOP=1 -f supabase/seed.sql "<connection string>"`.',
  ];
  const parts = [header.join('\n'), ...SEED_ORDER.flatMap((t) => upsertStatements(t, rows[t] as object[])), ...cleanupStatements(rows)];
  return `${parts.join('\n\n')}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Verification

/** Result of `verifySeed`: rows per table after applying the seed. */
export type SeedCounts = Record<StaticTableName, number> & { anonPuzzles: number };

const ORDER_BY: Record<StaticTableName, string> = {
  courses: 'id',
  lessons: 'id',
  lesson_steps: 'lesson_id, step_index',
  bots: 'id',
  puzzles: 'id',
};

/** Rows as they come back from Postgres (JSON round trip drops `undefined` inside `jsonb` values). */
const asStored = (row: object): unknown => JSON.parse(JSON.stringify(row)) as unknown;

/**
 * Applies the migrations and then `sql` twice (idempotency) to a fresh PGlite database and checks that every static
 * table holds exactly `rows` and that `anon` sees only the demo puzzles. Throws on the first difference.
 */
export async function verifySeed(sql: string, rows: StaticRows): Promise<SeedCounts> {
  const db = await createTestDb({ realtimePublication: true });
  try {
    await db.pg.exec(sql);
    await db.pg.exec(sql);
    const counts = {} as SeedCounts;
    for (const table of SEED_ORDER) {
      const stored = await db.rows<Record<string, unknown>>(`select * from public.${table} order by ${ORDER_BY[table]}`);
      const expected = [...(rows[table] as object[])]
        .sort((a, b) => compareKeys(table, a, b))
        .map(asStored);
      if (stored.length !== expected.length) throw new Error(`${table}: ${stored.length} rows in the database, ${expected.length} expected.`);
      stored.forEach((row, i) => {
        if (!isDeepStrictEqual(row, expected[i])) throw new Error(`${table}: row ${rowKey(table, row)} differs after the round trip.`);
      });
      counts[table] = stored.length;
    }
    const anon = await db.as('anon', null, (tx) => tx.query<{ id: string }>('select id from public.puzzles'));
    if (anon.rows.some((r) => !r.id.startsWith(DEMO_ID_PREFIX))) throw new Error('anon can read puzzles other than the demo puzzles.');
    counts.anonPuzzles = anon.rows.length;
    return counts;
  } finally {
    await db.close();
  }
}

/** Sort order of `ORDER_BY` in JS (C collation, like the test database). */
function compareKeys(table: StaticTableName, a: object, b: object): number {
  for (const c of SPECS[table].key) {
    const x = (a as Record<string, unknown>)[c];
    const y = (b as Record<string, unknown>)[c];
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y;
    } else if (String(x) !== String(y)) {
      return Buffer.compare(Buffer.from(String(x)), Buffer.from(String(y)));
    }
  }
  return 0;
}
