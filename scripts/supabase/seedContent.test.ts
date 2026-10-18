import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { puzzleBankManifestSchema } from '@/core/schemas';
import { toRow } from '@/core/tables';
import { DEMO_PUZZLES } from '@/puzzles';
import {
  cleanupStatements,
  loadStaticContent,
  ROWS_PER_INSERT,
  SEED_ORDER,
  seedSql,
  sqlString,
  sqlValue,
  upsertStatements,
  verifySeed,
  type StaticContent,
  type StaticRows,
} from './seedContent';
import { createTestDb, ROOT_DIR } from './testDb';

let content: StaticContent;

beforeAll(() => {
  content = loadStaticContent(ROOT_DIR);
});

/** A small consistent subset of the real content: `n` courses with lessons, all bots, a few puzzles + 1 demo puzzle. */
function subset(rows: StaticRows, courseIds: readonly string[], puzzles: number): StaticRows {
  const lessons = rows.lessons.filter((l) => courseIds.includes(l.course_id));
  const lessonIds = new Set(lessons.map((l) => l.id));
  return {
    courses: rows.courses.filter((c) => courseIds.includes(c.id)),
    lessons,
    lesson_steps: rows.lesson_steps.filter((s) => lessonIds.has(s.lesson_id)),
    bots: rows.bots,
    puzzles: [...rows.puzzles.filter((p) => !p.id.startsWith('demo-')).slice(0, puzzles), rows.puzzles.find((p) => p.id === 'demo-1')!],
  };
}

const sqlOf = (rows: StaticRows) => seedSql({ rows, bankVersion: 'test', demoPuzzles: 1 });

describe('SQL literals', () => {
  it('quotes text, arrays and JSON safely', () => {
    expect(sqlString("Dxh7# – der Läufer's Diagonale")).toBe("'Dxh7# – der Läufer''s Diagonale'");
    expect(sqlValue(null, 'scalar', 'x')).toBe('null');
    expect(sqlValue(undefined, 'json', 'x')).toBe('null');
    expect(sqlValue(80.5, 'scalar', 'x')).toBe('80.5');
    expect(sqlValue([], 'array', 'x')).toBe("'{}'::text[]");
    expect(sqlValue(['a,b', "c'd"], 'array', 'x')).toBe("array['a,b', 'c''d']::text[]");
    expect(sqlValue({ t: 'say "hi" \\ \'' }, 'json', 'x')).toBe(`'{"t":"say \\"hi\\" \\\\ ''"}'::jsonb`);
  });

  it('rejects values the seed cannot represent', () => {
    expect(() => sqlString('a\0b')).toThrow(/NUL/);
    expect(() => sqlValue(Number.NaN, 'scalar', 'puzzles.rating')).toThrow(/finite/);
    expect(() => sqlValue({ a: 1 }, 'scalar', 'bots.extra')).toThrow(/SPECS/);
    expect(() => sqlValue([1, 2], 'array', 'puzzles.moves')).toThrow(/strings/);
  });

  it('splits large tables into several upserts and updates every non-key column', () => {
    const statements = upsertStatements('puzzles', content.rows.puzzles);
    expect(statements).toHaveLength(Math.ceil(content.rows.puzzles.length / ROWS_PER_INSERT));
    expect(statements[0]).toMatch(/^insert into public\.puzzles \(id, fen, moves, /);
    expect(statements[0]).toMatch(/on conflict \(id\) do update set fen = excluded\.fen, .*game_url = excluded\.game_url;$/);
    expect(upsertStatements('lesson_steps', content.rows.lesson_steps)[0]).toMatch(/on conflict \(lesson_id, step_index\) do update set step_id/);
    expect(upsertStatements('bots', [])).toEqual([]);
  });

  it('removes rows that are gone, also when a table is empty in the repository', () => {
    const empty: StaticRows = { courses: [], lessons: [], lesson_steps: [], bots: [], puzzles: [] };
    expect(cleanupStatements(empty)).toEqual([
      "delete from public.lessons where id <> all ('{}'::text[]);",
      "delete from public.courses where id <> all ('{}'::text[]);",
      "delete from public.bots where id <> all ('{}'::text[]);",
      "delete from public.puzzles where id <> all ('{}'::text[]);",
    ]);
  });
});

describe('static content of the repository', () => {
  it('loads without errors and covers bank, demo puzzles, bots and lessons', () => {
    expect(content.errors).toEqual([]);
    const manifest = puzzleBankManifestSchema.parse(JSON.parse(readFileSync(join(ROOT_DIR, 'public/data/puzzles/manifest.json'), 'utf8')));
    const bankCount = manifest.chunks.reduce((n, c) => n + c.count, 0);
    expect(content.bankVersion).toBe(manifest.version);
    expect(content.demoPuzzles).toBe(DEMO_PUZZLES.length);
    expect(content.rows.puzzles).toHaveLength(bankCount + DEMO_PUZZLES.length);
    expect(content.rows.puzzles.filter((p) => p.id.startsWith('demo-')).map((p) => p.id)).toEqual(DEMO_PUZZLES.map((p) => p.id));
    expect(content.rows.puzzles.find((p) => p.id === 'demo-1')).toEqual(toRow.puzzle(DEMO_PUZZLES[0]!));
    expect(content.rows.bots.length).toBeGreaterThanOrEqual(10);
    expect(content.rows.courses.filter((c) => c.status === 'available')).toHaveLength(6);
    expect(content.rows.lessons.some((l) => l.kind === 'skip_test')).toBe(true);
    // Every lesson listed by an available course is in the seed, with all its steps in order.
    for (const c of content.rows.courses) {
      for (const id of [...c.lesson_ids, ...(c.test_lesson_id ? [c.test_lesson_id] : [])]) {
        expect(content.rows.lessons.some((l) => l.id === id && l.course_id === c.id), id).toBe(true);
        const steps = content.rows.lesson_steps.filter((s) => s.lesson_id === id).map((s) => s.step_index);
        expect(steps, id).toEqual(steps.map((_, i) => i));
      }
    }
  });

  it('reports content problems instead of writing a broken seed', () => {
    const broken = loadStaticContent(join(ROOT_DIR, 'does-not-exist'));
    expect(broken.errors.some((e) => e.startsWith('content/lessons/catalog.json'))).toBe(true);
    expect(broken.errors.some((e) => e.includes('manifest.json'))).toBe(true);
  });
});

describe('seed against the migrations (PGlite)', () => {
  it('applies the full seed twice and every row reads back unchanged', async () => {
    const counts = await verifySeed(seedSql(content), content.rows);
    for (const t of SEED_ORDER) expect(counts[t]).toBe(content.rows[t].length);
    expect(counts.anonPuzzles).toBe(DEMO_PUZZLES.length);
  }, 120_000);

  it('keeps tricky text intact', async () => {
    const rows = subset(content.rows, ['brett-und-figuren'], 2);
    const p = rows.puzzles[0]!;
    rows.puzzles[0] = {
      ...p,
      opening_tags: ['Sicilian_Defense', 'a,b', 'say "x"', "it's", 'back\\slash', '{}', ''],
      explanation: { plain: "Te8# – ''quoted'' \\n \"x\" $$ ; -- kein Kommentar", segments: [], source: 'rule', motifs: [] },
      game_url: "https://example.org/?a='1';--",
    };
    const counts = await verifySeed(sqlOf(rows), rows);
    expect(counts.puzzles).toBe(rows.puzzles.length);
  }, 60_000);

  it('removes lessons, steps, courses, bots and puzzles that are no longer in the repository', async () => {
    const full = subset(content.rows, ['brett-und-figuren', 'schach-matt-patt'], 5);
    const lesson = full.lessons.find((l) => l.course_id === 'brett-und-figuren')!;
    const smaller: StaticRows = {
      courses: full.courses.filter((c) => c.id !== 'schach-matt-patt'),
      lessons: full.lessons.filter((l) => l.course_id !== 'schach-matt-patt'),
      lesson_steps: full.lesson_steps.filter(
        (s) => !(s.lesson_id === lesson.id && s.step_index >= 3) && full.lessons.some((l) => l.id === s.lesson_id && l.course_id !== 'schach-matt-patt'),
      ),
      bots: full.bots.slice(1),
      puzzles: full.puzzles.slice(2),
    };
    const db = await createTestDb();
    try {
      await db.pg.exec(sqlOf(full));
      await db.pg.exec(sqlOf(smaller));
      for (const t of SEED_ORDER) {
        const [row] = await db.rows<{ n: number }>(`select count(*)::int as n from public.${t}`);
        expect(row!.n, t).toBe(smaller[t].length);
      }
      const [steps] = await db.rows<{ n: number }>('select max(step_index)::int as n from public.lesson_steps where lesson_id = $1', [lesson.id]);
      expect(steps!.n).toBe(2);
    } finally {
      await db.close();
    }
  }, 60_000);
});
