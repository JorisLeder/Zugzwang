/**
 * Storage, progress, sync and auth contracts (BACKLOG 2.6, PRD P0-01/P0-02, "So wird reaktiv umgesetzt", D-15, D-28).
 *
 * Reads go through the repositories; **every write that creates progress goes through `ProgressService`** (local
 * transaction + outbox entry). Repositories expose `observe…` variants for live UI updates.
 */
import type { GameAnalysis } from './analysis';
import type { GameEndReason, GameResult } from './chess';
import type { ExplanationFeedback } from './explain';
import type { Game, GameMoveEvent, GameSource } from './games';
import type { LessonProgress } from './lessons';
import type { DailyActivity, Profile, ReviewQueueItem, SelfAssessment, Settings, ThemeStat } from './profile';
import type { Puzzle, PuzzleAttempt, PuzzleMode, PuzzleQuery } from './puzzles';
import type { RatingKind, RatingRecord } from './rating';
import type { TableName } from './tables';

/**
 * A value that changes over time. `subscribe` calls `cb` with the current value as soon as it is available (possibly
 * synchronously) and after every change; it returns an unsubscribe function. Dexie `liveQuery` observables and other
 * `{ subscribe(next): { unsubscribe() } }` sources are adapted with `fromObservable()` from `@/lib/observable`.
 * In React use `useSubscribable()`.
 */
export interface Subscribable<T> {
  subscribe(cb: (value: T) => void): () => void;
}

/** The single profile of the current user. */
export interface ProfileRepository {
  /** `null` before the profile is created (first start). */
  get(): Promise<Profile | null>;
  observe(): Subscribable<Profile | null>;
  /** Writes the whole profile (used by sync and onboarding through ProgressService.saveProfile). */
  save(p: Profile): Promise<void>;
  /** Merges a settings patch, sets `updatedAt` (LWW) and returns the new settings. Creates a default profile if none exists. */
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
}

/** Ratings per kind. */
export interface RatingRepository {
  get(kind: RatingKind): Promise<RatingRecord | null>;
  observe(kind: RatingKind): Subscribable<RatingRecord | null>;
  /** Rating after each rated attempt/game, oldest first (for the rating curve). */
  history(kind: RatingKind): Promise<Array<{ at: string; rating: number }>>;
}

/** Local puzzle bank (IndexedDB, D-25). */
export interface PuzzleRepository {
  get(id: string): Promise<Puzzle | null>;
  query(q: PuzzleQuery): Promise<Puzzle[]>;
  count(q?: Omit<PuzzleQuery, 'limit'>): Promise<number>;
  bulkUpsert(p: Puzzle[]): Promise<void>;
  /** Replaces the whole bank atomically (clear + insert in one transaction; attempts reference puzzles by id only and stay). */
  replaceAll(p: Puzzle[]): Promise<void>;
  /** Manifest version of the loaded bank, `null` if none is loaded. */
  bankVersion(): Promise<string | null>;
  setBankVersion(v: string): Promise<void>;
}

/** Puzzle attempts (read-only; writes only via `ProgressService.recordPuzzleAttempt`). */
export interface PuzzleAttemptRepository {
  /** Newest first. */
  list(q?: { mode?: PuzzleMode; since?: string; limit?: number }): Promise<PuzzleAttempt[]>;
  /** Ids of all puzzles with a rated attempt (never serve them rated again, P0-04). */
  ratedPuzzleIds(): Promise<Set<string>>;
  /** Newest `limit` attempts, live. */
  observeRecent(limit: number): Subscribable<PuzzleAttempt[]>;
}

/** Filter for game lists. */
export interface GameListQuery {
  status?: Game['status'];
  source?: GameSource;
  /** Newest first (by `updatedAt`). */
  limit?: number;
}

/** Games (writes via ProgressService, except heartbeat/takeover). */
export interface GameRepository {
  get(id: string): Promise<Game | null>;
  observe(id: string): Subscribable<Game | null>;
  /** Newest first (by `updatedAt`). */
  list(q?: GameListQuery): Promise<Game[]>;
  observeList(q?: GameListQuery): Subscribable<Game[]>;
  findByExternalId(source: GameSource, externalId: string): Promise<Game | null>;
  /** Marks `deviceId` as the active device (every 10 s while a game is open, P0-02). */
  heartbeat(id: string, deviceId: string): Promise<void>;
  /** Takes the game over on `deviceId` ("Hier übernehmen"). */
  takeOver(id: string, deviceId: string): Promise<void>;
}

/** Move event log per game (read-only; writes via `ProgressService.appendGameEvent`). */
export interface GameMoveRepository {
  /** Events ordered by `seq`. Use `movesFromEvents` to get the move list. */
  list(gameId: string): Promise<GameMoveEvent[]>;
  observe(gameId: string): Subscribable<GameMoveEvent[]>;
}

/** Stored analyses (writes via `ProgressService.saveAnalysis`; `save` exists for sync). */
export interface GameAnalysisRepository {
  get(gameId: string): Promise<GameAnalysis | null>;
  save(a: GameAnalysis): Promise<void>;
  list(): Promise<GameAnalysis[]>;
}

/** Lesson progress (writes via `ProgressService.recordLessonProgress`). */
export interface LessonProgressRepository {
  get(lessonId: string): Promise<LessonProgress | null>;
  list(): Promise<LessonProgress[]>;
  observeAll(): Subscribable<LessonProgress[]>;
}

/** Daily activity (written by ProgressService and the ActivityTracker). Dates are `YYYY-MM-DD`, ranges inclusive. */
export interface DailyActivityRepository {
  get(date: string): Promise<DailyActivity | null>;
  range(from: string, to: string): Promise<DailyActivity[]>;
  observe(date: string): Subscribable<DailyActivity | null>;
}

/** Theme statistics (written by ProgressService). */
export interface ThemeStatsRepository {
  list(): Promise<ThemeStat[]>;
  observe(): Subscribable<ThemeStat[]>;
}

/** Spaced repetition queue (P1-03 preparation). */
export interface ReviewQueueRepository {
  /** Items with `dueAt <= at`, oldest first. */
  due(at: string): Promise<ReviewQueueItem[]>;
  upsert(i: ReviewQueueItem): Promise<void>;
}

/** Thumbs up/down (writes via `ProgressService.recordExplanationFeedback`; `add` exists for sync). */
export interface ExplanationFeedbackRepository {
  add(f: ExplanationFeedback): Promise<void>;
  /** Latest vote for an explanation. */
  get(context: string, ref: string): Promise<ExplanationFeedback | null>;
}

/** All repositories. */
export interface Repositories {
  profile: ProfileRepository;
  ratings: RatingRepository;
  puzzles: PuzzleRepository;
  puzzleAttempts: PuzzleAttemptRepository;
  games: GameRepository;
  gameMoves: GameMoveRepository;
  gameAnalyses: GameAnalysisRepository;
  lessonProgress: LessonProgressRepository;
  dailyActivity: DailyActivityRepository;
  themeStats: ThemeStatsRepository;
  reviewQueue: ReviewQueueRepository;
  explanationFeedback: ExplanationFeedbackRepository;
}

/** A rated puzzle that was shown but not finished (see `ProgressService.markRatedPuzzleShown`). */
export interface PendingRatedPuzzle {
  puzzleId: string;
  startedAt: string;
}

/**
 * The only writer of progress (local transaction + outbox entry per write).
 * Rating rules (D-09, D-11): rated puzzle attempts update the puzzle rating (Glicko-2 vs puzzle rating/RD; any hint
 * or shown solution counts as not solved); theme stats count first-try results of rated, learning and theme modes;
 * demo attempts are not stored. Bot rating only for finished `competition` bot games – the opponent rating is the
 * bot's Elo from the game headers (`WhiteElo`/`BlackElo` of the bot's colour) with RD 50.
 */
export interface ProgressService {
  /** Creates the ratings (puzzle, bot; RD 350) and profile fields from the self-assessment (D-10). */
  initializeFromSelfAssessment(choice: SelfAssessment): Promise<void>;
  /** Appends an attempt (client UUID) and, in rated mode, updates the puzzle rating; also theme stats and daily activity. */
  recordPuzzleAttempt(
    a: Omit<PuzzleAttempt, 'id' | 'createdAt' | 'ratingBefore' | 'ratingAfter'> & { puzzleRd: number },
  ): Promise<{ attempt: PuzzleAttempt; rating: RatingRecord | null }>;
  /**
   * Remembers that the rated puzzle `puzzleId` is on screen (marker `{puzzleId, startedAt}`), so leaving it without an
   * attempt can be counted as failed on the next start. Idempotent; ignored if the puzzle already has a rated attempt.
   */
  markRatedPuzzleShown(puzzleId: string): Promise<void>;
  /** The rated puzzle that was shown but has no attempt yet, `null` if none. */
  pendingRatedPuzzle(): Promise<PendingRatedPuzzle | null>;
  /** Removes the marker. (A rated attempt for the marked puzzle removes it by itself.) */
  clearPendingRatedPuzzle(): Promise<void>;
  /** Furthest progress wins (max step, completed OR, max stars, D-13). Returns the merged progress. */
  recordLessonProgress(p: LessonProgress): Promise<LessonProgress>;
  /** Creates a game with a client UUID. */
  createGame(g: Omit<Game, 'id' | 'createdAt' | 'updatedAt'>): Promise<Game>;
  /** Appends a move/takeback event (client UUID). */
  appendGameEvent(e: Omit<GameMoveEvent, 'id' | 'createdAt'>): Promise<GameMoveEvent>;
  /** Finishes a game; updates the bot rating for competition bot games (else `rating = null`). */
  finishGame(
    id: string,
    result: GameResult,
    reason: GameEndReason,
    pgn: string,
  ): Promise<{ game: Game; rating: RatingRecord | null }>;
  saveAnalysis(a: GameAnalysis): Promise<void>;
  recordExplanationFeedback(f: Omit<ExplanationFeedback, 'id' | 'createdAt'>): Promise<void>;
  /** Merges profile fields (settings LWW by `updatedAt`); creates the profile if missing. */
  saveProfile(p: Partial<Profile>): Promise<Profile>;
}

/** Counts active minutes (tab visible + interaction in the last 60 s) into daily activity. */
export interface ActivityTracker {
  /** React hook: call in a page component of the given area. */
  useTracking(area: 'puzzles' | 'play' | 'lessons' | 'analysis'): void;
}

/** Unsent write waiting for the backend (idempotent by row id). */
export interface OutboxEntry {
  id: string;
  table: TableName;
  op: 'insert' | 'upsert' | 'rpc';
  payload: unknown;
  enqueuedAt: string;
  attempts: number;
  lastError?: string;
}

/** Result of pushing one outbox entry. Duplicates count as success. */
export interface PushResult {
  id: string;
  ok: boolean;
  duplicate?: boolean;
  error?: string;
  /** Retry later (network/5xx) vs. permanent failure. */
  retryable?: boolean;
}

/** A change received from the backend (pull or realtime). `row` is a snake_case row of `table`. */
export type RemoteChange = { table: TableName; row: unknown; op: 'insert' | 'update' | 'delete' };

/** Backend connection (`none` in local mode, `supabase` in cloud mode, `memory` in tests). */
export interface SyncAdapter {
  readonly kind: 'none' | 'supabase' | 'memory';
  push(entries: OutboxEntry[]): Promise<PushResult[]>;
  pullAll(): Promise<RemoteChange[]>;
  subscribe(onChange: (c: RemoteChange) => void): () => void;
}

/** Sync status for the indicator and banners (DESIGN §3.7). */
export interface SyncState {
  mode: 'local' | 'cloud';
  online: boolean;
  /** Outbox entries not yet confirmed. */
  pending: number;
  status: 'local-only' | 'synced' | 'pending' | 'offline' | 'error';
  /** Entries the server rejected permanently (dead letters; present only when > 0). Status is then at least `error`. */
  deadLetterCount?: number;
  lastSyncedAt?: string;
  error?: string;
}

/** Outbox flushing and status. */
export interface SyncService {
  state(): SyncState;
  observe(): Subscribable<SyncState>;
  /** Pushes pending entries now. */
  flush(): Promise<void>;
}

/** Logged-in user. Local mode has a permanent `local` session. */
export interface AuthSession {
  userId: string;
  email?: string;
  provider: 'email' | 'google' | 'local';
  expiresAt?: string;
  /**
   * Cloud mode only: the session was restored from storage while the token could not be refreshed (offline start). The
   * user may use the app, but syncing stays off until a refresh succeeds and the real session is emitted.
   */
  unverified?: true;
}

/** Authentication (Supabase in cloud mode; a local session in local mode, D-15). */
export interface AuthService {
  readonly mode: 'local' | 'cloud';
  session(): AuthSession | null;
  observe(): Subscribable<AuthSession | null>;
  signInWithEmailLink(email: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  /** Completes the OAuth/magic-link redirect on `/auth/callback`. */
  handleCallback(url: string): Promise<void>;
  signOut(): Promise<void>;
  /** JWT for edge functions; `null` in local mode or when logged out. */
  accessToken(): Promise<string | null>;
}

/** Account export and deletion (DoD V1). */
export interface AccountService {
  /** JSON export of all user data. */
  exportData(): Promise<Blob>;
  /** Deletes all user data (cloud: `delete-account` function, then sign-out; local: wipe). */
  deleteAccount(): Promise<void>;
}

/** Everything the data layer provides (`createDataServices`). */
export interface DataServices {
  repos: Repositories;
  progress: ProgressService;
  sync: SyncService;
  auth: AuthService;
  account: AccountService;
  activity: ActivityTracker;
  /** Id of this tab, stable across reloads (active-game lease, takeover dialog). */
  deviceId: string;
}
