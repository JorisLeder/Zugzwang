/**
 * `createMemoryDataServices()` – fully functional in-memory implementation of `DataServices` (BACKLOG 2.6):
 * repositories with live `observe…`, a ProgressService implementing the rating/stat rules with `@/lib/rating`,
 * local auth and no-op sync. Used by tests of every package and by the WP-00 `createDataServices` placeholder.
 */
import { newId } from '@/lib/ids';
import { createValueStore } from '@/lib/observable';
import { updateGlicko2 } from '@/lib/rating';
import { localDateKey } from '@/lib/time';
import type { GameAnalysis } from '../analysis';
import type { GameResult } from '../chess';
import type { ExplanationFeedback } from '../explain';
import type { Game, GameMoveEvent } from '../games';
import type { LessonProgress } from '../lessons';
import type { DailyActivity, Profile, ReviewQueueItem, Settings, ThemeStat } from '../profile';
import { DEFAULT_DAILY_GOAL_MINUTES, DEFAULT_SETTINGS, SELF_ASSESSMENT_OPTIONS } from '../profile';
import type { Puzzle, PuzzleAttempt, PuzzleQuery } from '../puzzles';
import type { RatingKind, RatingRecord } from '../rating';
import { RATING_DEFAULTS } from '../rating';
import type {
  DataServices,
  GameListQuery,
  ProgressService,
  Repositories,
  Subscribable,
  SyncState,
} from '../storage';

/** Options of `createMemoryDataServices`. */
export interface MemoryDataOptions {
  userId?: string;
  deviceId?: string;
  /** Time zone for daily activity (default `Europe/Berlin`). */
  timeZone?: string;
  /** Clock (default `() => new Date()`). */
  now?: () => Date;
  /** Initial profile (merged onto defaults). Without it the profile is `null` until first written. */
  profile?: Partial<Profile>;
  /** Initial puzzle bank. */
  puzzles?: Puzzle[];
  /** Seed for `shuffle` in puzzle queries (default: Math.random). */
  random?: () => number;
}

/** In-memory data services plus test helpers. */
export interface MemoryDataServices extends DataServices {
  testing: {
    /** Adds active minutes to a day (what the ActivityTracker does in the real data layer). */
    addActiveMinutes(minutes: number, date?: Date): void;
    /** Number of times any data changed (observers fire on each change). */
    changeCount(): number;
  };
}

interface Db {
  profile: Profile | null;
  ratings: Map<RatingKind, RatingRecord>;
  puzzles: Map<string, Puzzle>;
  bankVersion: string | null;
  attempts: PuzzleAttempt[];
  games: Map<string, Game>;
  gameMoves: Map<string, GameMoveEvent[]>;
  analyses: Map<string, GameAnalysis>;
  lessonProgress: Map<string, LessonProgress>;
  daily: Map<string, DailyActivity>;
  themeStats: Map<string, ThemeStat>;
  reviewQueue: Map<string, ReviewQueueItem>;
  feedback: ExplanationFeedback[];
}

function emptyDb(): Db {
  return {
    profile: null,
    ratings: new Map(),
    puzzles: new Map(),
    bankVersion: null,
    attempts: [],
    games: new Map(),
    gameMoves: new Map(),
    analyses: new Map(),
    lessonProgress: new Map(),
    daily: new Map(),
    themeStats: new Map(),
    reviewQueue: new Map(),
    feedback: [],
  };
}

const clone = <T>(v: T): T => structuredClone(v);

/** Creates the in-memory data services. */
export function createMemoryDataServices(opts: MemoryDataOptions = {}): MemoryDataServices {
  const userId = opts.userId ?? 'local-user';
  const deviceId = opts.deviceId ?? newId();
  const timeZone = opts.timeZone ?? 'Europe/Berlin';
  const now = opts.now ?? (() => new Date());
  const random = opts.random ?? Math.random;
  const nowIso = () => now().toISOString();
  let db = emptyDb();
  const tick = createValueStore(0);
  const changed = () => tick.update((n) => n + 1);

  for (const p of opts.puzzles ?? []) db.puzzles.set(p.id, clone(p));

  function defaultProfile(): Profile {
    const ts = nowIso();
    return {
      id: userId,
      displayName: 'Du',
      settings: { ...DEFAULT_SETTINGS },
      dailyGoalMinutes: DEFAULT_DAILY_GOAL_MINUTES,
      selfAssessment: null,
      onboardingCompleted: false,
      stageZeroSkipped: false,
      createdAt: ts,
      updatedAt: ts,
      ...(opts.profile ?? {}),
    };
  }
  if (opts.profile) db.profile = defaultProfile();

  /** Live query: recomputes on every change. */
  function live<T>(compute: () => T): Subscribable<T> {
    return {
      subscribe(cb) {
        return tick.subscribe(() => cb(clone(compute())));
      },
    };
  }

  function bumpDaily(patch: Partial<Record<'minutes' | 'puzzles' | 'games' | 'lessons', number>>, date = now()): void {
    const key = localDateKey(date, timeZone);
    const d = db.daily.get(key) ?? { date: key, minutes: 0, puzzles: 0, games: 0, lessons: 0, goalReached: false };
    d.minutes += patch.minutes ?? 0;
    d.puzzles += patch.puzzles ?? 0;
    d.games += patch.games ?? 0;
    d.lessons += patch.lessons ?? 0;
    d.goalReached = d.minutes >= (db.profile?.dailyGoalMinutes ?? DEFAULT_DAILY_GOAL_MINUTES);
    db.daily.set(key, d);
  }

  function ratingOrDefault(kind: RatingKind): RatingRecord {
    return (
      db.ratings.get(kind) ?? {
        kind,
        rating: RATING_DEFAULTS.rating,
        rd: RATING_DEFAULTS.rd,
        volatility: RATING_DEFAULTS.volatility,
        gamesCount: 0,
        updatedAt: nowIso(),
        provisional: false,
      }
    );
  }

  function matchesQuery(p: Puzzle, q: Omit<PuzzleQuery, 'limit'>, exclude: Set<string>): boolean {
    if (q.ratingMin !== undefined && p.rating < q.ratingMin) return false;
    if (q.ratingMax !== undefined && p.rating > q.ratingMax) return false;
    if (q.themes?.length && !q.themes.some((t) => p.themes.includes(t))) return false;
    if (q.openingTag && !p.openingTags.includes(q.openingTag)) return false;
    return !exclude.has(p.id);
  }

  function listGames(q: GameListQuery = {}): Game[] {
    const list = [...db.games.values()]
      .filter((g) => (q.status ? g.status === q.status : true) && (q.source ? g.source === q.source : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return q.limit !== undefined ? list.slice(0, q.limit) : list;
  }

  function saveProfileInternal(patch: Partial<Profile>): Profile {
    const current = db.profile ?? defaultProfile();
    let settings: Settings = current.settings;
    if (patch.settings && patch.settings.updatedAt >= current.settings.updatedAt) settings = { ...patch.settings };
    const next: Profile = { ...current, ...patch, settings, id: current.id, updatedAt: nowIso() };
    db.profile = next;
    return next;
  }

  const repos: Repositories = {
    profile: {
      get: async () => (db.profile ? clone(db.profile) : null),
      observe: () => live(() => db.profile),
      save: async (p) => {
        db.profile = clone(p);
        changed();
      },
      updateSettings: async (patch) => {
        const current = db.profile ?? defaultProfile();
        const settings: Settings = { ...current.settings, ...patch, updatedAt: nowIso() };
        db.profile = { ...current, settings, updatedAt: settings.updatedAt };
        changed();
        return clone(settings);
      },
    },
    ratings: {
      get: async (kind) => clone(db.ratings.get(kind) ?? null),
      observe: (kind) => live(() => db.ratings.get(kind) ?? null),
      history: async (kind) => {
        if (kind === 'bot') {
          return [...db.games.values()]
            .filter((g) => g.ratingAfter !== null && g.finishedAt)
            .sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!))
            .map((g) => ({ at: g.finishedAt!, rating: g.ratingAfter! }));
        }
        const mode = kind === 'puzzle' ? 'rated' : kind;
        return db.attempts
          .filter((a) => a.mode === mode && a.ratingAfter !== undefined)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((a) => ({ at: a.createdAt, rating: a.ratingAfter! }));
      },
    },
    puzzles: {
      get: async (id) => clone(db.puzzles.get(id) ?? null),
      query: async (q) => {
        const exclude = new Set(q.excludeIds ?? []);
        let list = [...db.puzzles.values()].filter((p) => matchesQuery(p, q, exclude));
        if (q.shuffle) {
          list = list.map((p) => ({ p, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.p);
        } else {
          list.sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
        }
        return clone(list.slice(0, q.limit));
      },
      count: async (q = {}) => {
        const exclude = new Set(q.excludeIds ?? []);
        return [...db.puzzles.values()].filter((p) => matchesQuery(p, q, exclude)).length;
      },
      bulkUpsert: async (puzzles) => {
        for (const p of puzzles) db.puzzles.set(p.id, clone(p));
        changed();
      },
      bankVersion: async () => db.bankVersion,
      setBankVersion: async (v) => {
        db.bankVersion = v;
        changed();
      },
    },
    puzzleAttempts: {
      list: async (q = {}) => {
        const list = db.attempts
          .filter((a) => (q.mode ? a.mode === q.mode : true) && (q.since ? a.createdAt >= q.since : true))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return clone(q.limit !== undefined ? list.slice(0, q.limit) : list);
      },
      ratedPuzzleIds: async () => new Set(db.attempts.filter((a) => a.mode === 'rated').map((a) => a.puzzleId)),
      observeRecent: (limit) =>
        live(() => [...db.attempts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)),
    },
    games: {
      get: async (id) => clone(db.games.get(id) ?? null),
      observe: (id) => live(() => db.games.get(id) ?? null),
      list: async (q) => clone(listGames(q)),
      observeList: (q) => live(() => listGames(q)),
      findByExternalId: async (source, externalId) =>
        clone([...db.games.values()].find((g) => g.source === source && g.externalId === externalId) ?? null),
      heartbeat: async (id, device) => {
        const g = db.games.get(id);
        if (!g) return;
        db.games.set(id, { ...g, activeDeviceId: device, activeHeartbeatAt: nowIso() });
        changed();
      },
      takeOver: async (id, device) => {
        const g = db.games.get(id);
        if (!g) return;
        db.games.set(id, { ...g, activeDeviceId: device, activeHeartbeatAt: nowIso(), updatedAt: nowIso() });
        changed();
      },
    },
    gameMoves: {
      list: async (gameId) => clone([...(db.gameMoves.get(gameId) ?? [])].sort((a, b) => a.seq - b.seq)),
      observe: (gameId) => live(() => [...(db.gameMoves.get(gameId) ?? [])].sort((a, b) => a.seq - b.seq)),
    },
    gameAnalyses: {
      get: async (gameId) => clone(db.analyses.get(gameId) ?? null),
      save: async (a) => {
        db.analyses.set(a.gameId, clone(a));
        changed();
      },
      list: async () => clone([...db.analyses.values()]),
    },
    lessonProgress: {
      get: async (lessonId) => clone(db.lessonProgress.get(lessonId) ?? null),
      list: async () => clone([...db.lessonProgress.values()]),
      observeAll: () => live(() => [...db.lessonProgress.values()]),
    },
    dailyActivity: {
      get: async (date) => clone(db.daily.get(date) ?? null),
      range: async (from, to) =>
        clone([...db.daily.values()].filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date))),
      observe: (date) => live(() => db.daily.get(date) ?? null),
    },
    themeStats: {
      list: async () => clone([...db.themeStats.values()]),
      observe: () => live(() => [...db.themeStats.values()]),
    },
    reviewQueue: {
      due: async (at) => clone([...db.reviewQueue.values()].filter((i) => i.dueAt <= at).sort((a, b) => a.dueAt.localeCompare(b.dueAt))),
      upsert: async (i) => {
        db.reviewQueue.set(i.id, clone(i));
        changed();
      },
    },
    explanationFeedback: {
      add: async (f) => {
        if (!db.feedback.some((x) => x.id === f.id)) db.feedback.push(clone(f));
        changed();
      },
      get: async (context, ref) =>
        clone(
          [...db.feedback]
            .filter((f) => f.context === context && f.ref === ref)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
        ),
    },
  };

  const progress: ProgressService = {
    async initializeFromSelfAssessment(choice) {
      const option = SELF_ASSESSMENT_OPTIONS.find((o) => o.id === choice);
      if (!option) throw new Error(`Unknown self-assessment: ${choice}`);
      const ts = nowIso();
      for (const [kind, rating] of [
        ['puzzle', option.puzzleRating],
        ['bot', option.botRating],
      ] as const) {
        db.ratings.set(kind, {
          kind,
          rating,
          rd: RATING_DEFAULTS.rd,
          volatility: RATING_DEFAULTS.volatility,
          gamesCount: 0,
          updatedAt: ts,
          provisional: false,
        });
      }
      saveProfileInternal({ selfAssessment: choice });
      changed();
    },

    async recordPuzzleAttempt(input) {
      const { puzzleRd, ...rest } = input;
      const attempt: PuzzleAttempt = { ...rest, id: newId(), createdAt: nowIso() };
      if (attempt.mode === 'demo') return { attempt, rating: null }; // demo attempts are not stored (D-11)
      let rating: RatingRecord | null = null;
      if (attempt.mode === 'rated') {
        const before = ratingOrDefault('puzzle');
        const clean = attempt.solved && attempt.hintsUsed === 0 && !attempt.solutionShown;
        const next = updateGlicko2(before, [
          { opponentRating: attempt.puzzleRating, opponentRd: puzzleRd || RATING_DEFAULTS.puzzleRd, score: clean ? 1 : 0 },
        ]);
        rating = { ...before, ...next, gamesCount: before.gamesCount + 1, updatedAt: attempt.createdAt, provisional: false };
        db.ratings.set('puzzle', rating);
        attempt.ratingBefore = before.rating;
        attempt.ratingAfter = rating.rating;
      }
      if (attempt.mode === 'rated' || attempt.mode === 'learning' || attempt.mode === 'theme') {
        const success = attempt.solved && attempt.firstTry && attempt.hintsUsed === 0 && !attempt.solutionShown;
        for (const theme of attempt.themes) {
          const s = db.themeStats.get(theme) ?? { theme, attempts: 0, successes: 0 };
          db.themeStats.set(theme, { theme, attempts: s.attempts + 1, successes: s.successes + (success ? 1 : 0) });
        }
      }
      db.attempts.push(clone(attempt));
      bumpDaily({ puzzles: 1 });
      changed();
      return { attempt: clone(attempt), rating: clone(rating) };
    },

    async recordLessonProgress(p) {
      const prev = db.lessonProgress.get(p.lessonId);
      let merged: LessonProgress;
      if (!prev) {
        merged = { ...p };
      } else {
        const incomingFurther = (p.completed && !prev.completed) || (p.completed === prev.completed && p.currentStep >= prev.currentStep);
        const base = incomingFurther ? p : prev;
        merged = {
          ...base,
          lessonVersion: Math.max(prev.lessonVersion, p.lessonVersion),
          currentStep: Math.max(prev.currentStep, p.currentStep),
          completed: prev.completed || p.completed,
          stars: Math.max(prev.stars, p.stars) as LessonProgress['stars'],
          completedAt: prev.completedAt ?? p.completedAt,
        };
      }
      merged.updatedAt = nowIso();
      db.lessonProgress.set(p.lessonId, merged);
      const steps = Math.max(0, merged.currentStep - (prev?.currentStep ?? 0)) + (merged.completed && !prev?.completed ? 1 : 0);
      if (steps > 0) bumpDaily({ lessons: steps });
      changed();
      return clone(merged);
    },

    async createGame(g) {
      const ts = nowIso();
      const game: Game = { ...clone(g), id: newId(), createdAt: ts, updatedAt: ts };
      db.games.set(game.id, game);
      changed();
      return clone(game);
    },

    async appendGameEvent(e) {
      const list = db.gameMoves.get(e.gameId) ?? [];
      if (list.some((x) => x.seq === e.seq)) throw new Error(`Duplicate seq ${e.seq} for game ${e.gameId}`);
      const event: GameMoveEvent = { ...clone(e), id: newId(), createdAt: nowIso() };
      db.gameMoves.set(e.gameId, [...list, event]);
      const g = db.games.get(e.gameId);
      if (g) db.games.set(g.id, { ...g, updatedAt: event.createdAt });
      changed();
      return clone(event);
    },

    async finishGame(id, result: GameResult, reason, pgn) {
      const g = db.games.get(id);
      if (!g) throw new Error(`Unknown game ${id}`);
      const ts = nowIso();
      let rating: RatingRecord | null = null;
      const next: Game = { ...g, status: 'finished', result, endReason: reason, pgn, finishedAt: ts, updatedAt: ts };
      if (g.source === 'bot' && g.assistance === 'competition' && g.userColor && result !== '*') {
        const botElo = Number(g.headers[g.userColor === 'w' ? 'BlackElo' : 'WhiteElo']);
        if (Number.isFinite(botElo) && botElo > 0) {
          const before = ratingOrDefault('bot');
          const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (g.userColor === 'w') ? 1 : 0;
          const upd = updateGlicko2(before, [{ opponentRating: botElo, opponentRd: RATING_DEFAULTS.botRd, score }]);
          rating = { ...before, ...upd, gamesCount: before.gamesCount + 1, updatedAt: ts, provisional: false };
          db.ratings.set('bot', rating);
          next.ratingBefore = before.rating;
          next.ratingAfter = rating.rating;
        }
      }
      db.games.set(id, next);
      bumpDaily({ games: 1 });
      changed();
      return { game: clone(next), rating: clone(rating) };
    },

    async saveAnalysis(a) {
      db.analyses.set(a.gameId, clone(a));
      changed();
    },

    async recordExplanationFeedback(f) {
      db.feedback.push({ ...f, id: newId(), createdAt: nowIso() });
      changed();
    },

    async saveProfile(p) {
      const next = saveProfileInternal(p);
      changed();
      return clone(next);
    },
  };

  const syncState: SyncState = { mode: 'local', online: true, pending: 0, status: 'local-only' };
  const syncStore = createValueStore(syncState);

  const session = { userId, provider: 'local' as const };
  const sessionStore = createValueStore<typeof session | null>(session);

  const services: MemoryDataServices = {
    repos,
    progress,
    deviceId,
    sync: {
      state: () => syncStore.get(),
      observe: () => syncStore,
      flush: async () => {},
    },
    auth: {
      mode: 'local',
      session: () => sessionStore.get(),
      observe: () => sessionStore,
      signInWithEmailLink: async () => {
        throw new Error('Lokaler Modus: Eine Anmeldung ist nicht nötig.');
      },
      signInWithGoogle: async () => {
        throw new Error('Lokaler Modus: Eine Anmeldung ist nicht nötig.');
      },
      handleCallback: async () => {},
      signOut: async () => {},
      accessToken: async () => null,
    },
    account: {
      exportData: async () => {
        const data = {
          exportedAt: nowIso(),
          profile: db.profile,
          ratings: [...db.ratings.values()],
          puzzleAttempts: db.attempts,
          games: [...db.games.values()],
          gameMoves: [...db.gameMoves.values()].flat(),
          gameAnalyses: [...db.analyses.values()],
          lessonProgress: [...db.lessonProgress.values()],
          dailyActivity: [...db.daily.values()],
          themeStats: [...db.themeStats.values()],
          reviewQueue: [...db.reviewQueue.values()],
          explanationFeedback: db.feedback,
        };
        return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      },
      deleteAccount: async () => {
        const puzzles = db.puzzles;
        const bankVersion = db.bankVersion;
        db = emptyDb();
        db.puzzles = puzzles; // the puzzle bank is static content, not user data
        db.bankVersion = bankVersion;
        changed();
      },
    },
    activity: {
      useTracking: () => {},
    },
    testing: {
      addActiveMinutes(minutes, date) {
        bumpDaily({ minutes }, date);
        changed();
      },
      changeCount: () => tick.get(),
    },
  };
  return services;
}
