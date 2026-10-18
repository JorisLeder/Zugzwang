-- Zugzwang – server-side derived values (PRD "So wird reaktiv umgesetzt" 3 and 5, D-28).
--
-- The server is the single source of truth for ratings, daily activity and theme statistics. The rules are the
-- ones of `src/data/progress/rules.ts` (client, sync merge and fake backend use the same module):
-- - Puzzle rating: rated attempts only; one Glicko-2 rating period per attempt against the puzzle's rating and RD
--   (default 80); solved without hint and without the solution shown = 1, otherwise 0.
-- - Theme stats: rated, learning and theme attempts; a success is a first-try solve without hint or solution.
-- - Bot rating: finished `competition` bot games only; opponent = the bot's Elo from the game headers, RD 50.
-- - Daily activity (days in Europe/Berlin): +1 puzzle per attempt, +1 game per finished bot game, + completed
--   lesson steps; active minutes via `upsert_daily_minutes` (greatest value wins).
-- - Lesson progress: furthest progress wins (`upsert_lesson_progress`).
-- - Profile: last writer wins – settings by `settings.updatedAt`, the other fields by `updated_at`.
-- - Games: newer `updated_at` wins, a finished game never becomes active again, the device fields win by the newer
--   heartbeat; `rating_before/after` are always the server's values.
-- - Duplicates (same client id) are ignored: the insert triggers skip rows that exist already, so a resent attempt
--   never counts twice. All derived writes of one user are serialised with a transaction advisory lock.
--
-- Glicko-2 is the algorithm of `src/lib/rating/glicko2.ts` (Glickman's steps 1–8, Illinois algorithm for σ′,
-- τ 0.5, RD clamped to [45, 350], ε 1e-6); parity is tested in `supabase/tests/glicko2.test.ts`.

-- ---------------------------------------------------------------------------------------------------------------
-- Glicko-2
-- ---------------------------------------------------------------------------------------------------------------

-- exp() that saturates instead of raising an under-/overflow error (JavaScript semantics).
create function public.zz_exp(x double precision) returns double precision
language sql immutable parallel safe set search_path = ''
as $$ select case when x < -745 then 0::double precision when x > 709 then 'Infinity'::double precision else exp(x) end $$;

-- f(x) of Glickman's step 5.
create function public.zz_glicko2_f(
  x double precision, delta double precision, phi double precision, v double precision, a double precision,
  tau double precision
) returns double precision
language sql immutable parallel safe set search_path = ''
as $$
  select (public.zz_exp(x) * (delta * delta - phi * phi - v - public.zz_exp(x)))
           / (2 * (phi * phi + v + public.zz_exp(x)) * (phi * phi + v + public.zz_exp(x)))
         - (x - a) / (tau * tau)
$$;

-- One rating period. Arrays: opponent ratings, opponent RDs and scores (1 / 0.5 / 0), same length.
create function public.glicko2_update(
  p_rating double precision,
  p_rd double precision,
  p_volatility double precision,
  p_opponent_ratings double precision[],
  p_opponent_rds double precision[],
  p_scores double precision[],
  p_tau double precision default 0.5,
  p_min_rd double precision default 45,
  p_max_rd double precision default 350,
  p_epsilon double precision default 0.000001,
  out rating double precision,
  out rd double precision,
  out volatility double precision
)
language plpgsql immutable parallel safe set search_path = ''
as $$
declare
  scale constant double precision := 173.7178;
  mu double precision := (p_rating - 1500) / scale;
  phi double precision := p_rd / scale;
  sigma double precision := p_volatility;
  n integer := coalesce(array_length(p_scores, 1), 0);
  v_inv double precision := 0;
  delta_sum double precision := 0;
  mu_j double precision;
  phi_j double precision;
  g_j double precision;
  e double precision;
  v double precision;
  delta double precision;
  a double precision;
  big_a double precision;
  big_b double precision;
  big_c double precision;
  f_a double precision;
  f_b double precision;
  f_c double precision;
  k integer;
  guard integer := 0;
  sigma_new double precision;
  phi_star double precision;
  phi_new double precision;
  mu_new double precision;
begin
  if coalesce(array_length(p_opponent_ratings, 1), 0) <> n or coalesce(array_length(p_opponent_rds, 1), 0) <> n then
    raise exception 'glicko2_update: arrays must have the same length' using errcode = '22023';
  end if;

  if n = 0 then
    phi_star := sqrt(phi * phi + sigma * sigma);
    rating := p_rating;
    rd := least(p_max_rd, greatest(p_min_rd, phi_star * scale));
    volatility := sigma;
    return;
  end if;

  -- Steps 3 and 4: estimated variance and improvement.
  for i in 1 .. n loop
    mu_j := (p_opponent_ratings[i] - 1500) / scale;
    phi_j := p_opponent_rds[i] / scale;
    g_j := 1 / sqrt(1 + (3 * phi_j * phi_j) / (pi() * pi()));
    e := 1 / (1 + public.zz_exp(-g_j * (mu - mu_j)));
    v_inv := v_inv + g_j * g_j * e * (1 - e);
    delta_sum := delta_sum + g_j * (p_scores[i] - e);
  end loop;
  v := 1 / v_inv;
  delta := v * delta_sum;

  -- Step 5: new volatility (Illinois algorithm).
  a := ln(sigma * sigma);
  big_a := a;
  if delta * delta > phi * phi + v then
    big_b := ln(delta * delta - phi * phi - v);
  else
    k := 1;
    while public.zz_glicko2_f(a - k * p_tau, delta, phi, v, a, p_tau) < 0 loop
      k := k + 1;
    end loop;
    big_b := a - k * p_tau;
  end if;
  f_a := public.zz_glicko2_f(big_a, delta, phi, v, a, p_tau);
  f_b := public.zz_glicko2_f(big_b, delta, phi, v, a, p_tau);
  while abs(big_b - big_a) > p_epsilon and guard < 1000 loop
    big_c := big_a + ((big_a - big_b) * f_a) / (f_b - f_a);
    f_c := public.zz_glicko2_f(big_c, delta, phi, v, a, p_tau);
    if f_c * f_b <= 0 then
      big_a := big_b;
      f_a := f_b;
    else
      f_a := f_a / 2;
    end if;
    big_b := big_c;
    f_b := f_c;
    guard := guard + 1;
  end loop;
  sigma_new := exp(big_a / 2);

  -- Steps 6–8.
  phi_star := sqrt(phi * phi + sigma_new * sigma_new);
  phi_new := 1 / sqrt(1 / (phi_star * phi_star) + 1 / v);
  mu_new := mu + phi_new * phi_new * delta_sum;

  rating := scale * mu_new + 1500;
  rd := least(p_max_rd, greatest(p_min_rd, scale * phi_new));
  volatility := sigma_new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------------

-- Calendar day of a timestamp in the app's time zone.
create function public.zz_local_day(ts timestamptz) returns date
language sql stable parallel safe set search_path = ''
as $$ select (ts at time zone 'Europe/Berlin')::date $$;

-- Serialises the derived writes of one user (held until the end of the transaction).
create function public.zz_lock_user(p_user_id uuid) returns void
language sql volatile set search_path = ''
as $$ select pg_advisory_xact_lock(hashtextextended(p_user_id::text, 20261018)) $$;

-- Daily goal of the user (default 20 minutes).
create function public.zz_goal_minutes(p_user_id uuid) returns integer
language sql stable set search_path = ''
as $$ select coalesce((select p.daily_goal_minutes from public.profiles p where p.id = p_user_id), 20) $$;

-- Adds counts to one day (creating it) and recomputes `goal_reached` (`addToDay`).
create function public.zz_bump_daily(
  p_user_id uuid, p_date date, p_puzzles integer default 0, p_games integer default 0, p_lessons integer default 0
) returns void
language plpgsql volatile set search_path = ''
as $$
declare
  goal integer := public.zz_goal_minutes(p_user_id);
begin
  insert into public.daily_activity as d (user_id, date, minutes, puzzles, games, lessons, goal_reached)
  values (p_user_id, p_date, 0, p_puzzles, p_games, p_lessons, 0 >= goal)
  on conflict (user_id, date) do update
    set puzzles = d.puzzles + excluded.puzzles,
        games = d.games + excluded.games,
        lessons = d.lessons + excluded.lessons,
        goal_reached = d.minutes >= goal;
end;
$$;

-- Rates one result for `kind` (creating the rating with the generic defaults) and returns the rating before/after.
create function public.zz_rate(
  p_user_id uuid, p_kind text, p_opponent_rating double precision, p_opponent_rd double precision,
  p_score double precision, out rating_before double precision, out rating_after double precision
)
language plpgsql volatile set search_path = ''
as $$
declare
  cur public.ratings%rowtype;
  nxt record;
begin
  select * into cur from public.ratings r where r.user_id = p_user_id and r.kind = p_kind for update;
  if not found then
    cur.rating := 1500;
    cur.rd := 350;
    cur.volatility := 0.06;
    cur.games_count := 0;
  end if;
  select * into nxt from public.glicko2_update(
    cur.rating, cur.rd, cur.volatility, array[p_opponent_rating], array[p_opponent_rd], array[p_score]
  );
  insert into public.ratings as r (user_id, kind, rating, rd, volatility, games_count, updated_at)
  values (p_user_id, p_kind, nxt.rating, nxt.rd, nxt.volatility, cur.games_count + 1, now())
  on conflict (user_id, kind) do update
    set rating = excluded.rating,
        rd = excluded.rd,
        volatility = excluded.volatility,
        games_count = excluded.games_count,
        updated_at = excluded.updated_at;
  rating_before := cur.rating;
  rating_after := nxt.rating;
end;
$$;

-- `Number(text)` of JavaScript for positive decimal numbers; NULL when the text is not a number.
create function public.zz_to_number(t text) returns double precision
language sql immutable parallel safe set search_path = ''
as $$
  select case when t ~ '^\s*\+?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$' then trim(t)::double precision end
$$;

-- Bot Elo of a game (the Elo tag of the bot's colour), NULL if missing (`botOpponentElo`).
create function public.zz_bot_opponent_elo(p_headers jsonb, p_user_color text) returns double precision
language sql immutable parallel safe set search_path = ''
as $$
  select case
    when p_user_color is null then null
    when public.zz_to_number(p_headers ->> (case when p_user_color = 'w' then 'BlackElo' else 'WhiteElo' end)) > 0
      then public.zz_to_number(p_headers ->> (case when p_user_color = 'w' then 'BlackElo' else 'WhiteElo' end))
  end
$$;

-- Applies the effects of a game that just finished: bot rating (rated competition games) and daily activity.
create function public.zz_on_game_finished(g public.games) returns public.games
language plpgsql volatile set search_path = ''
as $$
declare
  elo double precision := public.zz_bot_opponent_elo(g.headers, g.user_color);
  score double precision;
  r record;
begin
  g.rating_before := null;
  g.rating_after := null;
  if g.source = 'bot' and g.assistance = 'competition' and g.user_color is not null and g.result <> '*'
     and elo is not null then
    score := case
      when g.result = '1/2-1/2' then 0.5
      when (g.result = '1-0') = (g.user_color = 'w') then 1
      else 0
    end;
    select * into r from public.zz_rate(g.user_id, 'bot', elo, 50, score);
    g.rating_before := r.rating_before;
    g.rating_after := r.rating_after;
  end if;
  -- Imported games (PGN, V2 imports) are not games played today.
  if g.source = 'bot' then
    perform public.zz_bump_daily(g.user_id, public.zz_local_day(coalesce(g.finished_at, now())), p_games => 1);
  end if;
  return g;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- puzzle_attempts: rating, theme stats, daily activity
-- ---------------------------------------------------------------------------------------------------------------

create function public.zz_puzzle_attempts_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  success boolean;
begin
  perform public.zz_lock_user(new.user_id);
  -- Duplicate id (resent from an outbox): skip the row – no effect counts twice.
  if exists (select 1 from public.puzzle_attempts a where a.id = new.id) then
    return null;
  end if;

  new.rating_before := null;
  new.rating_after := null;
  if new.mode = 'rated' then
    select * into r from public.zz_rate(
      new.user_id,
      'puzzle',
      new.puzzle_rating,
      coalesce(nullif(new.puzzle_rd, 0), 80),
      case when new.solved and new.hints_used = 0 and not new.solution_shown then 1 else 0 end
    );
    new.rating_before := r.rating_before;
    new.rating_after := r.rating_after;
  end if;

  if new.mode in ('rated', 'learning', 'theme') then
    success := new.solved and new.first_try and new.hints_used = 0 and not new.solution_shown;
    insert into public.theme_stats as s (user_id, theme, attempts, successes)
    select new.user_id, t.theme, 1, case when success then 1 else 0 end
    from (select distinct unnest(new.themes) as theme) t
    on conflict (user_id, theme) do update
      set attempts = s.attempts + 1,
          successes = s.successes + excluded.successes;
  end if;

  perform public.zz_bump_daily(new.user_id, public.zz_local_day(new.created_at), p_puzzles => 1);
  return new;
end;
$$;

create trigger puzzle_attempts_before_insert
  before insert on public.puzzle_attempts
  for each row execute function public.zz_puzzle_attempts_before_insert();

-- ---------------------------------------------------------------------------------------------------------------
-- games: merge rules and bot rating
-- ---------------------------------------------------------------------------------------------------------------

create function public.zz_games_before_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.zz_lock_user(new.user_id);
  -- An upsert of an existing game continues as an update (the update trigger merges); no effects here.
  if exists (select 1 from public.games g where g.id = new.id) then
    return new;
  end if;
  if new.status = 'finished' and new.result <> '*' then
    return public.zz_on_game_finished(new);
  end if;
  new.rating_before := null;
  new.rating_after := null;
  return new;
end;
$$;

create trigger games_before_insert
  before insert on public.games
  for each row execute function public.zz_games_before_insert();

create function public.zz_games_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  merged public.games;
  device public.games;
begin
  perform public.zz_lock_user(old.user_id);
  -- `mergeGame`: a finished game never becomes active again, otherwise the newer version wins (ties: incoming).
  if old.status <> 'active' and new.status = 'active' then
    merged := old;
  elsif new.status <> 'active' and old.status = 'active' then
    merged := new;
  elsif new.updated_at >= old.updated_at then
    merged := new;
  else
    merged := old;
  end if;
  -- The device fields win by the newer heartbeat (ties: incoming).
  if coalesce(new.active_heartbeat_at, '-infinity') >= coalesce(old.active_heartbeat_at, '-infinity') then
    device := new;
  else
    device := old;
  end if;
  merged.id := old.id;
  merged.user_id := old.user_id;
  merged.active_device_id := device.active_device_id;
  merged.active_heartbeat_at := device.active_heartbeat_at;
  merged.created_at := least(old.created_at, new.created_at);
  merged.updated_at := greatest(old.updated_at, new.updated_at);

  if merged.status = 'finished' and old.status <> 'finished' and merged.result <> '*' then
    merged := public.zz_on_game_finished(merged);
  else
    merged.rating_before := old.rating_before;
    merged.rating_after := old.rating_after;
  end if;
  return merged;
end;
$$;

create trigger games_before_update
  before update on public.games
  for each row execute function public.zz_games_before_update();

-- A new move bumps `games.updated_at` (the client does not re-send the game row per move).
create function public.zz_game_moves_after_insert() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.games g set updated_at = new.created_at where g.id = new.game_id and g.updated_at < new.created_at;
  return null;
end;
$$;

create trigger game_moves_after_insert
  after insert on public.game_moves
  for each row execute function public.zz_game_moves_after_insert();

-- Duplicate ids of append-only rows are skipped (also when sent without `on conflict do nothing`).
create function public.zz_skip_duplicate_id() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  dup boolean;
begin
  execute format('select exists (select 1 from %I.%I where id = $1)', tg_table_schema, tg_table_name) into dup using new.id;
  if dup then
    return null;
  end if;
  return new;
end;
$$;

create trigger game_moves_skip_duplicate
  before insert on public.game_moves
  for each row execute function public.zz_skip_duplicate_id();

create trigger explanation_feedback_skip_duplicate
  before insert on public.explanation_feedback
  for each row execute function public.zz_skip_duplicate_id();

-- ---------------------------------------------------------------------------------------------------------------
-- profiles: last writer wins
-- ---------------------------------------------------------------------------------------------------------------

create function public.zz_profiles_before_update() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  merged public.profiles;
begin
  -- `mergeProfile`: the newer version (by `updated_at`, ties: incoming) supplies the fields …
  if new.updated_at >= old.updated_at then
    merged := new;
  else
    merged := old;
  end if;
  merged.id := old.id;
  -- … except the settings, which win by their own `updatedAt` (`mergeSettings`, ties: incoming).
  if coalesce(new.settings ->> 'updatedAt', '') >= coalesce(old.settings ->> 'updatedAt', '') then
    merged.settings := new.settings;
  else
    merged.settings := old.settings;
  end if;
  merged.created_at := least(old.created_at, new.created_at);
  merged.updated_at := greatest(old.updated_at, new.updated_at);
  return merged;
end;
$$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.zz_profiles_before_update();

-- ---------------------------------------------------------------------------------------------------------------
-- RPCs called by the client (outbox entries `rpc`)
-- ---------------------------------------------------------------------------------------------------------------

-- Furthest progress wins (`mergeLessonProgress`); completed steps gained count for the daily activity
-- (`lessonStepsGained`). Idempotent: resending the same progress changes nothing.
create function public.upsert_lesson_progress(
  p_lesson_id text,
  p_lesson_version integer,
  p_current_step integer,
  p_completed boolean,
  p_stars integer,
  p_mistakes integer default 0,
  p_hints_used integer default 0,
  p_score double precision default null,
  p_updated_at timestamptz default null,
  p_completed_at timestamptz default null
) returns public.lesson_progress
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  updated timestamptz := coalesce(p_updated_at, now());
  prev public.lesson_progress;
  incoming public.lesson_progress;
  merged public.lesson_progress;
  steps integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_lesson_id is null or p_current_step is null or p_current_step < 0 or p_stars is null or p_stars not between 0 and 3 then
    raise exception 'invalid input for upsert_lesson_progress' using errcode = '22023';
  end if;
  perform public.zz_lock_user(uid);

  incoming.user_id := uid;
  incoming.lesson_id := p_lesson_id;
  incoming.lesson_version := coalesce(p_lesson_version, 1);
  incoming.current_step := p_current_step;
  incoming.completed := coalesce(p_completed, false);
  incoming.stars := p_stars;
  incoming.mistakes := coalesce(p_mistakes, 0);
  incoming.hints_used := coalesce(p_hints_used, 0);
  incoming.score := p_score;
  incoming.updated_at := updated;
  incoming.completed_at := p_completed_at;

  select * into prev from public.lesson_progress lp where lp.user_id = uid and lp.lesson_id = p_lesson_id for update;
  if not found then
    merged := incoming;
    steps := merged.current_step + (case when merged.completed then 1 else 0 end);
  else
    if (incoming.completed and not prev.completed)
       or (incoming.completed = prev.completed and incoming.current_step >= prev.current_step) then
      merged := incoming;
    else
      merged := prev;
    end if;
    merged.lesson_version := greatest(prev.lesson_version, incoming.lesson_version);
    merged.current_step := greatest(prev.current_step, incoming.current_step);
    merged.completed := prev.completed or incoming.completed;
    merged.stars := greatest(prev.stars, incoming.stars);
    merged.completed_at := coalesce(prev.completed_at, incoming.completed_at);
    merged.updated_at := greatest(prev.updated_at, incoming.updated_at);
    steps := greatest(0, merged.current_step - prev.current_step)
             + (case when merged.completed and not prev.completed then 1 else 0 end);
  end if;

  insert into public.lesson_progress as lp (
    user_id, lesson_id, lesson_version, current_step, completed, stars, mistakes, hints_used, score, updated_at,
    completed_at
  ) values (
    uid, merged.lesson_id, merged.lesson_version, merged.current_step, merged.completed, merged.stars,
    merged.mistakes, merged.hints_used, merged.score, merged.updated_at, merged.completed_at
  )
  on conflict (user_id, lesson_id) do update
    set lesson_version = excluded.lesson_version,
        current_step = excluded.current_step,
        completed = excluded.completed,
        stars = excluded.stars,
        mistakes = excluded.mistakes,
        hints_used = excluded.hints_used,
        score = excluded.score,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
  returning * into merged;

  if steps > 0 then
    perform public.zz_bump_daily(uid, public.zz_local_day(updated), p_lessons => steps);
  end if;
  return merged;
end;
$$;

-- Active minutes of one day: the greatest value wins (idempotent, devices may report the same day).
create function public.upsert_daily_minutes(p_date date, p_minutes integer) returns public.daily_activity
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  goal integer;
  result public.daily_activity;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_date is null or p_minutes is null or p_minutes < 0 then
    raise exception 'invalid input for upsert_daily_minutes' using errcode = '22023';
  end if;
  perform public.zz_lock_user(uid);
  goal := public.zz_goal_minutes(uid);
  insert into public.daily_activity as d (user_id, date, minutes, puzzles, games, lessons, goal_reached)
  values (uid, p_date, p_minutes, 0, 0, 0, p_minutes >= goal)
  on conflict (user_id, date) do update
    set minutes = greatest(d.minutes, excluded.minutes),
        goal_reached = d.goal_reached or greatest(d.minutes, excluded.minutes) >= goal
  returning * into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Function privileges: clients may call the two RPCs only; everything else is internal.
-- ---------------------------------------------------------------------------------------------------------------

revoke execute on function
  public.zz_exp(double precision),
  public.zz_glicko2_f(double precision, double precision, double precision, double precision, double precision, double precision),
  public.glicko2_update(double precision, double precision, double precision, double precision[], double precision[], double precision[], double precision, double precision, double precision, double precision),
  public.zz_local_day(timestamptz),
  public.zz_lock_user(uuid),
  public.zz_goal_minutes(uuid),
  public.zz_bump_daily(uuid, date, integer, integer, integer),
  public.zz_rate(uuid, text, double precision, double precision, double precision),
  public.zz_to_number(text),
  public.zz_bot_opponent_elo(jsonb, text),
  public.zz_on_game_finished(public.games),
  public.zz_puzzle_attempts_before_insert(),
  public.zz_games_before_insert(),
  public.zz_games_before_update(),
  public.zz_game_moves_after_insert(),
  public.zz_skip_duplicate_id(),
  public.zz_profiles_before_update(),
  public.upsert_lesson_progress(text, integer, integer, boolean, integer, integer, integer, double precision, timestamptz, timestamptz),
  public.upsert_daily_minutes(date, integer)
from public, anon, authenticated;

grant execute on function
  public.upsert_lesson_progress(text, integer, integer, boolean, integer, integer, integer, double precision, timestamptz, timestamptz),
  public.upsert_daily_minutes(date, integer)
to authenticated;

grant execute on function
  public.glicko2_update(double precision, double precision, double precision, double precision[], double precision[], double precision[], double precision, double precision, double precision, double precision)
to service_role;
