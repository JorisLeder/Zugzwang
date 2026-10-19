/**
 * Server-side derived values vs the client rules (`@/data/progress`, `@/lib/rating`) on generated sequences: the
 * triggers and RPCs must compute exactly what the Dexie ProgressService, the sync merge and the fake backend compute.
 *
 * - Puzzle attempts → puzzle rating (+ `rating_before/after`), theme stats, daily activity (Europe/Berlin days,
 *   across midnight and the end of summer time).
 * - Finished bot games → bot rating (+ `rating_before/after`), daily games; PGN imports count for neither.
 * - Lesson progress (RPC with the outbox arguments) → furthest wins, lesson steps per day.
 * - Profile upserts → `mergeProfile`; game upserts → `mergeGame`.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Game } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import { DEFAULT_SETTINGS, type DailyActivity, type Profile, type ThemeStat } from '@/core/profile';
import type { PuzzleAttempt, PuzzleMode, PuzzleThemeId } from '@/core/puzzles';
import { MIN_PUZZLE_RATING, type RatingKind, type RatingRecord } from '@/core/rating';
import {
  fromRow,
  toRow,
  type DailyActivityRow,
  type GameRow,
  type LessonProgressRow,
  type ProfileRow,
  type PuzzleAttemptRow,
  type RatingRow,
  type ThemeStatRow,
} from '@/core/tables';
import { lessonProgressArgs } from '@/data/outbox';
import {
  addToDay,
  applyThemeStats,
  dayKeyOf,
  defaultRating,
  isRatedAttempt,
  lessonStepsGained,
  mergeGame,
  mergeLessonProgress,
  mergeProfile,
  rateBotGame,
  ratePuzzleAttempt,
} from '@/data/progress';
import { createTestDb, rpc, upsert, type TestDb } from '../../scripts/supabase/testDb';
import { seededRng } from '../../scripts/supabase/testRows';

const TZ = 'Europe/Berlin';
const MODES: readonly PuzzleMode[] = ['rated', 'rated', 'rated', 'learning', 'theme', 'daily', 'review', 'rush_3', 'survival'];
const THEMES = ['fork', 'pin', 'mateIn1', 'skewer', 'backRankMate', 'hangingPiece'] as PuzzleThemeId[];
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});

afterAll(async () => {
  await db?.close();
});

type Rng = ReturnType<typeof seededRng>;

/** A new user with a profile (daily goal) and the self-assessment starting rating of `kind`, as the client sends them. */
async function newUser(rng: Rng, kind: RatingKind, at: string): Promise<{ uid: string; goal: number; rating: RatingRecord }> {
  const uid = await db.createUser();
  const goal = rng.pick([5, 10, 20, 30]);
  const profile: Profile = {
    id: uid,
    displayName: 'Testperson',
    settings: { ...DEFAULT_SETTINGS, updatedAt: at },
    dailyGoalMinutes: goal,
    selfAssessment: 'beginner',
    onboardingCompleted: true,
    stageZeroSkipped: false,
    timeZone: 'Europe/Berlin',
    createdAt: at,
    updatedAt: at,
  };
  const rating: RatingRecord = { ...defaultRating(kind, at), rating: rng.pick([200, 400, 800, 1200, 1600]) };
  await db.asUser(uid, async (tx) => {
    await upsert(tx, 'profiles', [toRow.profile(profile)], { onConflict: 'id' });
    await upsert(tx, 'ratings', [toRow.rating(rating, uid)], { onConflict: 'user_id,kind', ignoreDuplicates: true });
  });
  return { uid, goal, rating };
}

async function expectRating(uid: string, kind: RatingKind, expected: RatingRecord) {
  const [row] = await db.rows<RatingRow>(`select * from public.ratings where user_id = $1 and kind = $2`, [uid, kind]);
  expect(row).toBeDefined();
  expect(Math.abs(row!.rating - expected.rating)).toBeLessThan(0.01);
  expect(Math.abs(row!.rd - expected.rd)).toBeLessThan(0.01);
  expect(Math.abs(row!.volatility - expected.volatility)).toBeLessThan(1e-6);
  expect(row!.games_count).toBe(expected.gamesCount);
}

async function expectDays(uid: string, days: Map<string, DailyActivity>) {
  const rows = await db.rows<DailyActivityRow>(`select * from public.daily_activity where user_id = $1 order by date`, [uid]);
  const expected = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map((d) => toRow.dailyActivity(d, uid));
  expect(rows).toEqual(expected);
}

const close = (a: number | null, b: number | null | undefined) =>
  a === null || b === null || b === undefined ? a === (b ?? null) : Math.abs(a - b) < 0.01;

describe('puzzle attempts: rating, theme stats and daily activity (10 generated sequences)', () => {
  it('equal ratePuzzleAttempt / applyThemeStats / addToDay', async () => {
    let rated = 0;
    const dates = new Set<string>();
    for (let seq = 0; seq < 10; seq += 1) {
      const rng = seededRng(1000 + seq);
      let t = Date.parse('2026-10-24T17:00:00.000Z') + seq * 3_600_000;
      const { uid, goal, rating: start } = await newUser(rng, 'puzzle', new Date(t).toISOString());
      let rating = start;
      const stats = new Map<string, ThemeStat>();
      const days = new Map<string, DailyActivity>();
      for (let i = 0; i < 30; i += 1) {
        t += rng.int(1, 150) * 60_000; // crosses midnight and 2026-10-25 03:00 CEST → 02:00 CET
        const createdAt = new Date(t).toISOString();
        const hints = rng.bool(0.75) ? 0 : (rng.int(1, 3) as 1 | 2 | 3);
        const a: PuzzleAttempt = {
          id: randomUUID(),
          puzzleId: `seed-${rng.int(1, 9999)}`,
          mode: rng.pick(MODES),
          solved: rng.bool(0.6),
          firstTry: rng.bool(0.7),
          hintsUsed: hints,
          solutionShown: rng.bool(0.15),
          timeMs: rng.int(1_000, 120_000),
          themes: Array.from({ length: rng.int(0, 3) }, () => rng.pick(THEMES)), // duplicates on purpose
          puzzleRating: rng.int(300, 2500),
          // Client values (e.g. computed offline) are replaced by the server's.
          ratingBefore: 1,
          ratingAfter: 2,
          createdAt,
        };
        const puzzleRd = rng.pick([0, 60, 80, 120]);
        const [row] = await db.asUser(uid, (tx) =>
          upsert<PuzzleAttemptRow>(tx, 'puzzle_attempts', [toRow.puzzleAttempt(a, uid, puzzleRd)], {
            onConflict: 'id',
            ignoreDuplicates: true,
            returning: '*',
          }),
        );
        if (isRatedAttempt(a.mode)) {
          const before = rating;
          rating = ratePuzzleAttempt(rating, a, puzzleRd, createdAt);
          expect(close(row!.rating_before, before.rating), `before ${seq}/${i}`).toBe(true);
          expect(close(row!.rating_after, rating.rating), `after ${seq}/${i}`).toBe(true);
          rated += 1;
        } else {
          expect([row!.rating_before, row!.rating_after]).toEqual([null, null]);
        }
        for (const s of applyThemeStats(stats, a)) stats.set(s.theme, s);
        const key = dayKeyOf(createdAt, TZ);
        dates.add(key);
        days.set(key, addToDay(days.get(key), key, { puzzles: 1 }, goal));
      }
      await expectRating(uid, 'puzzle', rating);
      const statRows = await db.rows<ThemeStatRow>(`select * from public.theme_stats where user_id = $1 order by theme`, [uid]);
      const expectedStats = [...stats.values()].sort((x, y) => (x.theme < y.theme ? -1 : 1)).map((s) => toRow.themeStat(s, uid));
      expect(statRows.sort((x, y) => (x.theme < y.theme ? -1 : 1))).toEqual(expectedStats);
      await expectDays(uid, days);
    }
    expect(rated).toBeGreaterThan(50);
    expect(dates.has('2026-10-25')).toBe(true); // the DST day is covered
  });
});

describe('rating floor (PR-2)', () => {
  it('server floor equals MIN_PUZZLE_RATING and a beginner never drops below it', async () => {
    const sql = readFileSync('supabase/migrations/20261019000000_rating_floor.sql', 'utf8');
    expect(sql).toContain(`greatest(${MIN_PUZZLE_RATING}, nxt.rating)`);
    const at = '2026-10-20T10:00:00.000Z';
    const uid = await db.createUser();
    const profile: Profile = {
      id: uid, displayName: 'Neuling', settings: { ...DEFAULT_SETTINGS, updatedAt: at }, dailyGoalMinutes: 10, selfAssessment: 'beginner',
      onboardingCompleted: true, stageZeroSkipped: false, timeZone: 'Europe/Berlin', createdAt: at, updatedAt: at,
    };
    let rating: RatingRecord = { ...defaultRating('puzzle', at), rating: 400, rd: 350 };
    await db.asUser(uid, async (tx) => {
      await upsert(tx, 'profiles', [toRow.profile(profile)], { onConflict: 'id' });
      await upsert(tx, 'ratings', [toRow.rating(rating, uid)], { onConflict: 'user_id,kind', ignoreDuplicates: true });
    });
    for (let i = 0; i < 6; i += 1) {
      const createdAt = new Date(Date.parse(at) + i * 60_000).toISOString();
      const a: PuzzleAttempt = {
        id: randomUUID(), puzzleId: `seed-${i}`, mode: 'rated', solved: false, firstTry: false, hintsUsed: 0, solutionShown: false,
        timeMs: 5000, themes: [], puzzleRating: 150, ratingBefore: 1, ratingAfter: 2, createdAt,
      };
      const [row] = await db.asUser(uid, (tx) =>
        upsert<PuzzleAttemptRow>(tx, 'puzzle_attempts', [toRow.puzzleAttempt(a, uid, 80)], { onConflict: 'id', ignoreDuplicates: true, returning: '*' }),
      );
      rating = ratePuzzleAttempt(rating, a, 80, createdAt);
      expect(row!.rating_after).toBeGreaterThanOrEqual(MIN_PUZZLE_RATING);
      expect(close(row!.rating_after, rating.rating)).toBe(true);
    }
    await expectRating(uid, 'puzzle', rating);
  });
});

/** A bot (or PGN) game as the client creates it. */
function newGame(rng: Rng, at: string, source: Game['source']): Game {
  const userColor = rng.pick(['w', 'b'] as const);
  const headers: Record<string, string> = { White: userColor === 'w' ? 'Du' : 'Bot', Black: userColor === 'b' ? 'Du' : 'Bot' };
  if (rng.bool(0.85)) headers[userColor === 'w' ? 'BlackElo' : 'WhiteElo'] = String(rng.int(200, 2000));
  if (rng.bool(0.2)) headers[userColor === 'w' ? 'WhiteElo' : 'BlackElo'] = String(rng.int(200, 2000)); // the user's own tag
  return {
    id: randomUUID(),
    source,
    externalId: source === 'pgn' ? randomUUID() : null,
    botId: source === 'bot' ? 'bot-3' : null,
    userColor,
    assistance: source === 'bot' ? rng.pick(['competition', 'competition', 'competition', 'training', 'coach'] as const) : null,
    timeControl: { kind: 'none' },
    startFen: START_FEN,
    pgn: '',
    headers,
    status: 'active',
    result: '*',
    endReason: null,
    origin: { type: 'new' },
    activeDeviceId: 'device-a',
    activeHeartbeatAt: at,
    ratingBefore: null,
    ratingAfter: null,
    createdAt: at,
    updatedAt: at,
    finishedAt: null,
  };
}

describe('finished games: bot rating and daily activity (10 generated sequences)', () => {
  it('equal rateBotGame / addToDay; PGN imports and resent games count for nothing', async () => {
    let ratedGames = 0;
    for (let seq = 0; seq < 10; seq += 1) {
      const rng = seededRng(2000 + seq);
      let t = Date.parse('2026-10-24T19:00:00.000Z') + seq * 600_000;
      const { uid, goal, rating: start } = await newUser(rng, 'bot', new Date(t).toISOString());
      let rating = start;
      const days = new Map<string, DailyActivity>();
      for (let i = 0; i < 12; i += 1) {
        t += rng.int(5, 200) * 60_000;
        const source = rng.bool(0.15) ? 'pgn' : 'bot';
        const created = newGame(rng, new Date(t).toISOString(), source);
        t += rng.int(1, 60) * 60_000;
        const finishedAt = new Date(t).toISOString();
        const result = rng.pick(['1-0', '0-1', '1/2-1/2'] as const);
        const finished: Game = {
          ...created,
          status: 'finished',
          result,
          endReason: result === '1/2-1/2' ? 'stalemate' : 'checkmate',
          pgn: '1. e4 e5 *',
          finishedAt,
          updatedAt: finishedAt,
          ratingBefore: 9, // client values are ignored
          ratingAfter: 99,
        };
        const push = (g: Game) =>
          db.asUser(uid, (tx) => upsert<GameRow>(tx, 'games', [toRow.game(g, uid)], { onConflict: 'id', returning: '*' }));
        // Bot games: created active and finished later (or uploaded finished at once); imports arrive finished.
        if (source === 'bot' && rng.bool(0.7)) await push(created);
        const [row] = await push(finished);
        if (rng.bool(0.3)) await push(finished); // resent by the outbox

        if (source === 'bot') {
          const next = rateBotGame(rating, created, result, finishedAt);
          if (next) {
            expect(close(row!.rating_before, rating.rating)).toBe(true);
            expect(close(row!.rating_after, next.rating)).toBe(true);
            rating = next;
            ratedGames += 1;
          } else {
            expect([row!.rating_before, row!.rating_after]).toEqual([null, null]);
          }
          const key = dayKeyOf(finishedAt, TZ);
          days.set(key, addToDay(days.get(key), key, { games: 1 }, goal));
        } else {
          expect([row!.rating_before, row!.rating_after]).toEqual([null, null]);
        }
        const [stored] = await db.rows<GameRow>(`select * from public.games where id = $1`, [created.id]);
        expect({ ...stored, rating_before: null, rating_after: null }).toEqual({ ...toRow.game(finished, uid), rating_before: null, rating_after: null });
      }
      await expectRating(uid, 'bot', rating);
      await expectDays(uid, days);
    }
    expect(ratedGames).toBeGreaterThan(30);
  });
});

describe('lesson progress via the RPC (10 generated sequences)', () => {
  it('equals mergeLessonProgress / lessonStepsGained', async () => {
    for (let seq = 0; seq < 10; seq += 1) {
      const rng = seededRng(3000 + seq);
      let t = Date.parse('2026-10-24T20:00:00.000Z');
      const { uid, goal } = await newUser(rng, 'puzzle', new Date(t).toISOString());
      const progress = new Map<string, LessonProgress>();
      const days = new Map<string, DailyActivity>();
      for (let i = 0; i < 25; i += 1) {
        t += rng.int(1, 180) * 60_000;
        const lessonId = rng.pick(['s1-k1-l1', 's1-k1-l2', 's1-k1-test']);
        const completed = rng.bool(0.3);
        // Devices report older states too (offline device, stale tab): the step may go back.
        const incoming: LessonProgress = {
          lessonId,
          lessonVersion: rng.int(1, 2),
          currentStep: rng.int(0, 9),
          completed,
          stars: completed ? (rng.int(1, 3) as 1 | 2 | 3) : 0,
          mistakes: rng.int(0, 5),
          hintsUsed: rng.int(0, 3),
          ...(rng.bool(0.3) ? { score: rng.int(0, 100) / 100 } : {}),
          updatedAt: new Date(t - (rng.bool(0.2) ? rng.int(1, 600) * 60_000 : 0)).toISOString(),
          completedAt: completed ? new Date(t).toISOString() : null,
        };
        const [row] = await db.asUser(uid, (tx) => rpc<LessonProgressRow>(tx, 'upsert_lesson_progress', lessonProgressArgs(incoming)));
        const prev = progress.get(lessonId);
        const merged = mergeLessonProgress(prev, incoming);
        const steps = lessonStepsGained(prev, merged);
        progress.set(lessonId, merged);
        expect(row, `${seq}/${i}`).toEqual(toRow.lessonProgress(merged, uid));
        if (steps > 0) {
          const key = dayKeyOf(incoming.updatedAt, TZ);
          days.set(key, addToDay(days.get(key), key, { lessons: steps }, goal));
        }
      }
      const rows = await db.rows<LessonProgressRow>(`select * from public.lesson_progress where user_id = $1 order by lesson_id`, [uid]);
      expect(rows).toEqual([...progress.values()].sort((a, b) => a.lessonId.localeCompare(b.lessonId)).map((p) => toRow.lessonProgress(p, uid)));
      await expectDays(uid, days);
    }
  });
});

describe('profile and game upserts (10 generated sequences each)', () => {
  it('profiles merge like mergeProfile (fields by updated_at, settings by settings.updatedAt)', async () => {
    for (let seq = 0; seq < 10; seq += 1) {
      const rng = seededRng(4000 + seq);
      const uid = await db.createUser();
      const base = Date.parse('2026-10-18T08:00:00.000Z');
      const iso = () => new Date(base + rng.int(0, 40) * 60_000).toISOString(); // many ties on purpose
      let expected: Profile | null = null;
      for (let i = 0; i < 15; i += 1) {
        const incoming: Profile = {
          id: uid,
          displayName: `Name ${i}`,
          settings: { ...DEFAULT_SETTINGS, sound: rng.bool(), boardTheme: rng.pick(['moos', 'holz'] as const), updatedAt: iso() },
          dailyGoalMinutes: rng.pick([5, 10, 20, 30]),
          selfAssessment: rng.pick(['newcomer', 'beginner', 'club', null] as const),
          onboardingCompleted: rng.bool(),
          stageZeroSkipped: rng.bool(),
          timeZone: rng.pick(['Europe/Berlin', 'America/New_York', 'Asia/Tokyo'] as const),
          createdAt: iso(),
          updatedAt: iso(),
        };
        await db.asUser(uid, (tx) => upsert(tx, 'profiles', [toRow.profile(incoming)], { onConflict: 'id' }));
        expected = mergeProfile(expected, incoming);
        const [row] = await db.rows<ProfileRow>(`select * from public.profiles where id = $1`, [uid]);
        expect(fromRow.profile(row!), `${seq}/${i}`).toEqual(expected);
      }
    }
  });

  it('games merge like mergeGame (finished never active again, device fields by heartbeat)', async () => {
    for (let seq = 0; seq < 10; seq += 1) {
      const rng = seededRng(5000 + seq);
      const uid = await db.createUser();
      const base = Date.parse('2026-10-18T08:00:00.000Z');
      const iso = () => new Date(base + rng.int(0, 30) * 60_000).toISOString();
      const first = { ...newGame(rng, iso(), 'bot'), assistance: 'training' as const };
      let expected: Game | null = null;
      for (let i = 0; i < 10; i += 1) {
        const status = rng.pick(['active', 'active', 'finished', 'aborted'] as const);
        const incoming: Game = {
          ...first,
          status,
          result: status === 'finished' ? rng.pick(['1-0', '0-1'] as const) : '*',
          pgn: `version ${i}`,
          activeDeviceId: rng.pick(['device-a', 'device-b', null]),
          activeHeartbeatAt: rng.bool(0.8) ? iso() : null,
          createdAt: iso(),
          updatedAt: iso(),
          finishedAt: status === 'finished' ? iso() : null,
        };
        await db.asUser(uid, (tx) => upsert(tx, 'games', [toRow.game(incoming, uid)], { onConflict: 'id' }));
        expected = mergeGame(expected, incoming);
        const [row] = await db.rows<GameRow>(`select * from public.games where id = $1`, [first.id]);
        // Training games are never rated: the server's rating fields stay empty.
        expect(fromRow.game(row!), `${seq}/${i}`).toEqual({ ...expected, ratingBefore: null, ratingAfter: null });
      }
    }
  });
});
