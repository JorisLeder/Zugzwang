-- Zugzwang – privileges and row level security (PRD NFR Sicherheit, P2-05).
--
-- Every table has RLS enabled. Rules:
-- - Static content (`puzzles`, `bots`, `courses`, `lessons`, `lesson_steps`): read-only for `authenticated`;
--   `anon` (no login) may only read the demo puzzles (ids `demo-…`).
-- - User tables: the owner column (`profiles.id`, otherwise `user_id`) must equal `auth.uid()`.
--   - `profiles`, `games`, `game_analyses`, `review_queue`, `lesson_progress`: select / insert / update.
--   - Append-only (`puzzle_attempts`, `game_moves`, `explanation_feedback`): select / insert, no update, no delete.
--   - Derived values: `ratings` select / insert (initial rating only – updates are computed by the server);
--     `daily_activity`, `theme_stats`: select only (written by triggers and RPCs).
--   - `explanation_usage`: select only (written by the `explain` function with the service role).
-- - No delete policies at all: accounts are deleted by the `delete-account` function (service role).
-- Table privileges are granted explicitly on top (defence in depth: what has no grant cannot be reached even if a
-- policy were wrong).

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke all on
  public.puzzles, public.bots, public.courses, public.lessons, public.lesson_steps,
  public.profiles, public.ratings, public.puzzle_attempts, public.review_queue, public.games, public.game_moves,
  public.game_analyses, public.lesson_progress, public.daily_activity, public.theme_stats, public.explanation_usage,
  public.explanation_feedback
from public, anon, authenticated;

grant select on public.puzzles to anon, authenticated;
grant select on public.bots, public.courses, public.lessons, public.lesson_steps to authenticated;

grant select, insert, update on
  public.profiles, public.games, public.game_analyses, public.review_queue, public.lesson_progress
to authenticated;

grant select, insert on public.puzzle_attempts, public.game_moves, public.explanation_feedback, public.ratings
to authenticated;

grant select on public.daily_activity, public.theme_stats, public.explanation_usage to authenticated;

grant all on
  public.puzzles, public.bots, public.courses, public.lessons, public.lesson_steps,
  public.profiles, public.ratings, public.puzzle_attempts, public.review_queue, public.games, public.game_moves,
  public.game_analyses, public.lesson_progress, public.daily_activity, public.theme_stats, public.explanation_usage,
  public.explanation_feedback
to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Row level security on every table
-- ---------------------------------------------------------------------------------------------------------------

alter table public.puzzles enable row level security;
alter table public.bots enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_steps enable row level security;
alter table public.profiles enable row level security;
alter table public.ratings enable row level security;
alter table public.puzzle_attempts enable row level security;
alter table public.review_queue enable row level security;
alter table public.games enable row level security;
alter table public.game_moves enable row level security;
alter table public.game_analyses enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.daily_activity enable row level security;
alter table public.theme_stats enable row level security;
alter table public.explanation_usage enable row level security;
alter table public.explanation_feedback enable row level security;

-- Static content ----------------------------------------------------------------------------------------------

create policy puzzles_select on public.puzzles for select to authenticated using (true);
create policy puzzles_select_demo on public.puzzles for select to anon using (id like 'demo-%');
create policy bots_select on public.bots for select to authenticated using (true);
create policy courses_select on public.courses for select to authenticated using (true);
create policy lessons_select on public.lessons for select to authenticated using (true);
create policy lesson_steps_select on public.lesson_steps for select to authenticated using (true);

-- Profiles (owner column `id`) ----------------------------------------------------------------------------------

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Read / insert / update own rows -------------------------------------------------------------------------------

create policy games_select on public.games for select to authenticated
  using (user_id = (select auth.uid()));
create policy games_insert on public.games for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy games_update on public.games for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy game_analyses_select on public.game_analyses for select to authenticated
  using (user_id = (select auth.uid()));
create policy game_analyses_insert on public.game_analyses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy game_analyses_update on public.game_analyses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy review_queue_select on public.review_queue for select to authenticated
  using (user_id = (select auth.uid()));
create policy review_queue_insert on public.review_queue for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy review_queue_update on public.review_queue for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy lesson_progress_select on public.lesson_progress for select to authenticated
  using (user_id = (select auth.uid()));
create policy lesson_progress_insert on public.lesson_progress for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy lesson_progress_update on public.lesson_progress for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Append-only: read / insert own rows, never update or delete ---------------------------------------------------

create policy puzzle_attempts_select on public.puzzle_attempts for select to authenticated
  using (user_id = (select auth.uid()));
create policy puzzle_attempts_insert on public.puzzle_attempts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy game_moves_select on public.game_moves for select to authenticated
  using (user_id = (select auth.uid()));
-- A move may only be appended to an own game.
create policy game_moves_insert on public.game_moves for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.games g where g.id = game_id and g.user_id = (select auth.uid()))
  );

create policy explanation_feedback_select on public.explanation_feedback for select to authenticated
  using (user_id = (select auth.uid()));
create policy explanation_feedback_insert on public.explanation_feedback for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Server-computed values: read own rows; `ratings` additionally accepts the initial rating ---------------------

create policy ratings_select on public.ratings for select to authenticated
  using (user_id = (select auth.uid()));
create policy ratings_insert on public.ratings for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy daily_activity_select on public.daily_activity for select to authenticated
  using (user_id = (select auth.uid()));

create policy theme_stats_select on public.theme_stats for select to authenticated
  using (user_id = (select auth.uid()));

create policy explanation_usage_select on public.explanation_usage for select to authenticated
  using (user_id = (select auth.uid()));
