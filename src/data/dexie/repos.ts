/**
 * Dexie repositories (`@/core/storage` interfaces). Reads are plain Dexie queries, `observe…` are `liveQuery`s (the UI
 * updates without reload, also across tabs). Writes that sync add an outbox entry in the same transaction.
 */
import Dexie from 'dexie';
import type { Game } from '@/core/games';
import type { Settings } from '@/core/profile';
import type { Puzzle, PuzzleQuery } from '@/core/puzzles';
import type { GameListQuery, Repositories } from '@/core/storage';
import { META } from '../db';
import { outbox } from '../outbox';
import { currentProfile, defaultProfile, enqueue, live, putProfile, type DataContext } from './context';

/** A heartbeat younger than this keeps another device active (only `takeOver` may then switch devices). */
export const ACTIVE_HEARTBEAT_MS = 30_000;

const PUZZLE_CHUNK = 1000;

function matchesPuzzle(p: Puzzle, q: Omit<PuzzleQuery, 'limit'>, exclude: Set<string>): boolean {
  if (q.ratingMin !== undefined && p.rating < q.ratingMin) return false;
  if (q.ratingMax !== undefined && p.rating > q.ratingMax) return false;
  if (q.themes?.length && !q.themes.some((t) => p.themes.includes(t))) return false;
  if (q.openingTag && !p.openingTags.includes(q.openingTag)) return false;
  return !exclude.has(p.id);
}

function filterGames(list: Game[], q: GameListQuery = {}): Game[] {
  const out = list.filter((g) => (q.status ? g.status === q.status : true) && (q.source ? g.source === q.source : true));
  return q.limit !== undefined ? out.slice(0, q.limit) : out;
}

/** Builds the repositories on a Dexie database. */
export function createRepositories(ctx: DataContext, random: () => number = Math.random): Repositories {
  const { db } = ctx;

  const puzzlesInRange = (q: Omit<PuzzleQuery, 'limit'>) =>
    db.puzzles
      .where('[rating+id]')
      .between([q.ratingMin ?? -Infinity, Dexie.minKey], [q.ratingMax ?? Infinity, Dexie.maxKey], true, true);

  const gamesNewestFirst = () => db.games.orderBy('updatedAt').reverse().toArray();

  return {
    profile: {
      get: () => currentProfile(db),
      observe: () => live(() => currentProfile(db)),
      save: (p) =>
        db.transaction('rw', db.profile, db.outbox, async () => {
          await putProfile(db, p);
          await enqueue(ctx, outbox.profile(p, ctx.nowIso()));
        }).then(ctx.enqueued),
      updateSettings: async (patch) => {
        const settings = await db.transaction('rw', db.profile, db.outbox, async () => {
          const ts = ctx.nowIso();
          const current = (await currentProfile(db)) ?? defaultProfile(ctx.userId(), ts);
          const next: Settings = { ...current.settings, ...patch, updatedAt: ts };
          const profile = { ...current, settings: next, updatedAt: ts };
          await putProfile(db, profile);
          await enqueue(ctx, outbox.profile(profile, ts));
          return next;
        });
        ctx.enqueued();
        return settings;
      },
    },

    ratings: {
      get: async (kind) => (await db.ratings.get(kind)) ?? null,
      observe: (kind) => live(async () => (await db.ratings.get(kind)) ?? null),
      history: async (kind) => {
        if (kind === 'bot') {
          const games = await db.games.toArray();
          return games
            .filter((g) => g.ratingAfter !== null && g.finishedAt)
            .sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!))
            .map((g) => ({ at: g.finishedAt!, rating: g.ratingAfter! }));
        }
        const mode = kind === 'puzzle' ? 'rated' : kind;
        const attempts = await db.puzzleAttempts.where('mode').equals(mode).toArray();
        return attempts
          .filter((a) => a.ratingAfter !== undefined && a.ratingAfter !== null)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((a) => ({ at: a.createdAt, rating: a.ratingAfter! }));
      },
    },

    puzzles: {
      get: async (id) => (await db.puzzles.get(id)) ?? null,
      query: async (q) => {
        const exclude = new Set(q.excludeIds ?? []);
        const range = puzzlesInRange(q).filter((p) => matchesPuzzle(p, q, exclude));
        if (!q.shuffle) return range.limit(q.limit).toArray();
        const all = await range.toArray();
        return all
          .map((p) => ({ p, r: random() }))
          .sort((a, b) => a.r - b.r)
          .slice(0, q.limit)
          .map((x) => x.p);
      },
      count: async (q = {}) => {
        const exclude = new Set(q.excludeIds ?? []);
        if (q.ratingMin === undefined && q.ratingMax === undefined && !q.themes?.length && !q.openingTag && exclude.size === 0) {
          return db.puzzles.count();
        }
        return puzzlesInRange(q)
          .filter((p) => matchesPuzzle(p, q, exclude))
          .count();
      },
      bulkUpsert: async (puzzles) => {
        for (let i = 0; i < puzzles.length; i += PUZZLE_CHUNK) {
          await db.puzzles.bulkPut(puzzles.slice(i, i + PUZZLE_CHUNK));
        }
      },
      bankVersion: async () => (await db.getMeta<string>(META.bankVersion)) ?? null,
      setBankVersion: (v) => db.setMeta(META.bankVersion, v),
    },

    puzzleAttempts: {
      list: async (q = {}) => {
        let c = db.puzzleAttempts.orderBy('createdAt').reverse();
        if (q.mode || q.since) c = c.filter((a) => (q.mode ? a.mode === q.mode : true) && (q.since ? a.createdAt >= q.since : true));
        return q.limit !== undefined ? c.limit(q.limit).toArray() : c.toArray();
      },
      ratedPuzzleIds: async () => {
        const rated = await db.puzzleAttempts.where('mode').equals('rated').toArray();
        return new Set(rated.map((a) => a.puzzleId));
      },
      observeRecent: (limit) => live(() => db.puzzleAttempts.orderBy('createdAt').reverse().limit(limit).toArray()),
    },

    games: {
      get: async (id) => (await db.games.get(id)) ?? null,
      observe: (id) => live(async () => (await db.games.get(id)) ?? null),
      list: async (q) => filterGames(await gamesNewestFirst(), q),
      observeList: (q) => live(async () => filterGames(await gamesNewestFirst(), q)),
      findByExternalId: async (source, externalId) =>
        (await db.games.where('[source+externalId]').equals([source, externalId]).first()) ?? null,
      heartbeat: async (id, deviceId) => {
        const changed = await db.transaction('rw', db.games, db.outbox, async () => {
          const g = await db.games.get(id);
          if (!g) return false;
          const now = ctx.now();
          const otherActive =
            g.activeDeviceId !== null &&
            g.activeDeviceId !== deviceId &&
            g.activeHeartbeatAt !== null &&
            now.getTime() - Date.parse(g.activeHeartbeatAt) < ACTIVE_HEARTBEAT_MS;
          if (otherActive) return false; // only an explicit takeover switches devices
          const next: Game = { ...g, activeDeviceId: deviceId, activeHeartbeatAt: now.toISOString() };
          await db.games.put(next);
          await enqueue(ctx, outbox.game(next, ctx.userId(), next.activeHeartbeatAt!));
          return true;
        });
        if (changed) ctx.enqueued();
      },
      takeOver: async (id, deviceId) => {
        const changed = await db.transaction('rw', db.games, db.outbox, async () => {
          const g = await db.games.get(id);
          if (!g) return false;
          const ts = ctx.nowIso();
          const next: Game = { ...g, activeDeviceId: deviceId, activeHeartbeatAt: ts, updatedAt: ts };
          await db.games.put(next);
          await enqueue(ctx, outbox.game(next, ctx.userId(), ts));
          return true;
        });
        if (changed) ctx.enqueued();
      },
    },

    gameMoves: {
      list: (gameId) => db.gameMoves.where('[gameId+seq]').between([gameId, Dexie.minKey], [gameId, Dexie.maxKey]).toArray(),
      observe: (gameId) =>
        live(() => db.gameMoves.where('[gameId+seq]').between([gameId, Dexie.minKey], [gameId, Dexie.maxKey]).toArray()),
    },

    gameAnalyses: {
      get: async (gameId) => (await db.gameAnalyses.get(gameId)) ?? null,
      save: async (a) => {
        await db.transaction('rw', db.gameAnalyses, db.outbox, async () => {
          await db.gameAnalyses.put(a);
          await enqueue(ctx, outbox.gameAnalysis(a, ctx.userId(), ctx.nowIso()));
        });
        ctx.enqueued();
      },
      list: () => db.gameAnalyses.toArray(),
    },

    lessonProgress: {
      get: async (lessonId) => (await db.lessonProgress.get(lessonId)) ?? null,
      list: () => db.lessonProgress.toArray(),
      observeAll: () => live(() => db.lessonProgress.toArray()),
    },

    dailyActivity: {
      get: async (date) => (await db.dailyActivity.get(date)) ?? null,
      range: (from, to) => db.dailyActivity.where('date').between(from, to, true, true).toArray(),
      observe: (date) => live(async () => (await db.dailyActivity.get(date)) ?? null),
    },

    themeStats: {
      list: () => db.themeStats.toArray(),
      observe: () => live(() => db.themeStats.toArray()),
    },

    reviewQueue: {
      due: (at) => db.reviewQueue.where('dueAt').belowOrEqual(at).sortBy('dueAt'),
      upsert: async (i) => {
        await db.transaction('rw', db.reviewQueue, db.outbox, async () => {
          await db.reviewQueue.put(i);
          await enqueue(ctx, outbox.reviewQueueItem(i, ctx.userId(), ctx.nowIso()));
        });
        ctx.enqueued();
      },
    },

    explanationFeedback: {
      add: async (f) => {
        const added = await db.transaction('rw', db.explanationFeedback, db.outbox, async () => {
          if (await db.explanationFeedback.get(f.id)) return false;
          await db.explanationFeedback.add(f);
          await enqueue(ctx, outbox.explanationFeedback(f, ctx.userId(), ctx.nowIso()));
          return true;
        });
        if (added) ctx.enqueued();
      },
      get: async (context, ref) => {
        const list = await db.explanationFeedback.where('[context+ref]').equals([context, ref]).toArray();
        return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
      },
    },
  };
}
