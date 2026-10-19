/**
 * Dexie ProgressService: every write is one short Dexie transaction (local tables + outbox entry). The rules live in
 * `../progress` (shared with the fake backend). In cloud mode client-computed ratings are marked `provisional` until
 * the server values arrive.
 */
import type { Game, GameMoveEvent } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import type { Profile, ThemeStat } from '@/core/profile';
import { SELF_ASSESSMENT_OPTIONS } from '@/core/profile';
import type { PuzzleAttempt } from '@/core/puzzles';
import type { RatingKind, RatingRecord } from '@/core/rating';
import { RATING_DEFAULTS } from '@/core/rating';
import type { OutboxEntry, PendingRatedPuzzle, ProgressService } from '@/core/storage';
import { newId } from '@/lib/ids';
import { localDateKey } from '@/lib/time';
import { META } from '../db';
import { outbox } from '../outbox';
import {
  addToDay,
  applyThemeStats,
  defaultRating,
  isRatedAttempt,
  lessonStepsGained,
  mergeLessonProgress,
  mergeProfile,
  rateBotGame,
  ratePuzzleAttempt,
  type DailyDelta,
} from '../progress';
import { currentProfile, defaultProfile, enqueue, putProfile, withTimeZone, type DataContext } from './context';

/** Internal write helpers shared with the ActivityTracker. */
export interface ProgressInternals {
  /** Adds active minutes to a day (local + outbox). */
  addActiveMinutes(minutes: number, date?: Date): Promise<void>;
}

/** Creates the ProgressService. */
export function createProgressService(ctx: DataContext): ProgressService & ProgressInternals {
  const { db } = ctx;

  async function goalMinutes(): Promise<number> {
    return (await currentProfile(db))?.dailyGoalMinutes ?? 20;
  }

  /** Adds to today's (or `date`'s) activity inside the running transaction. Returns the day key. */
  async function bumpDaily(delta: DailyDelta, date: Date = ctx.now()): Promise<string> {
    const key = localDateKey(date, ctx.timeZone);
    const day = addToDay(await db.dailyActivity.get(key), key, delta, await goalMinutes());
    await db.dailyActivity.put(day);
    return key;
  }

  async function ratingOrDefault(kind: RatingKind, at: string): Promise<RatingRecord> {
    return (await db.ratings.get(kind)) ?? defaultRating(kind, at);
  }

  return {
    async initializeFromSelfAssessment(choice) {
      const option = SELF_ASSESSMENT_OPTIONS.find((o) => o.id === choice);
      if (!option) throw new Error(`Unknown self-assessment: ${choice}`);
      await db.transaction('rw', [db.ratings, db.profile, db.outbox], async () => {
        const ts = ctx.nowIso();
        const entries: OutboxEntry[] = [];
        for (const [kind, rating] of [
          ['puzzle', option.puzzleRating],
          ['bot', option.botRating],
        ] as const) {
          const r: RatingRecord = {
            kind,
            rating,
            rd: RATING_DEFAULTS.rd,
            volatility: RATING_DEFAULTS.volatility,
            gamesCount: 0,
            updatedAt: ts,
            provisional: false,
          };
          await db.ratings.put(r);
          entries.push(outbox.rating(r, ctx.userId(), ts));
        }
        const current = (await currentProfile(db)) ?? defaultProfile(ctx.userId(), ts);
        const profile: Profile = withTimeZone(ctx, { ...current, selfAssessment: choice, updatedAt: ts });
        await putProfile(db, profile);
        entries.push(outbox.profile(profile, ts));
        await enqueue(ctx, ...entries);
      });
      ctx.enqueued();
    },

    async recordPuzzleAttempt(input) {
      const { puzzleRd, ...rest } = input;
      const attempt: PuzzleAttempt = { ...rest, id: newId(), createdAt: ctx.nowIso() };
      if (attempt.mode === 'demo') return { attempt, rating: null }; // demo attempts are not stored
      const rating = await db.transaction('rw', [db.puzzleAttempts, db.ratings, db.themeStats, db.dailyActivity, db.profile, db.outbox, db.meta], async () => {
        // Strictly increasing timestamps keep the attempt order (rating history, server replay) unambiguous.
        const last = await db.puzzleAttempts.orderBy('createdAt').last();
        if (last && last.createdAt >= attempt.createdAt) attempt.createdAt = new Date(Date.parse(last.createdAt) + 1).toISOString();
        let next: RatingRecord | null = null;
        if (isRatedAttempt(attempt.mode)) {
          const before = await ratingOrDefault('puzzle', attempt.createdAt);
          next = ratePuzzleAttempt(before, attempt, puzzleRd, attempt.createdAt, ctx.provisional);
          await db.ratings.put(next);
          attempt.ratingBefore = before.rating;
          attempt.ratingAfter = next.rating;
        }
        if (attempt.themes.length) {
          const current = new Map<string, ThemeStat>();
          for (const s of await db.themeStats.bulkGet(attempt.themes)) if (s) current.set(s.theme, s);
          const updated = applyThemeStats(current, attempt);
          if (updated.length) await db.themeStats.bulkPut(updated);
        }
        await db.puzzleAttempts.add(attempt);
        if (attempt.mode === 'rated') {
          const pending = await db.getMeta<PendingRatedPuzzle>(META.pendingRated);
          if (pending?.puzzleId === attempt.puzzleId) await db.meta.delete(META.pendingRated);
        }
        await bumpDaily({ puzzles: 1 });
        await enqueue(ctx, outbox.puzzleAttempt(attempt, ctx.userId(), puzzleRd || RATING_DEFAULTS.puzzleRd, attempt.createdAt));
        return next;
      });
      ctx.enqueued();
      return { attempt: { ...attempt }, rating };
    },

    async markRatedPuzzleShown(puzzleId) {
      await db.transaction('rw', [db.puzzleAttempts, db.meta], async () => {
        const pending = await db.getMeta<PendingRatedPuzzle>(META.pendingRated);
        if (pending?.puzzleId === puzzleId) return;
        const done = await db.puzzleAttempts.where('mode').equals('rated').filter((a) => a.puzzleId === puzzleId).count();
        if (done > 0) return;
        await db.setMeta(META.pendingRated, { puzzleId, startedAt: ctx.nowIso() } satisfies PendingRatedPuzzle);
      });
    },

    async pendingRatedPuzzle() {
      return (await db.getMeta<PendingRatedPuzzle>(META.pendingRated)) ?? null;
    },

    async clearPendingRatedPuzzle() {
      await db.meta.delete(META.pendingRated);
    },

    async recordLessonProgress(p) {
      const merged = await db.transaction('rw', [db.lessonProgress, db.dailyActivity, db.profile, db.outbox], async () => {
        const ts = ctx.nowIso();
        const prev = await db.lessonProgress.get(p.lessonId);
        // Stamped with the data layer's clock like the stored record, so "newer" is judged on one clock.
        const next: LessonProgress = mergeLessonProgress(prev, { ...p, updatedAt: ts }, ts);
        await db.lessonProgress.put(next);
        const steps = lessonStepsGained(prev, next);
        if (steps > 0) await bumpDaily({ lessons: steps });
        await enqueue(ctx, outbox.lessonProgress(next, ts));
        return next;
      });
      ctx.enqueued();
      return merged;
    },

    async createGame(g) {
      const game = await db.transaction('rw', db.games, db.outbox, async () => {
        const ts = ctx.nowIso();
        const created: Game = { ...structuredClone(g), id: newId(), createdAt: ts, updatedAt: ts };
        await db.games.add(created);
        await enqueue(ctx, outbox.game(created, ctx.userId(), ts));
        return created;
      });
      ctx.enqueued();
      return game;
    },

    async appendGameEvent(e) {
      const event = await db.transaction('rw', [db.gameMoves, db.games, db.outbox], async () => {
        const duplicate = await db.gameMoves.where('[gameId+seq]').equals([e.gameId, e.seq]).first();
        if (duplicate) throw new Error(`Duplicate seq ${e.seq} for game ${e.gameId}`);
        const created: GameMoveEvent = { ...structuredClone(e), id: newId(), createdAt: ctx.nowIso() };
        await db.gameMoves.add(created);
        const g = await db.games.get(e.gameId);
        // Locally the game moves to the top of "newest first"; on the server a trigger on `game_moves` bumps
        // `games.updated_at`, so a move is one single insert (≤ 1 s to the database, P0-02). The game row itself was
        // queued by `createGame` before, so it still reaches the server first (`game_moves.game_id` references it).
        if (g) await db.games.put({ ...g, updatedAt: created.createdAt });
        await enqueue(ctx, outbox.gameMove(created, ctx.userId(), created.createdAt));
        return created;
      });
      ctx.enqueued();
      return event;
    },

    async finishGame(id, result, reason, pgn) {
      const out = await db.transaction('rw', [db.games, db.ratings, db.dailyActivity, db.profile, db.outbox], async () => {
        const g = await db.games.get(id);
        if (!g) throw new Error(`Unknown game ${id}`);
        const ts = ctx.nowIso();
        const next: Game = { ...g, status: 'finished', result, endReason: reason, pgn, finishedAt: ts, updatedAt: ts };
        let rating: RatingRecord | null = null;
        if (g.status === 'active') {
          const before = await ratingOrDefault('bot', ts);
          rating = rateBotGame(before, g, result, ts, ctx.provisional);
          if (rating) {
            next.ratingBefore = before.rating;
            next.ratingAfter = rating.rating;
            await db.ratings.put(rating);
          }
          await bumpDaily({ games: 1 });
        }
        await db.games.put(next);
        await enqueue(ctx, outbox.game(next, ctx.userId(), ts));
        return { game: next, rating };
      });
      ctx.enqueued();
      return out;
    },

    async saveAnalysis(a) {
      await db.transaction('rw', db.gameAnalyses, db.outbox, async () => {
        await db.gameAnalyses.put(a);
        await enqueue(ctx, outbox.gameAnalysis(a, ctx.userId(), ctx.nowIso()));
      });
      ctx.enqueued();
    },

    async recordExplanationFeedback(f) {
      await db.transaction('rw', db.explanationFeedback, db.outbox, async () => {
        const fb = { ...f, id: newId(), createdAt: ctx.nowIso() };
        await db.explanationFeedback.add(fb);
        await enqueue(ctx, outbox.explanationFeedback(fb, ctx.userId(), fb.createdAt));
      });
      ctx.enqueued();
    },

    async saveProfile(patch) {
      const saved = await db.transaction('rw', db.profile, db.outbox, async () => {
        const ts = ctx.nowIso();
        const current = (await currentProfile(db)) ?? defaultProfile(ctx.userId(), ts);
        // Settings: last writer wins – a stale settings object in the patch does not overwrite newer ones.
        const settings = patch.settings ? mergeProfile(current, { ...current, settings: patch.settings }).settings : current.settings;
        const next: Profile = withTimeZone(ctx, { ...current, ...patch, settings, id: current.id, updatedAt: ts });
        await putProfile(db, next);
        await enqueue(ctx, outbox.profile(next, ts));
        return next;
      });
      ctx.enqueued();
      return saved;
    },

    async addActiveMinutes(minutes, date) {
      if (minutes <= 0) return;
      await db.transaction('rw', [db.dailyActivity, db.profile, db.outbox], async () => {
        const key = await bumpDaily({ minutes }, date);
        const day = await db.dailyActivity.get(key);
        await enqueue(ctx, outbox.dailyMinutes(key, day?.minutes ?? minutes, ctx.nowIso()));
      });
      ctx.enqueued();
    },
  };
}
