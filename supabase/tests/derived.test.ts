/**
 * Server rules on PGlite, case by case: duplicates are ignored (outbox resends), furthest lesson progress wins, the
 * profile's `updated_at` guard (LWW), game merge and move bump, active minutes, the `explain` quota and the deletion
 * of all data of an account.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/profile';
import {
  USER_ID_COLUMN,
  USER_TABLES,
  type DailyActivityRow,
  type GameRow,
  type LessonProgressRow,
  type ProfileRow,
  type PuzzleAttemptRow,
  type RatingRow,
  type ThemeStatRow,
} from '@/core/tables';
import { PRIMARY_KEYS } from '@/data/sync/tables';
import { createTestDb, rpc, upsert, type TestDb } from '../../scripts/supabase/testDb';
import { sampleRow } from '../../scripts/supabase/testRows';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

type Row = Record<string, unknown>;

const insertIgnore = <T = Row>(uid: string, table: string, rows: Row[]) =>
  db.asUser(uid, (tx) => upsert<T>(tx, table, rows, { onConflict: table === 'ratings' ? 'user_id,kind' : 'id', ignoreDuplicates: true, returning: '*' }));
const one = async <T = Row>(sql: string, params: unknown[]) => (await db.rows<T>(sql, params))[0];
const count = async (sql: string, params: unknown[]) => (await db.rows<{ n: number }>(sql, params))[0]!.n;

function attemptRow(uid: string, over: Partial<PuzzleAttemptRow> = {}): Row {
  return { ...sampleRow('puzzle_attempts', { owner: uid }), mode: 'rated', themes: ['fork', 'pin'], ...over } as Row;
}

describe('duplicates are ignored', () => {
  it('a resent puzzle attempt counts once (rating, theme stats, daily activity)', async () => {
    const uid = await db.createUser();
    const a = attemptRow(uid);
    const first = await insertIgnore<PuzzleAttemptRow>(uid, 'puzzle_attempts', [a]);
    expect(first).toHaveLength(1);
    expect(first[0]!.rating_after).not.toBeNull();
    // Resent separately, in one batch with itself and as a plain insert: nothing is returned (= duplicate), nothing counts.
    expect(await insertIgnore(uid, 'puzzle_attempts', [a])).toEqual([]);
    expect(await insertIgnore(uid, 'puzzle_attempts', [a, a])).toEqual([]);
    expect(await db.asUser(uid, (tx) => upsert(tx, 'puzzle_attempts', [a], { returning: 'id' }))).toEqual([]);
    expect(await count(`select count(*)::int as n from public.puzzle_attempts where user_id = $1`, [uid])).toBe(1);
    const rating = await one<RatingRow>(`select * from public.ratings where user_id = $1 and kind = 'puzzle'`, [uid]);
    expect(rating!.games_count).toBe(1);
    expect(rating!.rating).toBeCloseTo(first[0]!.rating_after!, 9);
    expect(await db.rows<ThemeStatRow>(`select theme, attempts from public.theme_stats where user_id = $1 order by theme`, [uid])).toEqual([
      { theme: 'fork', attempts: 1 },
      { theme: 'pin', attempts: 1 },
    ]);
    expect((await one<DailyActivityRow>(`select * from public.daily_activity where user_id = $1`, [uid]))!.puzzles).toBe(1);
  });

  it('two new attempts in one batch both count, in order', async () => {
    const uid = await db.createUser();
    const a = attemptRow(uid, { created_at: '2026-10-18T10:00:00.000Z' });
    const b = attemptRow(uid, { created_at: '2026-10-18T10:01:00.000Z' });
    const rows = await insertIgnore<PuzzleAttemptRow>(uid, 'puzzle_attempts', [a, b]);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.rating_before).toBeCloseTo(rows[0]!.rating_after!, 9);
    expect((await one<RatingRow>(`select * from public.ratings where user_id = $1`, [uid]))!.games_count).toBe(2);
  });

  it('a resent game move or feedback is ignored; another move with the same seq is rejected', async () => {
    const uid = await db.createUser();
    const game = sampleRow('games', { owner: uid });
    await db.asUser(uid, (tx) => upsert(tx, 'games', [game], { onConflict: 'id' }));
    const move = sampleRow('game_moves', { owner: uid, gameId: game.id }) as unknown as Row;
    expect(await insertIgnore(uid, 'game_moves', [move])).toHaveLength(1);
    expect(await insertIgnore(uid, 'game_moves', [move])).toEqual([]);
    await expect(insertIgnore(uid, 'game_moves', [{ ...move, id: randomUUID() }])).rejects.toThrow(/game_moves_game_id_seq_key/);
    const fb = sampleRow('explanation_feedback', { owner: uid }) as unknown as Row;
    expect(await insertIgnore(uid, 'explanation_feedback', [fb])).toHaveLength(1);
    expect(await insertIgnore(uid, 'explanation_feedback', [fb, fb])).toEqual([]);
    expect(await count(`select count(*)::int as n from public.explanation_feedback where user_id = $1`, [uid])).toBe(1);
  });

  it('a finished bot game pushed twice is rated and counted once', async () => {
    const uid = await db.createUser();
    const game = {
      ...sampleRow('games', { owner: uid }),
      assistance: 'competition',
      status: 'finished',
      result: '1-0',
      end_reason: 'checkmate',
      finished_at: '2026-10-18T10:30:00.000Z',
      updated_at: '2026-10-18T10:30:00.000Z',
    } as Row;
    const push = () => db.asUser(uid, (tx) => upsert<GameRow>(tx, 'games', [game], { onConflict: 'id', returning: '*' }));
    const [first] = await push();
    const [second] = await push();
    expect(first!.rating_after).not.toBeNull();
    expect([second!.rating_before, second!.rating_after]).toEqual([first!.rating_before, first!.rating_after]);
    expect((await one<RatingRow>(`select * from public.ratings where user_id = $1 and kind = 'bot'`, [uid]))!.games_count).toBe(1);
    expect((await one<DailyActivityRow>(`select * from public.daily_activity where user_id = $1`, [uid]))!.games).toBe(1);
  });

  it('a second starting rating is ignored', async () => {
    const uid = await db.createUser();
    const start = sampleRow('ratings', { owner: uid }) as unknown as Row;
    expect(await insertIgnore(uid, 'ratings', [start])).toHaveLength(1);
    expect(await insertIgnore(uid, 'ratings', [{ ...start, rating: 1800 }])).toEqual([]);
    expect((await one<RatingRow>(`select * from public.ratings where user_id = $1`, [uid]))!.rating).toBe(400);
  });
});

describe('lesson progress: furthest wins', () => {
  const args = (over: Record<string, unknown>) => ({
    p_lesson_id: 's1-k1-l1',
    p_lesson_version: 1,
    p_current_step: 0,
    p_completed: false,
    p_stars: 0,
    p_mistakes: 0,
    p_hints_used: 0,
    p_score: null,
    p_updated_at: '2026-10-18T10:00:00.000Z',
    p_completed_at: null,
    ...over,
  });
  const call = (uid: string, over: Record<string, unknown>) =>
    db.asUser(uid, async (tx) => (await rpc<LessonProgressRow>(tx, 'upsert_lesson_progress', args(over)))[0]!);
  const lessons = async (uid: string) => (await one<DailyActivityRow>(`select * from public.daily_activity where user_id = $1`, [uid]))?.lessons ?? 0;

  it('a lower step never replaces a higher one; resending changes nothing', async () => {
    const uid = await db.createUser();
    expect((await call(uid, { p_current_step: 3 })).current_step).toBe(3);
    expect(await lessons(uid)).toBe(3);
    const back = await call(uid, { p_current_step: 1, p_mistakes: 9, p_updated_at: '2026-10-18T11:00:00.000Z' });
    expect(back.current_step).toBe(3);
    expect(back.mistakes).toBe(0); // the further record supplies the other fields
    expect(back.updated_at).toBe('2026-10-18T11:00:00.000Z');
    await call(uid, { p_current_step: 3 });
    expect(await lessons(uid)).toBe(3);
    expect((await call(uid, { p_current_step: 5, p_updated_at: '2026-10-18T12:00:00.000Z' })).current_step).toBe(5);
    expect(await lessons(uid)).toBe(5);
  });

  it('completed stays completed with the best stars and the first completion time', async () => {
    const uid = await db.createUser();
    const done = await call(uid, { p_current_step: 6, p_completed: true, p_stars: 2, p_completed_at: '2026-10-18T10:00:00.000Z', p_score: 0.8 });
    expect(done).toMatchObject({ completed: true, stars: 2, score: 0.8 });
    expect(await lessons(uid)).toBe(7); // six steps + the completion
    const replay = await call(uid, { p_current_step: 2, p_completed: false, p_stars: 0, p_updated_at: '2026-10-18T11:00:00.000Z' });
    expect(replay).toMatchObject({ completed: true, stars: 2, current_step: 6, score: 0.8, completed_at: '2026-10-18T10:00:00.000Z' });
    const better = await call(uid, { p_current_step: 6, p_completed: true, p_stars: 3, p_completed_at: '2026-10-18T12:00:00.000Z', p_score: 0.9 });
    expect(better).toMatchObject({ completed: true, stars: 3, score: 0.9, completed_at: '2026-10-18T10:00:00.000Z' });
    expect(await lessons(uid)).toBe(7);
  });

  it('a direct upsert (bypassing the RPC) cannot move progress back either', async () => {
    const uid = await db.createUser();
    await call(uid, { p_current_step: 4, p_completed: true, p_stars: 3, p_completed_at: '2026-10-18T10:00:00.000Z' });
    const stale = { ...sampleRow('lesson_progress', { owner: uid }), lesson_id: 's1-k1-l1', current_step: 1, completed: false, stars: 0 } as Row;
    await db.asUser(uid, (tx) => upsert(tx, 'lesson_progress', [stale], { onConflict: 'user_id,lesson_id' }));
    expect(await one(`select current_step, completed, stars from public.lesson_progress where user_id = $1`, [uid])).toEqual({
      current_step: 4,
      completed: true,
      stars: 3,
    });
  });

  it('rejects invalid input', async () => {
    const uid = await db.createUser();
    await expect(call(uid, { p_current_step: -1 })).rejects.toThrow(/invalid input/);
    await expect(call(uid, { p_stars: 4 })).rejects.toThrow(/invalid input/);
    await expect(call(uid, { p_lesson_id: null })).rejects.toThrow(/invalid input/);
  });
});

describe('profile: last writer wins (updated_at guard)', () => {
  const profile = (uid: string, over: Partial<ProfileRow>): Row => ({ ...sampleRow('profiles', { owner: uid }), ...over }) as Row;
  const push = (uid: string, row: Row) => db.asUser(uid, (tx) => upsert(tx, 'profiles', [row], { onConflict: 'id' }));
  const stored = (uid: string) => one<ProfileRow>(`select * from public.profiles where id = $1`, [uid]);

  it('an older version never overwrites a newer one', async () => {
    const uid = await db.createUser();
    const at = (m: number) => `2026-10-18T10:${String(m).padStart(2, '0')}:00.000Z`;
    await push(uid, profile(uid, { display_name: 'Neu', daily_goal_minutes: 30, updated_at: at(20), settings: { ...DEFAULT_SETTINGS, sound: false, updatedAt: at(20) } }));
    await push(uid, profile(uid, { display_name: 'Alt', daily_goal_minutes: 10, updated_at: at(5), created_at: '2026-10-18T09:00:00.000Z', settings: { ...DEFAULT_SETTINGS, sound: true, updatedAt: at(5) } }));
    const p = (await stored(uid))!;
    expect(p).toMatchObject({ display_name: 'Neu', daily_goal_minutes: 30, updated_at: at(20), created_at: '2026-10-18T09:00:00.000Z' });
    expect(p.settings.sound).toBe(false);
  });

  it('settings win by their own updatedAt, independently of the other fields', async () => {
    const uid = await db.createUser();
    const at = (m: number) => `2026-10-18T11:${String(m).padStart(2, '0')}:00.000Z`;
    await push(uid, profile(uid, { display_name: 'A', updated_at: at(30), settings: { ...DEFAULT_SETTINGS, boardTheme: 'moos', updatedAt: at(10) } }));
    // Older profile fields, but newer settings (changed offline on another device).
    await push(uid, profile(uid, { display_name: 'B', updated_at: at(20), settings: { ...DEFAULT_SETTINGS, boardTheme: 'holz', updatedAt: at(25) } }));
    const p = (await stored(uid))!;
    expect(p.display_name).toBe('A');
    expect(p.settings).toEqual({ ...DEFAULT_SETTINGS, boardTheme: 'holz', updatedAt: at(25) });
    expect(p.updated_at).toBe(at(30));
  });

  it('on a tie the incoming version wins', async () => {
    const uid = await db.createUser();
    await push(uid, profile(uid, { display_name: 'Erste' }));
    await push(uid, profile(uid, { display_name: 'Zweite' }));
    expect((await stored(uid))!.display_name).toBe('Zweite');
  });
});

describe('games', () => {
  const game = (uid: string, over: Partial<GameRow>): Row => ({ ...sampleRow('games', { owner: uid }), ...over }) as Row;
  const push = (uid: string, row: Row) => db.asUser(uid, (tx) => upsert(tx, 'games', [row], { onConflict: 'id' }));
  const stored = (id: string) => one<GameRow>(`select * from public.games where id = $1`, [id]);

  it('a finished game never becomes active again; device fields follow the newer heartbeat', async () => {
    const uid = await db.createUser();
    const id = randomUUID();
    await push(uid, game(uid, { id, status: 'finished', result: '0-1', end_reason: 'resignation', updated_at: '2026-10-18T10:10:00.000Z', active_device_id: 'a', active_heartbeat_at: '2026-10-18T10:00:00.000Z' }));
    // A stale device still has it active – with a newer timestamp and heartbeat.
    await push(uid, game(uid, { id, status: 'active', result: '*', pgn: 'stale', updated_at: '2026-10-18T10:20:00.000Z', active_device_id: 'b', active_heartbeat_at: '2026-10-18T10:15:00.000Z' }));
    expect(await stored(id)).toMatchObject({ status: 'finished', result: '0-1', pgn: '', active_device_id: 'b', updated_at: '2026-10-18T10:20:00.000Z' });
  });

  it('between two active versions the newer one wins', async () => {
    const uid = await db.createUser();
    const id = randomUUID();
    await push(uid, game(uid, { id, pgn: 'neu', updated_at: '2026-10-18T10:20:00.000Z' }));
    await push(uid, game(uid, { id, pgn: 'alt', updated_at: '2026-10-18T10:10:00.000Z' }));
    expect((await stored(id))!.pgn).toBe('neu');
  });

  it('client rating values are ignored; a move bumps updated_at', async () => {
    const uid = await db.createUser();
    const id = randomUUID();
    await push(uid, game(uid, { id, rating_before: 1000, rating_after: 1100 }));
    expect(await stored(id)).toMatchObject({ rating_before: null, rating_after: null });
    await push(uid, game(uid, { id, rating_before: 1000, rating_after: 1100, updated_at: '2026-10-18T10:05:00.000Z' }));
    expect(await stored(id)).toMatchObject({ rating_before: null, rating_after: null });
    const move = { ...sampleRow('game_moves', { owner: uid, gameId: id }), created_at: '2026-10-18T10:30:00.000Z' } as Row;
    await insertIgnore(uid, 'game_moves', [move]);
    expect((await stored(id))!.updated_at).toBe('2026-10-18T10:30:00.000Z');
    // An older move (resent late) does not move it back.
    await insertIgnore(uid, 'game_moves', [{ ...move, id: randomUUID(), seq: 2, created_at: '2026-10-18T10:01:00.000Z' }]);
    expect((await stored(id))!.updated_at).toBe('2026-10-18T10:30:00.000Z');
  });

  it('only rated competition bot games with a bot Elo change the bot rating; imports are not played games', async () => {
    const uid = await db.createUser();
    const finished = { status: 'finished', result: '1-0', end_reason: 'checkmate', finished_at: '2026-10-18T12:00:00.000Z' } as const;
    await push(uid, game(uid, { ...finished, assistance: 'training' }));
    await push(uid, game(uid, { ...finished, assistance: 'competition', headers: { White: 'Du', Black: 'Bot', WhiteElo: '900' } })); // no bot Elo
    await push(uid, game(uid, { ...finished, source: 'pgn', external_id: 'abc', bot_id: null, assistance: null }));
    expect(await db.rows(`select * from public.ratings where user_id = $1`, [uid])).toEqual([]);
    expect((await one<DailyActivityRow>(`select * from public.daily_activity where user_id = $1`, [uid]))!.games).toBe(2);
    await push(uid, game(uid, { ...finished, assistance: 'competition' }));
    expect((await one<RatingRow>(`select * from public.ratings where user_id = $1`, [uid]))!.kind).toBe('bot');
  });
});

describe('daily activity', () => {
  it('active minutes: the greatest value wins; the goal follows the profile', async () => {
    const uid = await db.createUser();
    await db.asUser(uid, (tx) => upsert(tx, 'profiles', [{ ...sampleRow('profiles', { owner: uid }), daily_goal_minutes: 10 } as Row], { onConflict: 'id' }));
    const minutes = (m: number) => db.asUser(uid, async (tx) => (await rpc<DailyActivityRow>(tx, 'upsert_daily_minutes', { p_date: '2026-10-18', p_minutes: m }))[0]!);
    expect(await minutes(6)).toMatchObject({ minutes: 6, goal_reached: false });
    expect(await minutes(4)).toMatchObject({ minutes: 6, goal_reached: false });
    expect(await minutes(12)).toMatchObject({ minutes: 12, goal_reached: true });
    // A puzzle the same day (Berlin) adds to the day and keeps the goal.
    await insertIgnore(uid, 'puzzle_attempts', [attemptRow(uid, { created_at: '2026-10-18T21:59:00.000Z', mode: 'learning' })]);
    await insertIgnore(uid, 'puzzle_attempts', [attemptRow(uid, { created_at: '2026-10-18T22:01:00.000Z', mode: 'learning' })]); // 00:01 in Berlin
    expect(await db.rows(`select date, minutes, puzzles, goal_reached from public.daily_activity where user_id = $1 order by date`, [uid])).toEqual([
      { date: '2026-10-18', minutes: 12, puzzles: 1, goal_reached: true },
      { date: '2026-10-19', minutes: 0, puzzles: 1, goal_reached: false },
    ]);
    await expect(minutes(-1)).rejects.toThrow(/invalid input/);
  });
});

describe('daily activity in the time zone of the user (DS-4)', () => {
  const setZone = (uid: string, tz: string) =>
    db.asUser(uid, (tx) => upsert(tx, 'profiles', [{ ...sampleRow('profiles', { owner: uid }), time_zone: tz } as Row], { onConflict: 'id' }));
  const days = (uid: string) => db.rows(`select date, puzzles, games, lessons from public.daily_activity where user_id = $1 order by date`, [uid]);

  it('a puzzle solved at 20:00 in New York counts for that local day (Berlin would already be on the next one)', async () => {
    const uid = await db.createUser();
    await setZone(uid, 'America/New_York');
    // 2026-10-19 20:00 EDT = 2026-10-20 00:00 UTC = 02:00 in Berlin.
    await insertIgnore(uid, 'puzzle_attempts', [attemptRow(uid, { created_at: '2026-10-20T00:00:00.000Z', mode: 'learning' })]);
    expect(await days(uid)).toEqual([{ date: '2026-10-19', puzzles: 1, games: 0, lessons: 0 }]);
  });

  it('bot games and lesson steps use the time zone too', async () => {
    const uid = await db.createUser();
    await setZone(uid, 'Asia/Tokyo');
    // 2026-10-18 20:00 UTC = 2026-10-19 05:00 in Tokyo.
    const row = { ...sampleRow('games', { owner: uid }), source: 'bot', status: 'finished', result: '1-0', end_reason: 'checkmate', finished_at: '2026-10-18T20:00:00.000Z' } as Row;
    await db.asUser(uid, (tx) => upsert(tx, 'games', [row], { onConflict: 'id' }));
    await db.asUser(uid, (tx) =>
      rpc(tx, 'upsert_lesson_progress', {
        p_lesson_id: 'l1', p_lesson_version: 1, p_current_step: 2, p_completed: false, p_stars: 0, p_mistakes: 0, p_hints_used: 0,
        p_score: null, p_updated_at: '2026-10-18T20:30:00.000Z', p_completed_at: null,
      }),
    );
    expect(await days(uid)).toEqual([{ date: '2026-10-19', puzzles: 0, games: 1, lessons: 2 }]);
  });

  it('users without a profile, with the default or with an invalid time zone fall back to Europe/Berlin', async () => {
    const day = async (uid: string) => (await db.rows<{ d: string }>(`select public.zz_local_day('2026-10-18T22:30:00Z'::timestamptz, $1)::text as d`, [uid]))[0]!.d;
    const fresh = await db.createUser();
    expect(await day(fresh)).toBe('2026-10-19'); // no profile
    await setZone(fresh, 'Europe/Berlin');
    expect(await day(fresh)).toBe('2026-10-19');
    await setZone(fresh, 'Mars/Olympus_Mons');
    expect(await day(fresh)).toBe('2026-10-19'); // invalid name: Berlin
    await setZone(fresh, 'Pacific/Auckland');
    expect(await day(fresh)).toBe('2026-10-19'); // 11:30 on the 19th there – coincides with Berlin here
    await setZone(fresh, 'America/Los_Angeles');
    expect(await day(fresh)).toBe('2026-10-18');
  });

  it('writes with an invalid time zone name never fail', async () => {
    const uid = await db.createUser();
    await setZone(uid, 'Nowhere/City');
    await insertIgnore(uid, 'puzzle_attempts', [attemptRow(uid, { created_at: '2026-10-18T22:01:00.000Z', mode: 'learning' })]);
    expect(await days(uid)).toEqual([{ date: '2026-10-19', puzzles: 1, games: 0, lessons: 0 }]);
  });
});

describe('explain quota (service role)', () => {
  it('allows up to the limit per user and day', async () => {
    const [alice, bob] = [await db.createUser(), await db.createUser()];
    const consume = (uid: string, limit = 3, date = '2026-10-18') =>
      db.as('service_role', null, async (tx) => (await rpc<{ allowed: boolean; used: number }>(tx, 'consume_explanation_quota', { p_user_id: uid, p_limit: limit, p_date: date }))[0]!);
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await consume(alice));
    expect(results).toEqual([
      { allowed: true, used: 1 },
      { allowed: true, used: 2 },
      { allowed: true, used: 3 },
      { allowed: false, used: 3 },
    ]);
    expect(await consume(bob)).toEqual({ allowed: true, used: 1 });
    expect(await consume(alice, 3, '2026-10-19')).toEqual({ allowed: true, used: 1 });
    expect(await consume(bob, 0, '2026-10-20')).toEqual({ allowed: false, used: 0 });
    // The default limit is 200.
    const deflt = await db.as('service_role', null, async (tx) => (await rpc<{ allowed: boolean; used: number }>(tx, 'consume_explanation_quota', { p_user_id: bob }))[0]!);
    expect(deflt.allowed).toBe(true);
  });
});

describe('account deletion', () => {
  async function fill(uid: string) {
    const gameId = randomUUID(); // `games` comes before `game_moves` and `game_analyses`
    for (const table of USER_TABLES) {
      // Derived rows (e.g. the day of the sample attempt) may exist already.
      await upsert(db.pg, table, [sampleRow(table, { owner: uid, gameId })], { onConflict: PRIMARY_KEYS[table].join(','), ignoreDuplicates: true });
    }
  }
  const remaining = async (uid: string) => {
    let n = 0;
    for (const table of USER_TABLES) n += await count(`select count(*)::int as n from public."${table}" where "${USER_ID_COLUMN[table]}" = $1`, [uid]);
    return n;
  };

  it('delete_user_data removes every row of the user and nothing else', async () => {
    const [alice, bob] = [await db.createUser(), await db.createUser()];
    await fill(alice);
    await fill(bob);
    const before = await remaining(bob);
    expect(await remaining(alice)).toBeGreaterThanOrEqual(USER_TABLES.length);
    const [res] = await db.as('service_role', null, (tx) => rpc<{ delete_user_data: number }>(tx, 'delete_user_data', { p_user_id: alice }));
    expect(res!.delete_user_data).toBeGreaterThanOrEqual(USER_TABLES.length);
    expect(await remaining(alice)).toBe(0);
    expect(await remaining(bob)).toBe(before);
  });

  it('deleting the auth user cascades to every user table', async () => {
    const carol = await db.createUser();
    await fill(carol);
    await db.pg.query(`delete from auth.users where id = $1`, [carol]);
    expect(await remaining(carol)).toBe(0);
  });
});
