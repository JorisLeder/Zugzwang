/**
 * Row level security on PGlite, acting as the API roles (`anon`, `authenticated` with `auth.uid()` from the JWT
 * setting). Generated over every user table: another user's rows can neither be read nor inserted, updated, upserted
 * or deleted. Plus static content, demo puzzles for `anon`, append-only tables and server-only tables.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APPEND_ONLY_TABLES, STATIC_TABLES, USER_ID_COLUMN, USER_TABLES, type UserTableName } from '@/core/tables';
import { PRIMARY_KEYS, rowKey } from '@/data/sync/tables';
import { createTestDb, rpc, upsert, type Queryable, type TestDb } from '../../scripts/supabase/testDb';
import { sampleRow } from '../../scripts/supabase/testRows';

type Row = Record<string, unknown>;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

/** A sample row of `table` owned by `owner` (moves reference `gameId`). */
function rowOf(table: UserTableName, owner: string, gameId?: string): Row {
  return sampleRow(table, { owner, gameId }) as unknown as Row;
}

/** Inserts a row as superuser (no RLS) and returns it. */
async function seed(table: UserTableName, owner: string): Promise<{ row: Row; gameId?: string }> {
  let gameId: string | undefined;
  if (table === 'game_moves') {
    gameId = randomUUID();
    await upsert(db.pg, 'games', [rowOf('games', owner, gameId)]);
  }
  const row = rowOf(table, owner, gameId);
  await upsert(db.pg, table, [row]);
  return { row, gameId };
}

const pkWhere = (table: UserTableName, offset = 0) =>
  PRIMARY_KEYS[table].map((c, i) => `"${c}" = $${i + 1 + offset}`).join(' and ');
const pkValues = (table: UserTableName, row: Row) => PRIMARY_KEYS[table].map((c) => row[c]);

/** The row as stored (superuser view). */
async function stored(table: UserTableName, row: Row): Promise<Row[]> {
  return db.rows(`select * from public."${table}" where ${pkWhere(table)}`, pkValues(table, row));
}

/** Errors of the access rules (RLS policy or missing privilege) – not some other failure of a broken statement. */
const ACCESS_DENIED = /row-level security|permission denied/;

/** Runs `fn`; the attempt "fails" when it throws or touches no row. Returns whether it threw (and why). */
async function attempt(
  fn: () => Promise<{ affectedRows?: number } | unknown[]>,
): Promise<{ threw: boolean; affected: number; error?: string }> {
  try {
    const res = await fn();
    const affected = Array.isArray(res) ? res.length : (res.affectedRows ?? 0);
    return { threw: false, affected };
  } catch (e) {
    return { threw: true, affected: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

describe.each(USER_TABLES)('cross-user access: %s', (table) => {
  const owner = USER_ID_COLUMN[table];
  let alice: string;
  let bob: string;
  let carol: string;
  let aliceRow: Row;
  let aliceGame: string | undefined;

  beforeAll(async () => {
    alice = await db.createUser();
    bob = await db.createUser();
    carol = await db.createUser();
    ({ row: aliceRow, gameId: aliceGame } = await seed(table, alice));
  });

  it('the owner reads the row', async () => {
    const rows = await db.asUser(alice, (tx) => tx.query(`select * from public."${table}" where ${pkWhere(table)}`, pkValues(table, aliceRow)));
    expect(rows.rows).toHaveLength(1);
  });

  it('the owner may insert (and update) exactly where the access rules allow it (positive control)', async () => {
    const insertable = !['daily_activity', 'theme_stats', 'explanation_usage'].includes(table);
    const fresh = rowOf(table, alice, aliceGame);
    if (table === 'game_moves') fresh.seq = 2;
    if (table === 'ratings') fresh.kind = 'bot';
    const ins = await attempt(() => db.asUser(alice, (tx) => upsert(tx, table, [fresh], { returning: '*' })));
    if (table === 'profiles') expect(ins.threw).toBe(true); // the profile exists already (one per user)
    else expect({ ...ins, error: undefined }, table).toEqual(insertable ? { threw: false, affected: 1 } : { threw: true, affected: 0 });
    if (!insertable) expect(ins.error).toMatch(/permission denied/);
    const mutable = ['profiles', 'games', 'game_analyses', 'review_queue', 'lesson_progress'].includes(table);
    const pkCols = PRIMARY_KEYS[table];
    const valueCol = Object.keys(aliceRow).find((c) => !pkCols.includes(c) && c !== owner)!;
    const upd = await attempt(() =>
      db.asUser(alice, (tx) => tx.query(`update public."${table}" set "${valueCol}" = "${valueCol}" where ${pkWhere(table)}`, pkValues(table, aliceRow))),
    );
    expect({ ...upd, error: undefined }, table).toEqual(mutable ? { threw: false, affected: 1 } : { threw: true, affected: 0 });
    if (!mutable) expect(upd.error).toMatch(/permission denied/);
  });

  it('another user sees none of it', async () => {
    const rows = await db.asUser(bob, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from public."${table}"`));
    expect(rows.rows[0]!.n).toBe(0);
    const anon = await attempt(() => db.as('anon', null, (tx) => tx.query(`select * from public."${table}"`)).then((r) => r.rows));
    expect(anon.threw || anon.affected === 0).toBe(true);
  });

  it("another user cannot insert rows owned by someone else", async () => {
    const before = await db.rows(`select * from public.ratings where user_id in ($1, $2)`, [alice, carol]);
    for (const victim of [alice, carol]) {
      // A fresh row (new key) owned by the victim; moves into the victim's game.
      const row = rowOf(table, victim, aliceGame);
      if (table === 'puzzle_attempts') Object.assign(row, { mode: 'rated' }); // would change the victim's rating
      const res = await attempt(() => db.asUser(bob, (tx) => upsert(tx, table, [row], { returning: '*' })));
      expect(res.threw, `${table} for ${victim === alice ? 'alice' : 'carol'}`).toBe(true);
      expect(res.error).toMatch(ACCESS_DENIED);
      // Tables keyed by (owner, …) share the key with Alice's seeded row: that one stays as it was.
      expect(await stored(table, row)).toEqual(rowKey(table, row) === rowKey(table, aliceRow) ? [aliceRow] : []);
    }
    if (table === 'game_moves') {
      // Own user id, but the victim's game.
      const res = await attempt(() => db.asUser(bob, (tx) => upsert(tx, table, [{ ...rowOf(table, bob, aliceGame), seq: 5 }])));
      expect(res.error).toMatch(ACCESS_DENIED);
    }
    // Server-side effects of a rejected insert are rolled back too.
    expect(await db.rows(`select * from public.ratings where user_id in ($1, $2)`, [alice, carol])).toEqual(before);
  });

  it("another user cannot update, take over, upsert or delete the row", async () => {
    const pkCols = PRIMARY_KEYS[table];
    const valueCol = Object.keys(aliceRow).find((c) => !pkCols.includes(c) && c !== owner)!;
    const tries: Array<(tx: Queryable) => Promise<{ affectedRows?: number } | unknown[]>> = [
      (tx) => tx.query(`update public."${table}" set "${valueCol}" = "${valueCol}" where "${owner}" = $1`, [alice]),
      (tx) => tx.query(`update public."${table}" set "${owner}" = $1 where "${owner}" = $2`, [bob, alice]),
      (tx) => tx.query(`delete from public."${table}" where "${owner}" = $1`, [alice]),
      // Upsert onto the victim's key, once as the victim and once claiming the row for oneself.
      (tx) => upsert(tx, table, [{ ...aliceRow }], { onConflict: pkCols.join(','), returning: '*' }),
    ];
    // Claiming Alice's key for oneself – only where the key does not contain the owner column (otherwise the claimed
    // row simply is a different, own row).
    if (!pkCols.includes(owner)) {
      tries.push(
        (tx) => upsert(tx, table, [{ ...aliceRow, [owner]: bob }], { onConflict: pkCols.join(','), returning: '*' }),
        (tx) => upsert(tx, table, [{ ...aliceRow, [owner]: bob }], { onConflict: pkCols.join(','), ignoreDuplicates: true, returning: '*' }),
      );
    }
    for (const [i, run] of tries.entries()) {
      const res = await attempt(() => db.asUser(bob, run));
      expect(res.threw || res.affected === 0, `${table} attempt ${i}`).toBe(true);
      if (res.threw) expect(res.error, `${table} attempt ${i}`).toMatch(ACCESS_DENIED);
      expect(await stored(table, aliceRow), `${table} attempt ${i}`).toEqual([aliceRow]);
    }
    const bobs = await db.rows<{ n: number }>(`select count(*)::int as n from public."${table}" where "${owner}" = $1`, [bob]);
    expect(bobs[0]!.n).toBe(0);
  });
});

describe('own rows', () => {
  it('the owner can update the mutable tables but never move a row to another user', async () => {
    for (const table of ['profiles', 'games', 'game_analyses', 'review_queue', 'lesson_progress'] as const) {
      const alice = await db.createUser();
      const bob = await db.createUser();
      const { row } = await seed(table, alice);
      const res = await attempt(() =>
        db.asUser(alice, (tx) => tx.query(`update public."${table}" set "${USER_ID_COLUMN[table]}" = $1 where ${pkWhere(table, 1)}`, [bob, ...pkValues(table, row)])),
      );
      // Either rejected (WITH CHECK) or neutralised by the merge trigger – the row stays Alice's.
      if (res.threw) expect(res.error, table).toMatch(ACCESS_DENIED);
      const after = await stored(table, row);
      expect(after.length === 0 ? null : after[0]![USER_ID_COLUMN[table]], table).toBe(alice);
    }
  });

  it.each(APPEND_ONLY_TABLES)('append-only %s: the owner can neither update nor delete', async (table) => {
    const alice = await db.createUser();
    const { row } = await seed(table, alice);
    await expect(db.asUser(alice, (tx) => tx.query(`update public."${table}" set created_at = now() where id = $1`, [row.id]))).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.asUser(alice, (tx) => tx.query(`delete from public."${table}" where id = $1`, [row.id]))).rejects.toThrow(/permission denied/);
    // An upsert that would update needs the UPDATE privilege.
    await expect(db.asUser(alice, (tx) => upsert(tx, table, [row], { onConflict: 'id' }))).rejects.toThrow(/permission denied/);
    // Resending with `ignoreDuplicates` (the outbox) is fine and returns nothing (= duplicate).
    expect(await db.asUser(alice, (tx) => upsert(tx, table, [row], { onConflict: 'id', ignoreDuplicates: true, returning: 'id' }))).toEqual([]);
    expect(await stored(table, row)).toEqual([row]);
  });

  it('ratings: the owner inserts a starting value only and never updates it', async () => {
    const alice = await db.createUser();
    const start = rowOf('ratings', alice);
    await db.asUser(alice, (tx) => upsert(tx, 'ratings', [start], { onConflict: 'user_id,kind', ignoreDuplicates: true }));
    expect(await stored('ratings', start)).toEqual([start]);
    await expect(db.asUser(alice, (tx) => upsert(tx, 'ratings', [{ ...start, kind: 'bot', games_count: 30, rating: 2500 }]))).rejects.toThrow(
      /row-level security/,
    );
    await expect(db.asUser(alice, (tx) => tx.query(`update public.ratings set rating = 2800 where user_id = $1`, [alice]))).rejects.toThrow(
      /permission denied/,
    );
    // A second starting value is ignored (the server's rating stays).
    await db.asUser(alice, (tx) => upsert(tx, 'ratings', [{ ...start, rating: 2400 }], { onConflict: 'user_id,kind', ignoreDuplicates: true }));
    expect(await stored('ratings', start)).toEqual([start]);
  });

  it.each(['daily_activity', 'theme_stats', 'explanation_usage'] as const)('server-computed %s: read-only for its owner', async (table) => {
    const alice = await db.createUser();
    const { row } = await seed(table, alice);
    expect((await db.asUser(alice, (tx) => tx.query(`select * from public."${table}"`))).rows).toEqual([row]);
    await expect(db.asUser(alice, (tx) => upsert(tx, table, [rowOf(table, alice)], { onConflict: PRIMARY_KEYS[table].join(',') }))).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.asUser(alice, (tx) => tx.query(`update public."${table}" set "${Object.keys(row).at(-1)}" = "${Object.keys(row).at(-1)}"`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('the internal functions are not callable by clients', async () => {
    const alice = await db.createUser();
    await expect(db.asUser(alice, (tx) => rpc(tx, 'consume_explanation_quota', { p_user_id: alice }))).rejects.toThrow(/permission denied/);
    await expect(db.asUser(alice, (tx) => rpc(tx, 'delete_user_data', { p_user_id: alice }))).rejects.toThrow(/permission denied/);
    await expect(
      db.asUser(alice, (tx) => tx.query(`select * from public.glicko2_update(1500, 350, 0.06, array[1500]::float8[], array[80]::float8[], array[1]::float8[])`)),
    ).rejects.toThrow(/permission denied/);
    await expect(db.as('anon', null, (tx) => rpc(tx, 'upsert_daily_minutes', { p_date: '2026-10-18', p_minutes: 5 }))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('the RPCs act on the caller only and require a login', async () => {
    const alice = await db.createUser();
    await db.asUser(alice, (tx) => rpc(tx, 'upsert_daily_minutes', { p_date: '2026-10-18', p_minutes: 7 }));
    expect(await db.rows(`select user_id, minutes from public.daily_activity where user_id = $1`, [alice])).toEqual([{ user_id: alice, minutes: 7 }]);
    await expect(db.as('authenticated', null, (tx) => rpc(tx, 'upsert_daily_minutes', { p_date: '2026-10-18', p_minutes: 5 }))).rejects.toThrow(
      /not authenticated/,
    );
    await expect(
      db.as('authenticated', null, (tx) => rpc(tx, 'upsert_lesson_progress', { p_lesson_id: 'l', p_lesson_version: 1, p_current_step: 1, p_completed: false, p_stars: 0 })),
    ).rejects.toThrow(/not authenticated/);
  });
});

describe('static content', () => {
  let alice: string;
  const rows: Record<string, Row> = {};

  beforeAll(async () => {
    alice = await db.createUser();
    const course = sampleRow('courses', { owner: '' });
    const lesson = sampleRow('lessons', { owner: '', courseId: course.id });
    rows.courses = course as unknown as Row;
    rows.lessons = lesson as unknown as Row;
    rows.lesson_steps = sampleRow('lesson_steps', { owner: '', lessonId: lesson.id }) as unknown as Row;
    rows.bots = sampleRow('bots', { owner: '' }) as unknown as Row;
    rows.puzzles = sampleRow('puzzles', { owner: '' }) as unknown as Row;
    for (const t of ['courses', 'lessons', 'lesson_steps', 'bots', 'puzzles']) await upsert(db.pg, t, [rows[t]!]);
    await upsert(db.pg, 'puzzles', [{ ...rows.puzzles!, id: 'demo-1' }, { ...rows.puzzles!, id: 'demo-2' }]);
  });

  it.each(STATIC_TABLES)('%s: readable by authenticated users, never writable', async (table) => {
    const read = await db.asUser(alice, (tx) => tx.query(`select count(*)::int as n from public."${table}"`));
    expect((read.rows[0] as { n: number }).n).toBeGreaterThan(0);
    const fresh = table === 'lesson_steps' ? { ...rows[table]!, step_index: 99 } : { ...rows[table]!, id: `x-${randomUUID()}` };
    const col = Object.keys(fresh)[0]!;
    for (const role of ['authenticated', 'anon'] as const) {
      const uid = role === 'anon' ? null : alice;
      await expect(db.as(role, uid, (tx) => upsert(tx, table, [fresh]))).rejects.toThrow(/permission denied/);
      await expect(db.as(role, uid, (tx) => tx.query(`update public."${table}" set "${col}" = "${col}"`))).rejects.toThrow(/permission denied/);
      await expect(db.as(role, uid, (tx) => tx.query(`delete from public."${table}"`))).rejects.toThrow(/permission denied/);
    }
  });

  it('anon reads the demo puzzles and nothing else', async () => {
    const puzzles = await db.as('anon', null, (tx) => tx.query<{ id: string }>(`select id from public.puzzles order by id`));
    expect(puzzles.rows.map((r) => r.id)).toEqual(['demo-1', 'demo-2']);
    for (const table of ['bots', 'courses', 'lessons', 'lesson_steps', ...USER_TABLES]) {
      await expect(db.as('anon', null, (tx) => tx.query(`select * from public."${table}"`)), table).rejects.toThrow(/permission denied/);
    }
  });
});
