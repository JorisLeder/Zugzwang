-- Zugzwang – schema (tables of `src/core/tables.ts`; column names are binding for the client mappers).
--
-- Static content tables are seeded from the repository (`npm run supabase:seed-content`, `supabase/seed/puzzles.csv`).
-- User tables carry the owner column (`profiles.id`, otherwise `user_id`) referencing `auth.users` with
-- `on delete cascade`, so deleting the auth user can never leave data behind.
-- Ids of user rows are client UUIDs (idempotent sync); timestamps `timestamptz`, dates `date`, arrays `text[]`,
-- objects `jsonb`.

-- ---------------------------------------------------------------------------------------------------------------
-- Static content
-- ---------------------------------------------------------------------------------------------------------------

create table public.puzzles (
  id text primary key,
  fen text not null,
  moves text[] not null,
  rating integer not null,
  rating_deviation double precision not null default 80,
  themes text[] not null default '{}',
  opening_tags text[] not null default '{}',
  popularity double precision,
  nb_plays integer,
  source text not null check (source in ('lichess', 'generated', 'lesson', 'seed')),
  explanation jsonb,
  game_url text
);

-- Puzzle selection: rating window, "any of these themes", opening tag.
create index puzzles_rating_idx on public.puzzles (rating, id);
create index puzzles_themes_idx on public.puzzles using gin (themes);
create index puzzles_opening_tags_idx on public.puzzles using gin (opening_tags);

create table public.bots (
  id text primary key,
  name text not null,
  elo integer not null,
  avatar text not null,
  style text not null,
  style_label_de text not null,
  description_de text not null,
  engine jsonb not null,
  repertoire jsonb not null,
  chat jsonb not null
);

create table public.courses (
  id text primary key,
  stage smallint not null check (stage between 0 and 4),
  order_index integer not null,
  version integer not null check (version >= 1),
  title_de text not null,
  description_de text not null,
  status text not null check (status in ('available', 'planned')),
  lesson_ids text[] not null default '{}',
  test_lesson_id text
);

create table public.lessons (
  id text primary key,
  course_id text not null references public.courses (id) on delete cascade,
  order_index integer not null,
  version integer not null check (version >= 1),
  kind text not null check (kind in ('lesson', 'course_test', 'skip_test')),
  title_de text not null,
  summary_de text not null,
  practice_themes text[] not null default '{}',
  pass_threshold double precision,
  sources text[] not null default '{}'
);

create index lessons_course_idx on public.lessons (course_id, order_index);

create table public.lesson_steps (
  lesson_id text not null references public.lessons (id) on delete cascade,
  step_index integer not null check (step_index >= 0),
  step_id text not null,
  type text not null,
  content jsonb not null,
  primary key (lesson_id, step_index)
);

-- ---------------------------------------------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  settings jsonb not null default '{}',
  daily_goal_minutes integer not null default 20 check (daily_goal_minutes between 1 and 1440),
  self_assessment text check (self_assessment in ('newcomer', 'beginner', 'club', 'advanced')),
  onboarding_completed boolean not null default false,
  stage_zero_skipped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Glicko-2 values, computed by the server (triggers in `…_derived.sql`). Clients may only insert the initial rating.
create table public.ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('puzzle', 'bot', 'rush_3', 'rush_5', 'survival')),
  rating double precision not null,
  rd double precision not null check (rd > 0),
  volatility double precision not null check (volatility > 0),
  games_count integer not null default 0 check (games_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- Append-only. `rating_before/after` are set by the server trigger (client values are ignored).
-- `puzzle_id` has no foreign key: attempts must never fail because a puzzle is not seeded (yet).
create table public.puzzle_attempts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  puzzle_id text not null,
  mode text not null check (mode in ('rated', 'learning', 'theme', 'demo', 'daily', 'review', 'rush_3', 'rush_5', 'survival')),
  solved boolean not null,
  first_try boolean not null,
  hints_used smallint not null check (hints_used between 0 and 3),
  solution_shown boolean not null,
  time_ms integer not null check (time_ms >= 0),
  themes text[] not null default '{}',
  puzzle_rating double precision not null,
  puzzle_rd double precision not null default 80,
  rating_before double precision,
  rating_after double precision,
  created_at timestamptz not null default now()
);

create index puzzle_attempts_user_idx on public.puzzle_attempts (user_id, created_at);

create table public.review_queue (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('puzzle', 'own_mistake')),
  object_id text not null,
  due_at timestamptz not null,
  interval_days double precision not null check (interval_days >= 0),
  updated_at timestamptz not null default now()
);

create index review_queue_user_due_idx on public.review_queue (user_id, due_at);

create table public.games (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('bot', 'pgn', 'chesscom', 'lichess')),
  external_id text,
  bot_id text,
  user_color text check (user_color in ('w', 'b')),
  assistance text check (assistance in ('competition', 'training', 'coach')),
  time_control jsonb not null default '{"kind": "none"}',
  start_fen text not null,
  pgn text not null default '',
  headers jsonb not null default '{}',
  status text not null check (status in ('active', 'finished', 'aborted')),
  result text not null check (result in ('1-0', '0-1', '1/2-1/2', '*')),
  end_reason text check (end_reason in (
    'checkmate', 'stalemate', 'insufficient_material', 'fivefold_repetition', 'seventyfive_moves',
    'threefold_repetition_claim', 'fifty_moves_claim', 'resignation', 'timeout', 'timeout_vs_insufficient_material',
    'aborted'
  )),
  origin jsonb not null default '{"type": "new"}',
  active_device_id text,
  active_heartbeat_at timestamptz,
  rating_before double precision,
  rating_after double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  -- The external id prevents duplicate imports (P2-01); bot games have none (NULLs never conflict).
  constraint games_user_source_external_id_key unique (user_id, source, external_id)
);

create index games_user_updated_idx on public.games (user_id, updated_at desc);

-- Append-only event log of a game (D-29): moves and takebacks, never updated or deleted by clients.
create table public.game_moves (
  id uuid primary key,
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seq integer not null check (seq >= 1),
  kind text not null check (kind in ('move', 'takeback')),
  ply integer not null check (ply >= 0),
  uci text,
  san text,
  fen_after text,
  plies integer check (plies >= 0),
  created_at timestamptz not null default now(),
  constraint game_moves_game_id_seq_key unique (game_id, seq)
);

create index game_moves_user_idx on public.game_moves (user_id);

-- No foreign key to `games`: an analysis may reach the server before its game (outbox order across devices).
create table public.game_analyses (
  game_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  engine_id text not null,
  engine_version text not null,
  depth integer not null,
  accuracy_white double precision not null,
  accuracy_black double precision not null,
  counts jsonb not null,
  moves jsonb not null,
  key_moments integer[] not null default '{}',
  eval_graph jsonb not null,
  created_at timestamptz not null default now()
);

create index game_analyses_user_idx on public.game_analyses (user_id);

-- Furthest progress wins (RPC `upsert_lesson_progress`).
create table public.lesson_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_id text not null,
  lesson_version integer not null default 1,
  current_step integer not null default 0 check (current_step >= 0),
  completed boolean not null default false,
  stars smallint not null default 0 check (stars between 0 and 3),
  mistakes integer not null default 0 check (mistakes >= 0),
  hints_used integer not null default 0 check (hints_used >= 0),
  score double precision,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

-- Basis of streak and statistics, computed by the server (days in Europe/Berlin).
create table public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  minutes integer not null default 0 check (minutes >= 0),
  puzzles integer not null default 0 check (puzzles >= 0),
  games integer not null default 0 check (games >= 0),
  lessons integer not null default 0 check (lessons >= 0),
  goal_reached boolean not null default false,
  primary key (user_id, date)
);

-- Basis of the weakness profile, computed by the server.
create table public.theme_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  theme text not null,
  attempts integer not null default 0 check (attempts >= 0),
  successes integer not null default 0 check (successes >= 0),
  primary key (user_id, theme)
);

-- Rate limit of the `explain` function (200 per user and day); written only by the function (service role).
create table public.explanation_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, date)
);

-- Thumbs up/down under explanations. Append-only.
create table public.explanation_feedback (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  context text not null check (context in ('analysis', 'coach', 'puzzle')),
  ref text not null,
  vote smallint not null check (vote in (1, -1)),
  created_at timestamptz not null default now()
);

create index explanation_feedback_user_idx on public.explanation_feedback (user_id);
