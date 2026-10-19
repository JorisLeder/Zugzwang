/**
 * Database contract (snake_case rows) for the Supabase adapter (WP-08) and the SQL migrations (WP-11).
 * Tables = PRD "Datenmodell" + D-29 extras. Column names here are binding for the migrations.
 *
 * Conventions: ids are UUID strings (client-generated for user data), timestamps ISO strings (`timestamptz`),
 * dates `YYYY-MM-DD` (`date`), arrays are Postgres arrays (`text[]`), objects are `jsonb`.
 */
import type { AnalysedMove, GameAnalysis, MoveClassification } from './analysis';
import type { Color, Fen, GameEndReason, GameResult, Uci } from './chess';
import type { BotProfile } from './bots';
import type { ExplanationFeedback, ExplanationText } from './explain';
import type { AssistanceLevel, Game, GameMoveEvent, GameOrigin, GameSource, TimeControl } from './games';
import type { CourseMeta, Lesson, LessonProgress, LessonStep, StageId } from './lessons';
import { DEFAULT_TIME_ZONE, type DailyActivity, type Profile, type ReviewQueueItem, type SelfAssessment, type Settings, type ThemeStat } from './profile';
import type { Puzzle, PuzzleAttempt, PuzzleMode } from './puzzles';
import type { RatingKind, RatingRecord } from './rating';

/** All table names. */
export type TableName =
  | 'profiles'
  | 'ratings'
  | 'puzzles'
  | 'puzzle_attempts'
  | 'review_queue'
  | 'games'
  | 'game_moves'
  | 'game_analyses'
  | 'bots'
  | 'courses'
  | 'lessons'
  | 'lesson_steps'
  | 'lesson_progress'
  | 'daily_activity'
  | 'theme_stats'
  | 'explanation_usage'
  | 'explanation_feedback';

/** All tables (migration order: static tables, then user tables). */
export const TABLE_NAMES: readonly TableName[] = [
  'profiles',
  'ratings',
  'puzzles',
  'puzzle_attempts',
  'review_queue',
  'games',
  'game_moves',
  'game_analyses',
  'bots',
  'courses',
  'lessons',
  'lesson_steps',
  'lesson_progress',
  'daily_activity',
  'theme_stats',
  'explanation_usage',
  'explanation_feedback',
];

/** Tables owned by a user (RLS `owner column = auth.uid()`). */
export const USER_TABLES = [
  'profiles',
  'ratings',
  'puzzle_attempts',
  'review_queue',
  'games',
  'game_moves',
  'game_analyses',
  'lesson_progress',
  'daily_activity',
  'theme_stats',
  'explanation_usage',
  'explanation_feedback',
] as const satisfies readonly TableName[];

/** A user-owned table. */
export type UserTableName = (typeof USER_TABLES)[number];

/** Owner column per user table: `profiles.id` is the auth user id; all other user tables carry `user_id`. */
export const USER_ID_COLUMN: Record<UserTableName, 'id' | 'user_id'> = {
  profiles: 'id',
  ratings: 'user_id',
  puzzle_attempts: 'user_id',
  review_queue: 'user_id',
  games: 'user_id',
  game_moves: 'user_id',
  game_analyses: 'user_id',
  lesson_progress: 'user_id',
  daily_activity: 'user_id',
  theme_stats: 'user_id',
  explanation_usage: 'user_id',
  explanation_feedback: 'user_id',
};

/** Append-only tables: insert only, never update/delete by clients; duplicates (same id) are ignored. */
export const APPEND_ONLY_TABLES = ['puzzle_attempts', 'game_moves', 'explanation_feedback'] as const satisfies readonly TableName[];

/** Static content tables (select-only for clients; seeded from the repository). */
export const STATIC_TABLES = ['puzzles', 'bots', 'courses', 'lessons', 'lesson_steps'] as const satisfies readonly TableName[];

/** `profiles` – PK `id` (= auth user id). */
export interface ProfileRow {
  id: string;
  display_name: string;
  settings: Settings;
  daily_goal_minutes: number;
  self_assessment: SelfAssessment | null;
  onboarding_completed: boolean;
  stage_zero_skipped: boolean;
  /** IANA time zone; the server buckets daily activity by it (invalid names fall back to Europe/Berlin). */
  time_zone: string;
  created_at: string;
  updated_at: string;
}

/** `ratings` – PK `(user_id, kind)`; server-computed in cloud mode (D-28). */
export interface RatingRow {
  user_id: string;
  kind: RatingKind;
  rating: number;
  rd: number;
  volatility: number;
  games_count: number;
  updated_at: string;
}

/** `puzzles` – PK `id`; static. */
export interface PuzzleRow {
  id: string;
  fen: Fen;
  moves: Uci[];
  rating: number;
  rating_deviation: number;
  themes: string[];
  opening_tags: string[];
  popularity: number | null;
  nb_plays: number | null;
  source: Puzzle['source'];
  explanation: ExplanationText | null;
  game_url: string | null;
}

/** `puzzle_attempts` – PK `id` (client UUID), append-only. `rating_before/after` set by the server trigger. */
export interface PuzzleAttemptRow {
  id: string;
  user_id: string;
  puzzle_id: string;
  mode: PuzzleMode;
  solved: boolean;
  first_try: boolean;
  hints_used: 0 | 1 | 2 | 3;
  solution_shown: boolean;
  time_ms: number;
  themes: string[];
  puzzle_rating: number;
  /** Puzzle RD used for the rating update (default 80). */
  puzzle_rd: number;
  rating_before: number | null;
  rating_after: number | null;
  created_at: string;
}

/** `review_queue` – PK `id`. */
export interface ReviewQueueRow {
  id: string;
  user_id: string;
  item_type: ReviewQueueItem['itemType'];
  object_id: string;
  due_at: string;
  interval_days: number;
  updated_at: string;
}

/** `games` – PK `id`, unique `(user_id, source, external_id)`. */
export interface GameRow {
  id: string;
  user_id: string;
  source: GameSource;
  external_id: string | null;
  bot_id: string | null;
  user_color: Color | null;
  assistance: AssistanceLevel | null;
  time_control: TimeControl;
  start_fen: Fen;
  pgn: string;
  headers: Record<string, string>;
  status: Game['status'];
  result: GameResult;
  end_reason: GameEndReason | null;
  origin: GameOrigin;
  active_device_id: string | null;
  active_heartbeat_at: string | null;
  rating_before: number | null;
  rating_after: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

/** `game_moves` – PK `id`, unique `(game_id, seq)`, append-only event log (D-29). */
export interface GameMoveRow {
  id: string;
  game_id: string;
  user_id: string;
  seq: number;
  kind: GameMoveEvent['kind'];
  ply: number;
  uci: Uci | null;
  san: string | null;
  fen_after: Fen | null;
  plies: number | null;
  created_at: string;
}

/** `game_analyses` – PK `game_id`. Per-move data in `moves` (jsonb). */
export interface GameAnalysisRow {
  game_id: string;
  user_id: string;
  engine_id: string;
  engine_version: string;
  depth: number;
  accuracy_white: number;
  accuracy_black: number;
  counts: Record<Color, Record<MoveClassification, number>>;
  moves: AnalysedMove[];
  key_moments: number[];
  eval_graph: Array<{ ply: number; winPctWhite: number }>;
  created_at: string;
}

/** `bots` – PK `id`; static. */
export interface BotRow {
  id: string;
  name: string;
  elo: number;
  avatar: string;
  style: BotProfile['style'];
  style_label_de: string;
  description_de: string;
  engine: BotProfile['engine'];
  repertoire: BotProfile['repertoire'];
  chat: BotProfile['chat'];
}

/** `courses` – PK `id`; static. `order_index` because `order` is an SQL keyword. */
export interface CourseRow {
  id: string;
  stage: StageId;
  order_index: number;
  version: number;
  title_de: string;
  description_de: string;
  status: CourseMeta['status'];
  lesson_ids: string[];
  test_lesson_id: string | null;
}

/** `lessons` – PK `id`; static. Steps are in `lesson_steps`. */
export interface LessonRow {
  id: string;
  course_id: string;
  order_index: number;
  version: number;
  kind: Lesson['kind'];
  title_de: string;
  summary_de: string;
  practice_themes: string[];
  pass_threshold: number | null;
  sources: string[];
}

/** `lesson_steps` – PK `(lesson_id, step_index)`; `content` is the full step object. */
export interface LessonStepRow {
  lesson_id: string;
  step_index: number;
  step_id: string;
  type: LessonStep['type'];
  content: LessonStep;
}

/** `lesson_progress` – PK `(user_id, lesson_id)`; furthest progress wins (RPC `upsert_lesson_progress`). */
export interface LessonProgressRow {
  user_id: string;
  lesson_id: string;
  lesson_version: number;
  current_step: number;
  completed: boolean;
  stars: 0 | 1 | 2 | 3;
  mistakes: number;
  hints_used: number;
  score: number | null;
  updated_at: string;
  completed_at: string | null;
}

/** `daily_activity` – PK `(user_id, date)`. */
export interface DailyActivityRow {
  user_id: string;
  date: string;
  minutes: number;
  puzzles: number;
  games: number;
  lessons: number;
  goal_reached: boolean;
}

/** `theme_stats` – PK `(user_id, theme)`. */
export interface ThemeStatRow {
  user_id: string;
  theme: string;
  attempts: number;
  successes: number;
}

/** `explanation_usage` – PK `(user_id, date)`; written only by the `explain` function (rate limit 200/day). */
export interface ExplanationUsageRow {
  user_id: string;
  date: string;
  count: number;
}

/** `explanation_feedback` – PK `id`, append-only. */
export interface ExplanationFeedbackRow {
  id: string;
  user_id: string;
  context: ExplanationFeedback['context'];
  ref: string;
  vote: 1 | -1;
  created_at: string;
}

/** Row type per table. */
export interface TableRows {
  profiles: ProfileRow;
  ratings: RatingRow;
  puzzles: PuzzleRow;
  puzzle_attempts: PuzzleAttemptRow;
  review_queue: ReviewQueueRow;
  games: GameRow;
  game_moves: GameMoveRow;
  game_analyses: GameAnalysisRow;
  bots: BotRow;
  courses: CourseRow;
  lessons: LessonRow;
  lesson_steps: LessonStepRow;
  lesson_progress: LessonProgressRow;
  daily_activity: DailyActivityRow;
  theme_stats: ThemeStatRow;
  explanation_usage: ExplanationUsageRow;
  explanation_feedback: ExplanationFeedbackRow;
}

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
const orUndef = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

/** Entity → row mappers. User-owned entities take the owner's user id. */
export const toRow = {
  profile: (p: Profile): ProfileRow => ({
    id: p.id,
    display_name: p.displayName,
    settings: p.settings,
    daily_goal_minutes: p.dailyGoalMinutes,
    self_assessment: p.selfAssessment,
    onboarding_completed: p.onboardingCompleted,
    stage_zero_skipped: p.stageZeroSkipped,
    time_zone: p.timeZone || DEFAULT_TIME_ZONE,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }),
  rating: (r: RatingRecord, userId: string): RatingRow => ({
    user_id: userId,
    kind: r.kind,
    rating: r.rating,
    rd: r.rd,
    volatility: r.volatility,
    games_count: r.gamesCount,
    updated_at: r.updatedAt,
  }),
  puzzle: (p: Puzzle): PuzzleRow => ({
    id: p.id,
    fen: p.fen,
    moves: p.moves,
    rating: p.rating,
    rating_deviation: p.ratingDeviation,
    themes: p.themes,
    opening_tags: p.openingTags,
    popularity: orNull(p.popularity),
    nb_plays: orNull(p.nbPlays),
    source: p.source,
    explanation: orNull(p.explanation),
    game_url: orNull(p.gameUrl),
  }),
  puzzleAttempt: (a: PuzzleAttempt, userId: string, puzzleRd: number): PuzzleAttemptRow => ({
    id: a.id,
    user_id: userId,
    puzzle_id: a.puzzleId,
    mode: a.mode,
    solved: a.solved,
    first_try: a.firstTry,
    hints_used: a.hintsUsed,
    solution_shown: a.solutionShown,
    time_ms: a.timeMs,
    themes: a.themes,
    puzzle_rating: a.puzzleRating,
    puzzle_rd: puzzleRd,
    rating_before: orNull(a.ratingBefore),
    rating_after: orNull(a.ratingAfter),
    created_at: a.createdAt,
  }),
  reviewQueueItem: (i: ReviewQueueItem, userId: string, updatedAt: string): ReviewQueueRow => ({
    id: i.id,
    user_id: userId,
    item_type: i.itemType,
    object_id: i.objectId,
    due_at: i.dueAt,
    interval_days: i.intervalDays,
    updated_at: updatedAt,
  }),
  game: (g: Game, userId: string): GameRow => ({
    id: g.id,
    user_id: userId,
    source: g.source,
    external_id: g.externalId,
    bot_id: g.botId,
    user_color: g.userColor,
    assistance: g.assistance,
    time_control: g.timeControl,
    start_fen: g.startFen,
    pgn: g.pgn,
    headers: g.headers,
    status: g.status,
    result: g.result,
    end_reason: g.endReason,
    origin: g.origin,
    active_device_id: g.activeDeviceId,
    active_heartbeat_at: g.activeHeartbeatAt,
    rating_before: g.ratingBefore,
    rating_after: g.ratingAfter,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
    finished_at: g.finishedAt,
  }),
  gameMove: (e: GameMoveEvent, userId: string): GameMoveRow => ({
    id: e.id,
    game_id: e.gameId,
    user_id: userId,
    seq: e.seq,
    kind: e.kind,
    ply: e.ply,
    uci: orNull(e.uci),
    san: orNull(e.san),
    fen_after: orNull(e.fenAfter),
    plies: orNull(e.plies),
    created_at: e.createdAt,
  }),
  gameAnalysis: (a: GameAnalysis, userId: string): GameAnalysisRow => ({
    game_id: a.gameId,
    user_id: userId,
    engine_id: a.engineId,
    engine_version: a.engineVersion,
    depth: a.depth,
    accuracy_white: a.accuracy.w,
    accuracy_black: a.accuracy.b,
    counts: a.counts,
    moves: a.moves,
    key_moments: a.keyMoments,
    eval_graph: a.evalGraph,
    created_at: a.createdAt,
  }),
  bot: (b: BotProfile): BotRow => ({
    id: b.id,
    name: b.name,
    elo: b.elo,
    avatar: b.avatar,
    style: b.style,
    style_label_de: b.styleLabelDe,
    description_de: b.descriptionDe,
    engine: b.engine,
    repertoire: b.repertoire,
    chat: b.chat,
  }),
  course: (c: CourseMeta): CourseRow => ({
    id: c.id,
    stage: c.stage,
    order_index: c.order,
    version: c.version,
    title_de: c.titleDe,
    description_de: c.descriptionDe,
    status: c.status,
    lesson_ids: c.lessonIds,
    test_lesson_id: orNull(c.testLessonId),
  }),
  lesson: (l: Lesson): LessonRow => ({
    id: l.id,
    course_id: l.courseId,
    order_index: l.order,
    version: l.version,
    kind: l.kind,
    title_de: l.titleDe,
    summary_de: l.summaryDe,
    practice_themes: l.practiceThemes,
    pass_threshold: orNull(l.passThreshold),
    sources: l.sources ?? [],
  }),
  lessonSteps: (l: Lesson): LessonStepRow[] =>
    l.steps.map((s, i) => ({ lesson_id: l.id, step_index: i, step_id: s.id, type: s.type, content: s })),
  lessonProgress: (p: LessonProgress, userId: string): LessonProgressRow => ({
    user_id: userId,
    lesson_id: p.lessonId,
    lesson_version: p.lessonVersion,
    current_step: p.currentStep,
    completed: p.completed,
    stars: p.stars,
    mistakes: p.mistakes,
    hints_used: p.hintsUsed,
    score: orNull(p.score),
    updated_at: p.updatedAt,
    completed_at: p.completedAt,
  }),
  dailyActivity: (d: DailyActivity, userId: string): DailyActivityRow => ({
    user_id: userId,
    date: d.date,
    minutes: d.minutes,
    puzzles: d.puzzles,
    games: d.games,
    lessons: d.lessons,
    goal_reached: d.goalReached,
  }),
  themeStat: (t: ThemeStat, userId: string): ThemeStatRow => ({
    user_id: userId,
    theme: t.theme,
    attempts: t.attempts,
    successes: t.successes,
  }),
  explanationFeedback: (f: ExplanationFeedback, userId: string): ExplanationFeedbackRow => ({
    id: f.id,
    user_id: userId,
    context: f.context,
    ref: f.ref,
    vote: f.vote,
    created_at: f.createdAt,
  }),
};

/** Row → entity mappers (inverse of `toRow`). `rating` takes the `provisional` flag the client wants to show. */
export const fromRow = {
  profile: (r: ProfileRow): Profile => ({
    id: r.id,
    displayName: r.display_name,
    settings: r.settings,
    dailyGoalMinutes: r.daily_goal_minutes,
    selfAssessment: r.self_assessment,
    onboardingCompleted: r.onboarding_completed,
    stageZeroSkipped: r.stage_zero_skipped,
    timeZone: r.time_zone || DEFAULT_TIME_ZONE,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  rating: (r: RatingRow, provisional = false): RatingRecord => ({
    kind: r.kind,
    rating: r.rating,
    rd: r.rd,
    volatility: r.volatility,
    gamesCount: r.games_count,
    updatedAt: r.updated_at,
    provisional,
  }),
  puzzle: (r: PuzzleRow): Puzzle => ({
    id: r.id,
    fen: r.fen,
    moves: r.moves,
    rating: r.rating,
    ratingDeviation: r.rating_deviation,
    themes: r.themes,
    openingTags: r.opening_tags,
    popularity: orUndef(r.popularity),
    nbPlays: orUndef(r.nb_plays),
    source: r.source,
    explanation: orUndef(r.explanation),
    gameUrl: orUndef(r.game_url),
  }),
  puzzleAttempt: (r: PuzzleAttemptRow): PuzzleAttempt => ({
    id: r.id,
    puzzleId: r.puzzle_id,
    mode: r.mode,
    solved: r.solved,
    firstTry: r.first_try,
    hintsUsed: r.hints_used,
    solutionShown: r.solution_shown,
    timeMs: r.time_ms,
    themes: r.themes,
    puzzleRating: r.puzzle_rating,
    ratingBefore: orUndef(r.rating_before),
    ratingAfter: orUndef(r.rating_after),
    createdAt: r.created_at,
  }),
  reviewQueueItem: (r: ReviewQueueRow): ReviewQueueItem => ({
    id: r.id,
    itemType: r.item_type,
    objectId: r.object_id,
    dueAt: r.due_at,
    intervalDays: r.interval_days,
  }),
  game: (r: GameRow): Game => ({
    id: r.id,
    source: r.source,
    externalId: r.external_id,
    botId: r.bot_id,
    userColor: r.user_color,
    assistance: r.assistance,
    timeControl: r.time_control,
    startFen: r.start_fen,
    pgn: r.pgn,
    headers: r.headers,
    status: r.status,
    result: r.result,
    endReason: r.end_reason,
    origin: r.origin,
    activeDeviceId: r.active_device_id,
    activeHeartbeatAt: r.active_heartbeat_at,
    ratingBefore: r.rating_before,
    ratingAfter: r.rating_after,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    finishedAt: r.finished_at,
  }),
  gameMove: (r: GameMoveRow): GameMoveEvent => ({
    id: r.id,
    gameId: r.game_id,
    seq: r.seq,
    kind: r.kind,
    ply: r.ply,
    uci: orUndef(r.uci),
    san: orUndef(r.san),
    fenAfter: orUndef(r.fen_after),
    plies: orUndef(r.plies),
    createdAt: r.created_at,
  }),
  gameAnalysis: (r: GameAnalysisRow): GameAnalysis => ({
    gameId: r.game_id,
    engineId: r.engine_id,
    engineVersion: r.engine_version,
    depth: r.depth,
    createdAt: r.created_at,
    accuracy: { w: r.accuracy_white, b: r.accuracy_black },
    counts: r.counts,
    moves: r.moves,
    keyMoments: r.key_moments,
    evalGraph: r.eval_graph,
  }),
  bot: (r: BotRow): BotProfile => ({
    id: r.id,
    name: r.name,
    elo: r.elo,
    avatar: r.avatar,
    style: r.style,
    styleLabelDe: r.style_label_de,
    descriptionDe: r.description_de,
    engine: r.engine,
    repertoire: r.repertoire,
    chat: r.chat,
  }),
  course: (r: CourseRow): CourseMeta => ({
    id: r.id,
    stage: r.stage,
    order: r.order_index,
    version: r.version,
    titleDe: r.title_de,
    descriptionDe: r.description_de,
    status: r.status,
    lessonIds: r.lesson_ids,
    testLessonId: orUndef(r.test_lesson_id),
  }),
  lesson: (r: LessonRow, steps: LessonStepRow[]): Lesson => ({
    id: r.id,
    courseId: r.course_id,
    order: r.order_index,
    version: r.version,
    kind: r.kind,
    titleDe: r.title_de,
    summaryDe: r.summary_de,
    steps: [...steps].sort((a, b) => a.step_index - b.step_index).map((s) => s.content),
    practiceThemes: r.practice_themes,
    passThreshold: orUndef(r.pass_threshold),
    sources: r.sources,
  }),
  lessonProgress: (r: LessonProgressRow): LessonProgress => ({
    lessonId: r.lesson_id,
    lessonVersion: r.lesson_version,
    currentStep: r.current_step,
    completed: r.completed,
    stars: r.stars,
    mistakes: r.mistakes,
    hintsUsed: r.hints_used,
    score: orUndef(r.score),
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  }),
  dailyActivity: (r: DailyActivityRow): DailyActivity => ({
    date: r.date,
    minutes: r.minutes,
    puzzles: r.puzzles,
    games: r.games,
    lessons: r.lessons,
    goalReached: r.goal_reached,
  }),
  themeStat: (r: ThemeStatRow): ThemeStat => ({ theme: r.theme, attempts: r.attempts, successes: r.successes }),
  explanationFeedback: (r: ExplanationFeedbackRow): ExplanationFeedback => ({
    id: r.id,
    context: r.context,
    ref: r.ref,
    vote: r.vote,
    createdAt: r.created_at,
  }),
};
