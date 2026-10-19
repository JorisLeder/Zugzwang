/**
 * In-memory fake of the Supabase backend (Postgres + PostgREST + Auth + Realtime + Edge Functions) with the same
 * semantics the real migrations implement:
 *
 * - Row level security: every request acts as the logged-in user; rows of other users are invisible, writing them
 *   fails (403). Without a valid session requests fail with 401.
 * - Append-only tables (`puzzle_attempts`, `game_moves`, `explanation_feedback`) and initial ratings: insert with
 *   `on conflict do nothing` – duplicates are ignored. `game_moves` has a unique `(game_id, seq)` and a foreign key
 *   to `games` (statements fail atomically like Postgres).
 * - Server-side computation in insertion order with the shared rules (`@/data/progress`, `@/lib/rating`): rated puzzle
 *   attempts update the puzzle rating and get `rating_before/after`; finished competition bot games update the bot
 *   rating; theme stats and daily activity are counted on the server.
 * - `upsert_lesson_progress` (furthest wins), `upsert_daily_minutes` (greatest), profile upserts with the LWW guard
 *   (settings by `settings.updatedAt`), games merged like the client (`mergeGame`).
 * - Realtime `postgres_changes` fan-out to every subscribed client (filtered by the owner column).
 * - `delete-account` function: deletes all rows and the auth user.
 * - Auth: magic links (mailbox), Google OAuth (redirect list), code exchange, sessions with expiry and refresh.
 * - Configurable latency (one way: request → processing → response each take `latencyMs`) and failure injection.
 */
import type { Game } from '@/core/games';
import type { LessonProgress } from '@/core/lessons';
import { DEFAULT_DAILY_GOAL_MINUTES, type Profile } from '@/core/profile';
import type { RatingKind } from '@/core/rating';
import {
  APPEND_ONLY_TABLES,
  fromRow,
  toRow,
  USER_ID_COLUMN,
  USER_TABLES,
  type DailyActivityRow,
  type GameRow,
  type LessonProgressRow,
  type ProfileRow,
  type PuzzleAttemptRow,
  type RatingRow,
  type ThemeStatRow,
  type UserTableName,
} from '@/core/tables';
import { newId } from '@/lib/ids';
import { RPC } from '../outbox';
import {
  addToDay,
  applyThemeStats,
  dayKeyOf,
  defaultRating,
  emptyDay,
  isRatedAttempt,
  lessonStepsGained,
  mergeGame,
  mergeLessonProgress,
  mergeProfile,
  rateBotGame,
  ratePuzzleAttempt,
} from '../progress';
import { isUserTable, PRIMARY_KEYS, rowKey } from '../sync/tables';
import type { SbError, SbRealtimePayload, SbResponse, SbSession } from '../supabase/types';

type Row = Record<string, unknown>;

/** Options of the fake server. */
export interface FakeServerOptions {
  /** One-way latency in ms (default 0): a request is processed after it and answered after it again. */
  latencyMs?: number;
  /** Delay of realtime events after a change (default `latencyMs`). */
  realtimeLatencyMs?: number;
  /** Time zone of server-side daily activity (default `Europe/Berlin`). */
  timeZone?: string;
  now?: () => Date;
  /** Lifetime of an access token in seconds (default 3600). */
  sessionTtlSeconds?: number;
  /** E-mail of the account Google OAuth signs in (default `google.nutzer@example.com`). */
  googleEmail?: string;
}

/** A request as the failure rules and the log see it. */
export interface FakeRequest {
  kind: 'select' | 'upsert' | 'rpc' | 'function' | 'auth';
  /** Table, RPC function, edge function or auth operation. */
  target: string;
  userId: string | null;
}

/** Injected failure: the next `count` matching requests fail with `status`. */
export interface FailureRule {
  count: number;
  status?: number;
  message?: string;
  match?: (req: FakeRequest) => boolean;
  /** The request IS processed, but the response is lost (network error) – the client must resend safely. */
  lostResponse?: boolean;
}

/** Server-side user. */
export interface FakeUser {
  id: string;
  email: string;
  provider: 'email' | 'google';
}

/** Realtime subscription of one channel binding. */
interface Subscription {
  table: string;
  column: string;
  value: string;
  userId: string;
  deliver(payload: SbRealtimePayload): void;
}

/** Error of a request (Postgres/PostgREST style). */
export class FakeServerError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
const clone = <T>(v: T): T => structuredClone(v);
const APPEND_ONLY = new Set<string>(APPEND_ONLY_TABLES);

/** The fake backend. Share one instance between several fake clients to simulate several devices. */
export class FakeSupabaseServer {
  latencyMs: number;
  realtimeLatencyMs: number;
  readonly timeZone: string;
  readonly now: () => Date;
  readonly sessionTtlSeconds: number;
  readonly googleEmail: string;
  /** Magic-link e-mails sent (newest last). */
  readonly mailbox: Array<{ email: string; link: string }> = [];
  /** OAuth redirect URLs issued (newest last). */
  readonly oauthRedirects: string[] = [];
  /** Every processed request with its status. */
  readonly log: Array<FakeRequest & { status: number }> = [];
  /** Edge function calls. */
  readonly functionCalls: Array<{ name: string; userId: string | null; body: unknown }> = [];

  private readonly data = new Map<UserTableName, Map<string, Row>>();
  private readonly users = new Map<string, FakeUser>();
  private readonly codes = new Map<string, string>();
  private readonly accessTokens = new Map<string, { userId: string; expiresAt: number }>();
  private readonly refreshTokens = new Map<string, string>();
  private readonly subscriptions = new Set<Subscription>();
  private failures: Array<Required<Pick<FailureRule, 'count' | 'status' | 'message'>> & Pick<FailureRule, 'match' | 'lostResponse'>> = [];

  constructor(opts: FakeServerOptions = {}) {
    this.latencyMs = opts.latencyMs ?? 0;
    this.realtimeLatencyMs = opts.realtimeLatencyMs ?? this.latencyMs;
    this.timeZone = opts.timeZone ?? 'Europe/Berlin';
    this.now = opts.now ?? (() => new Date());
    this.sessionTtlSeconds = opts.sessionTtlSeconds ?? 3600;
    this.googleEmail = opts.googleEmail ?? 'google.nutzer@example.com';
    for (const t of USER_TABLES) this.data.set(t, new Map());
  }

  // ---- test API ---------------------------------------------------------------------------------------------------

  /** Copies of the rows of `table` (of one user, if given), in insertion order. */
  rows<T extends object = Row>(table: UserTableName, userId?: string): T[] {
    const list = [...this.data.get(table)!.values()];
    return clone(userId ? list.filter((r) => r[USER_ID_COLUMN[table]] === userId) : list) as T[];
  }

  /** Lets the next matching requests fail (e.g. `{ count: 3, status: 503 }`). */
  failNext(rule: FailureRule): void {
    this.failures.push({
      count: rule.count,
      status: rule.lostResponse ? 0 : (rule.status ?? 503),
      message: rule.message ?? (rule.lostResponse ? 'TypeError: Failed to fetch' : 'Service Unavailable'),
      match: rule.match,
      lostResponse: rule.lostResponse,
    });
  }

  /** Removes all failure rules. */
  clearFailures(): void {
    this.failures = [];
  }

  /** Creates (or returns) a user. */
  createUser(email: string, provider: FakeUser['provider'] = 'email'): FakeUser {
    const existing = [...this.users.values()].find((u) => u.email === email);
    if (existing) return existing;
    const user: FakeUser = { id: newId(), email, provider };
    this.users.set(user.id, user);
    return user;
  }

  /** The user with this e-mail, if any. */
  userByEmail(email: string): FakeUser | undefined {
    return [...this.users.values()].find((u) => u.email === email);
  }

  /** A fresh session for a user (as after a completed login). */
  issueSession(userId: string): SbSession {
    const user = this.users.get(userId);
    if (!user) throw new FakeServerError(400, 'User not found');
    const access = `at-${newId()}`;
    const refresh = `rt-${newId()}`;
    const expiresAt = Math.floor(this.now().getTime() / 1000) + this.sessionTtlSeconds;
    this.accessTokens.set(access, { userId, expiresAt });
    this.refreshTokens.set(refresh, userId);
    return {
      access_token: access,
      refresh_token: refresh,
      expires_at: expiresAt,
      user: { id: user.id, email: user.email, app_metadata: { provider: user.provider } },
    };
  }

  /** Link of the newest magic-link e-mail to `email`. */
  lastMagicLink(email: string): string | undefined {
    return [...this.mailbox].reverse().find((m) => m.email === email)?.link;
  }

  /** Number of realtime subscriptions (tests). */
  subscriptionCount(): number {
    return this.subscriptions.size;
  }

  // ---- transport (used by the fake client) --------------------------------------------------------------------------

  /** Runs one request with latency, connectivity and failure injection. */
  async request<T>(req: FakeRequest, online: () => boolean, exec: () => T): Promise<SbResponse<T>> {
    await sleep(this.latencyMs);
    let res: SbResponse<T>;
    if (!online()) {
      res = { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
    } else {
      const rule = this.failures.find((r) => r.count > 0 && (!r.match || r.match(req)));
      if (rule) {
        rule.count -= 1;
        if (rule.lostResponse) {
          try {
            exec();
          } catch (e) {
            if (!(e instanceof FakeServerError)) throw e;
          }
        }
        res = { data: null, error: { message: rule.message }, status: rule.status };
      } else {
        try {
          res = { data: clone(exec()), error: null, status: 200 };
        } catch (e) {
          if (!(e instanceof FakeServerError)) throw e;
          const error: SbError = { message: e.message };
          if (e.code) error.code = e.code;
          res = { data: null, error, status: e.status };
        }
      }
    }
    this.failures = this.failures.filter((r) => r.count > 0);
    this.log.push({ ...req, status: res.status ?? 0 });
    await sleep(this.latencyMs);
    // A request that never reached the server must not answer once the connection is back.
    return online() || res.status === 0 ? res : { data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 };
  }

  /** User of an access token; throws 401 when missing, unknown or expired. */
  authenticate(accessToken: string | null | undefined): string {
    const t = accessToken ? this.accessTokens.get(accessToken) : undefined;
    if (!t) throw new FakeServerError(401, 'Invalid JWT', 'PGRST301');
    if (t.expiresAt * 1000 <= this.now().getTime()) throw new FakeServerError(401, 'JWT expired', 'PGRST301');
    if (!this.users.has(t.userId)) throw new FakeServerError(401, 'User not found', 'PGRST301');
    return t.userId;
  }

  /** `select` with equality filters, ordering and range (RLS applied). */
  select(table: string, uid: string, q: { eq: Array<[string, unknown]>; in: Array<[string, readonly unknown[]]>; order?: { column: string; ascending: boolean }; range?: [number, number]; columns: string }): Row[] {
    if (!isUserTable(table)) return []; // static tables are seeded separately and not part of the fake
    let rows = [...this.data.get(table)!.values()].filter((r) => r[USER_ID_COLUMN[table]] === uid);
    for (const [c, v] of q.eq) rows = rows.filter((r) => r[c] === v);
    for (const [c, vs] of q.in) rows = rows.filter((r) => vs.includes(r[c]));
    if (q.order) {
      const { column, ascending } = q.order;
      rows = [...rows].sort((a, b) => {
        const x = a[column] as string | number;
        const y = b[column] as string | number;
        const cmp = x < y ? -1 : x > y ? 1 : 0;
        return ascending ? cmp : -cmp;
      });
    }
    if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
    return rows.map((r) => project(r, q.columns));
  }

  /** `upsert` (insert … on conflict do update / do nothing). Returns the written rows. */
  upsert(table: string, uid: string, input: Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean }): Row[] {
    if (!isUserTable(table)) throw new FakeServerError(403, `permission denied for table ${table}`, '42501');
    if (table === 'explanation_usage') throw new FakeServerError(403, 'permission denied for table explanation_usage', '42501');
    const ownerCol = USER_ID_COLUMN[table];
    for (const r of input) {
      if (r[ownerCol] !== uid) throw new FakeServerError(403, `new row violates row-level security policy for table "${table}"`, '42501');
    }
    const conflict = opts.onConflict ?? PRIMARY_KEYS[table].join(',');
    if (conflict !== PRIMARY_KEYS[table].join(',')) {
      throw new FakeServerError(400, 'there is no unique or exclusion constraint matching the ON CONFLICT specification', '42P10');
    }
    const ignore = opts.ignoreDuplicates === true || APPEND_ONLY.has(table);
    if (APPEND_ONLY.has(table) && !opts.ignoreDuplicates) {
      // Clients may only insert into append-only tables; an update of an existing row is rejected by RLS.
      for (const r of input) {
        if (this.data.get(table)!.has(rowKey(table, r))) throw new FakeServerError(403, `permission denied: ${table} is append-only`, '42501');
      }
    }
    const keys = input.map((r) => rowKey(table, r));
    if (new Set(keys).size !== keys.length) {
      throw new FakeServerError(400, 'ON CONFLICT DO UPDATE command cannot affect row a second time', '21000');
    }
    if (table === 'game_moves') this.checkGameMoves(uid, input);
    if (table === 'games') this.checkGameExternalIds(input);
    const written: Row[] = [];
    for (const row of input) {
      const key = rowKey(table, row);
      const existing = this.data.get(table)!.get(key);
      if (existing && ignore) continue;
      written.push(existing ? this.update(table, existing, row) : this.insert(table, row));
    }
    return written;
  }

  /** RPC call. */
  rpc(fn: string, uid: string, args: Record<string, unknown>): unknown {
    if (fn === RPC.upsertLessonProgress) return this.upsertLessonProgress(uid, args);
    if (fn === RPC.upsertDailyMinutes) return this.upsertDailyMinutes(uid, String(args.p_date), Number(args.p_minutes));
    throw new FakeServerError(404, `Could not find the function public.${fn}`, 'PGRST202');
  }

  /** Edge function call. */
  invokeFunction(name: string, uid: string, body: unknown): unknown {
    this.functionCalls.push({ name, userId: uid, body });
    if (name !== 'delete-account') throw new FakeServerError(404, `Function ${name} not found`);
    for (const t of USER_TABLES) {
      for (const [key, row] of [...this.data.get(t)!]) {
        if (row[USER_ID_COLUMN[t]] !== uid) continue;
        this.data.get(t)!.delete(key);
        this.emit(t, 'DELETE', {}, row);
      }
    }
    this.users.delete(uid);
    for (const [token, t] of [...this.accessTokens]) if (t.userId === uid) this.accessTokens.delete(token);
    for (const [token, u] of [...this.refreshTokens]) if (u === uid) this.refreshTokens.delete(token);
    for (const s of [...this.subscriptions]) if (s.userId === uid) this.subscriptions.delete(s);
    return { deleted: true };
  }

  // ---- auth ---------------------------------------------------------------------------------------------------------

  /** `signInWithOtp`: sends a magic link (creates the user unless `shouldCreateUser` is false). */
  sendMagicLink(email: string, redirectTo: string, shouldCreateUser = true): void {
    let user = this.userByEmail(email);
    if (!user) {
      if (!shouldCreateUser) throw new FakeServerError(422, 'Signups not allowed for otp');
      user = this.createUser(email, 'email');
    }
    const code = `code-${newId()}`;
    this.codes.set(code, user.id);
    this.mailbox.push({ email, link: `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}code=${code}` });
  }

  /** `signInWithOAuth` (Google): returns the redirect URL back to the app with a code. */
  startOAuth(redirectTo: string): string {
    const user = this.createUser(this.googleEmail, 'google');
    const code = `code-${newId()}`;
    this.codes.set(code, user.id);
    const url = `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}code=${code}`;
    this.oauthRedirects.push(url);
    return url;
  }

  /** Exchanges a one-time code (magic link / OAuth / token hash) for a session. */
  exchangeCode(code: string): SbSession {
    const userId = this.codes.get(code);
    if (!userId) throw new FakeServerError(400, 'invalid flow state, no valid flow state found');
    this.codes.delete(code);
    return this.issueSession(userId);
  }

  /** New session for a refresh token (rotating). */
  refreshSession(refreshToken: string): SbSession {
    const userId = this.refreshTokens.get(refreshToken);
    if (!userId || !this.users.has(userId)) throw new FakeServerError(400, 'Invalid Refresh Token: Refresh Token Not Found');
    this.refreshTokens.delete(refreshToken);
    return this.issueSession(userId);
  }

  /** Validates an access/refresh token pair (`setSession`). */
  sessionFromTokens(accessToken: string, refreshToken: string): SbSession {
    const t = this.accessTokens.get(accessToken);
    if (!t || this.refreshTokens.get(refreshToken) !== t.userId) throw new FakeServerError(400, 'Invalid session');
    return this.refreshSession(refreshToken);
  }

  /** Ends a session (sign-out on the server). */
  revoke(accessToken: string | undefined, refreshToken: string | undefined): void {
    if (accessToken) this.accessTokens.delete(accessToken);
    if (refreshToken) this.refreshTokens.delete(refreshToken);
  }

  // ---- realtime -----------------------------------------------------------------------------------------------------

  /** Registers a `postgres_changes` binding (filter `column=eq.value`, which must be the subscriber's own id). */
  subscribe(userId: string, table: string, filter: string | undefined, deliver: (p: SbRealtimePayload) => void): () => void {
    const m = filter ? /^([a-z_]+)=eq\.(.+)$/.exec(filter) : null;
    const column = m?.[1] ?? (isUserTable(table) ? USER_ID_COLUMN[table] : 'user_id');
    const value = m?.[2] ?? userId;
    const sub: Subscription = { table, column, value, userId, deliver };
    this.subscriptions.add(sub);
    return () => this.subscriptions.delete(sub);
  }

  private emit(table: UserTableName, eventType: SbRealtimePayload['eventType'], next: Row, old: Row): void {
    const row = eventType === 'DELETE' ? old : next;
    const ownerId = row[USER_ID_COLUMN[table]];
    for (const s of this.subscriptions) {
      if (s.table !== table && s.table !== '*') continue;
      if (row[s.column] !== s.value || ownerId !== s.userId) continue; // RLS: own rows only
      const payload: SbRealtimePayload = { schema: 'public', table, eventType, new: clone(next), old: clone(old) };
      setTimeout(() => {
        if (this.subscriptions.has(s)) s.deliver(payload);
      }, this.realtimeLatencyMs);
    }
  }

  // ---- storage and triggers -----------------------------------------------------------------------------------------

  private put(table: UserTableName, value: object, previous: object | undefined): Row {
    const row = value as Row;
    const prev = previous as Row | undefined;
    this.data.get(table)!.set(rowKey(table, row), row);
    this.emit(table, prev ? 'UPDATE' : 'INSERT', row, prev ?? {});
    return row;
  }

  private get<T extends object>(table: UserTableName, key: Row): T | undefined {
    return this.data.get(table)!.get(rowKey(table, key)) as T | undefined;
  }

  /** `games_user_source_external_id_key`: unique (user_id, source, external_id) for imported games. */
  private checkGameExternalIds(rows: Row[]): void {
    const seen = new Map<string, unknown>();
    for (const r of rows) {
      if (r.external_id == null) continue;
      const k = `${String(r.user_id)}|${String(r.source)}|${String(r.external_id)}`;
      const clash =
        [...this.data.get('games')!.values()].some((g) => g.id !== r.id && `${String(g.user_id)}|${String(g.source)}|${String(g.external_id)}` === k) ||
        (seen.has(k) && seen.get(k) !== r.id);
      if (clash) {
        throw new FakeServerError(409, 'duplicate key value violates unique constraint "games_user_source_external_id_key"', '23505');
      }
      seen.set(k, r.id);
    }
  }

  private checkGameMoves(uid: string, rows: Row[]): void {
    const seqs = new Set<string>();
    for (const r of rows) {
      if (this.data.get('game_moves')!.has(rowKey('game_moves', r))) continue; // duplicate id: ignored
      const game = this.get<GameRow>('games', { id: r.game_id });
      if (!game || game.user_id !== uid) {
        throw new FakeServerError(409, 'insert or update on table "game_moves" violates foreign key constraint "game_moves_game_id_fkey"', '23503');
      }
      const k = `${String(r.game_id)}|${String(r.seq)}`;
      const clash = [...this.data.get('game_moves')!.values()].some((m) => m.game_id === r.game_id && m.seq === r.seq);
      if (clash || seqs.has(k)) {
        throw new FakeServerError(409, 'duplicate key value violates unique constraint "game_moves_game_id_seq_key"', '23505');
      }
      seqs.add(k);
    }
  }

  private nowIso(): string {
    return this.now().toISOString();
  }

  private goalMinutes(uid: string): number {
    return this.get<ProfileRow>('profiles', { id: uid })?.daily_goal_minutes ?? DEFAULT_DAILY_GOAL_MINUTES;
  }

  private bumpDaily(uid: string, date: string, delta: Parameters<typeof addToDay>[2]): void {
    const prev = this.get<DailyActivityRow>('daily_activity', { user_id: uid, date });
    const day = addToDay(prev ? fromRow.dailyActivity(prev) : emptyDay(date), date, delta, this.goalMinutes(uid));
    this.put('daily_activity', toRow.dailyActivity(day, uid) as unknown as Row, prev);
  }

  private rating(uid: string, kind: RatingKind) {
    const row = this.get<RatingRow>('ratings', { user_id: uid, kind });
    return row ? fromRow.rating(row) : defaultRating(kind, this.nowIso());
  }

  private insert(table: UserTableName, row: Row): Row {
    const r = clone(row);
    switch (table) {
      case 'puzzle_attempts':
        return this.insertAttempt(r as unknown as PuzzleAttemptRow);
      case 'games':
        return this.writeGame(r as unknown as GameRow, undefined);
      case 'profiles': {
        const p = fromRow.profile(r as unknown as ProfileRow);
        return this.put('profiles', toRow.profile(p) as unknown as Row, undefined);
      }
      case 'game_moves': {
        // Trigger: a new move bumps `games.updated_at` (the client does not re-send the game row per move).
        const game = this.get<GameRow>('games', { id: r.game_id });
        const at = String(r.created_at);
        if (game && at > game.updated_at) this.put('games', { ...game, updated_at: at }, game);
        return this.put(table, r, undefined);
      }
      default:
        return this.put(table, r, undefined);
    }
  }

  private update(table: UserTableName, existing: Row, row: Row): Row {
    switch (table) {
      case 'profiles': {
        // LWW guard: settings by settings.updatedAt, the other fields by updated_at.
        const merged: Profile = mergeProfile(fromRow.profile(existing as unknown as ProfileRow), fromRow.profile(row as unknown as ProfileRow));
        return this.put('profiles', toRow.profile(merged) as unknown as Row, existing);
      }
      case 'games':
        return this.writeGame(row as unknown as GameRow, existing as unknown as GameRow);
      default:
        return this.put(table, clone(row), existing);
    }
  }

  private insertAttempt(r: PuzzleAttemptRow): Row {
    const uid = r.user_id;
    const a = fromRow.puzzleAttempt(r);
    if (isRatedAttempt(a.mode)) {
      const before = this.rating(uid, 'puzzle');
      const after = ratePuzzleAttempt(before, a, r.puzzle_rd, this.nowIso());
      const prev = this.get<RatingRow>('ratings', { user_id: uid, kind: 'puzzle' });
      this.put('ratings', toRow.rating(after, uid) as unknown as Row, prev);
      r.rating_before = before.rating;
      r.rating_after = after.rating;
    } else {
      r.rating_before = null;
      r.rating_after = null;
    }
    const stats = new Map(this.rows<ThemeStatRow>('theme_stats', uid).map((s) => [s.theme, fromRow.themeStat(s)]));
    for (const s of applyThemeStats(stats, a)) {
      const prev = this.get<ThemeStatRow>('theme_stats', { user_id: uid, theme: s.theme });
      this.put('theme_stats', toRow.themeStat(s, uid) as unknown as Row, prev);
    }
    this.bumpDaily(uid, dayKeyOf(r.created_at, this.timeZone), { puzzles: 1 });
    return this.put('puzzle_attempts', r as unknown as Row, undefined);
  }

  private writeGame(row: GameRow, existing: GameRow | undefined): Row {
    const uid = row.user_id;
    const prev: Game | undefined = existing ? fromRow.game(existing) : undefined;
    const merged = mergeGame(prev, fromRow.game(row));
    const newlyFinished = merged.status === 'finished' && prev?.status !== 'finished' && merged.result !== '*';
    if (newlyFinished) {
      const at = merged.finishedAt ?? this.nowIso();
      const before = this.rating(uid, 'bot');
      const after = rateBotGame(before, merged, merged.result, this.nowIso());
      if (after) {
        const prevRating = this.get<RatingRow>('ratings', { user_id: uid, kind: 'bot' });
        this.put('ratings', toRow.rating(after, uid) as unknown as Row, prevRating);
        merged.ratingBefore = before.rating;
        merged.ratingAfter = after.rating;
      } else {
        merged.ratingBefore = null;
        merged.ratingAfter = null;
      }
      this.bumpDaily(uid, dayKeyOf(at, this.timeZone), { games: 1 });
    } else if (prev) {
      merged.ratingBefore = prev.ratingBefore;
      merged.ratingAfter = prev.ratingAfter;
    } else {
      merged.ratingBefore = null;
      merged.ratingAfter = null;
    }
    return this.put('games', toRow.game(merged, uid) as unknown as Row, existing as unknown as Row | undefined);
  }

  private upsertLessonProgress(uid: string, args: Record<string, unknown>): Row {
    const incoming: LessonProgress = fromRow.lessonProgress({
      user_id: uid,
      lesson_id: String(args.p_lesson_id),
      lesson_version: Number(args.p_lesson_version),
      current_step: Number(args.p_current_step),
      completed: Boolean(args.p_completed),
      stars: Number(args.p_stars) as LessonProgressRow['stars'],
      mistakes: Number(args.p_mistakes ?? 0),
      hints_used: Number(args.p_hints_used ?? 0),
      score: args.p_score === null || args.p_score === undefined ? null : Number(args.p_score),
      updated_at: String(args.p_updated_at ?? this.nowIso()),
      completed_at: (args.p_completed_at as string | null | undefined) ?? null,
    });
    const prevRow = this.get<LessonProgressRow>('lesson_progress', { user_id: uid, lesson_id: incoming.lessonId });
    const prev = prevRow ? fromRow.lessonProgress(prevRow) : undefined;
    const merged = mergeLessonProgress(prev, incoming);
    const steps = lessonStepsGained(prev, merged);
    if (steps > 0) this.bumpDaily(uid, dayKeyOf(incoming.updatedAt, this.timeZone), { lessons: steps });
    return this.put('lesson_progress', toRow.lessonProgress(merged, uid) as unknown as Row, prevRow);
  }

  private upsertDailyMinutes(uid: string, date: string, minutes: number): Row {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(minutes) || minutes < 0) {
      throw new FakeServerError(400, 'invalid input for upsert_daily_minutes', '22023');
    }
    const prev = this.get<DailyActivityRow>('daily_activity', { user_id: uid, date });
    const day = prev ? fromRow.dailyActivity(prev) : emptyDay(date);
    day.minutes = Math.max(day.minutes, minutes);
    day.goalReached = day.goalReached || day.minutes >= this.goalMinutes(uid);
    return this.put('daily_activity', toRow.dailyActivity(day, uid) as unknown as Row, prev);
  }
}

function project(row: Row, columns: string): Row {
  const cols = columns.split(',').map((c) => c.trim()).filter(Boolean);
  if (!cols.length || cols.includes('*')) return { ...row };
  return Object.fromEntries(cols.map((c) => [c, row[c]]));
}
