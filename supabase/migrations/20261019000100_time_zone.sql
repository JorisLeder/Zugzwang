-- Zugzwang – daily activity and the explanation quota use the user's own time zone (not always Europe/Berlin).
--
-- `profiles.time_zone` is the IANA name the client reports (default Europe/Berlin, also for users who never reported
-- one). `zz_local_day(ts, user_id)` reads it; an unknown or invalid name falls back to Europe/Berlin, so a bad client
-- value can never make a write fail. The functions that bucket by day are redefined with the user id.

alter table public.profiles
  add column time_zone text not null default 'Europe/Berlin'
  constraint profiles_time_zone_length check (char_length(time_zone) between 1 and 64);

-- Calendar day of a timestamp in the time zone of the user (Europe/Berlin without a profile or with an invalid name).
create function public.zz_local_day(ts timestamptz, p_user_id uuid) returns date
language plpgsql stable security definer set search_path = ''
as $$
declare
  tz text;
begin
  select p.time_zone into tz from public.profiles p where p.id = p_user_id;
  begin
    return (ts at time zone coalesce(tz, 'Europe/Berlin'))::date;
  exception when invalid_parameter_value then
    return (ts at time zone 'Europe/Berlin')::date;
  end;
end;
$$;

revoke execute on function public.zz_local_day(timestamptz, uuid) from public, anon, authenticated;

create or replace function public.zz_on_game_finished(g public.games) returns public.games
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
    perform public.zz_bump_daily(g.user_id, public.zz_local_day(coalesce(g.finished_at, now()), g.user_id), p_games => 1);
  end if;
  return g;
end;
$$;

create or replace function public.zz_puzzle_attempts_before_insert() returns trigger
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

  perform public.zz_bump_daily(new.user_id, public.zz_local_day(new.created_at, new.user_id), p_puzzles => 1);
  return new;
end;
$$;

create or replace function public.upsert_lesson_progress(
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
  had_prev boolean;
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

  select * into prev from public.lesson_progress lp where lp.user_id = uid and lp.lesson_id = p_lesson_id for update;
  had_prev := found;

  insert into public.lesson_progress as lp (
    user_id, lesson_id, lesson_version, current_step, completed, stars, mistakes, hints_used, score, updated_at,
    completed_at
  ) values (
    uid, p_lesson_id, coalesce(p_lesson_version, 1), p_current_step, coalesce(p_completed, false), p_stars,
    coalesce(p_mistakes, 0), coalesce(p_hints_used, 0), p_score, updated, p_completed_at
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

  if had_prev then
    steps := greatest(0, merged.current_step - prev.current_step)
             + (case when merged.completed and not prev.completed then 1 else 0 end);
  else
    steps := merged.current_step + (case when merged.completed then 1 else 0 end);
  end if;
  if steps > 0 then
    perform public.zz_bump_daily(uid, public.zz_local_day(updated, uid), p_lessons => steps);
  end if;
  return merged;
end;
$$;

create or replace function public.consume_explanation_quota(
  p_user_id uuid,
  p_limit integer default 200,
  p_date date default null,
  out allowed boolean,
  out used integer
)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  day date := coalesce(p_date, public.zz_local_day(now(), p_user_id));
begin
  if p_user_id is null or p_limit is null or p_limit < 0 then
    raise exception 'invalid input for consume_explanation_quota' using errcode = '22023';
  end if;
  insert into public.explanation_usage as u (user_id, date, count)
  select p_user_id, day, 1
  where p_limit > 0
  on conflict (user_id, date) do update
    set count = u.count + 1
    where u.count < p_limit
  returning u.count into used;
  if used is null then
    allowed := false;
    used := coalesce((select u.count from public.explanation_usage u where u.user_id = p_user_id and u.date = day), 0);
  else
    allowed := true;
  end if;
end;
$$;

-- The callers above no longer use the one-argument version.
drop function public.zz_local_day(timestamptz);
