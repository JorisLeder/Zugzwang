-- Zugzwang – functions for the edge functions (service role only) and realtime.

-- ---------------------------------------------------------------------------------------------------------------
-- `explain`: rate limit of 200 explanations per user and day (PRD NFR Sicherheit)
-- ---------------------------------------------------------------------------------------------------------------

-- Counts one explanation for the user and day (Europe/Berlin) if the limit is not reached yet.
-- Returns whether the request is allowed and the day's count afterwards. Atomic (one statement per call).
create function public.consume_explanation_quota(
  p_user_id uuid,
  p_limit integer default 200,
  p_date date default null,
  out allowed boolean,
  out used integer
)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  day date := coalesce(p_date, public.zz_local_day(now()));
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

-- ---------------------------------------------------------------------------------------------------------------
-- `delete-account`: removes every row of the user (the function then deletes the auth user, which cascades too)
-- ---------------------------------------------------------------------------------------------------------------

create function public.delete_user_data(p_user_id uuid) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n integer;
  total integer := 0;
begin
  if p_user_id is null then
    raise exception 'invalid input for delete_user_data' using errcode = '22023';
  end if;
  delete from public.game_moves where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.game_analyses where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.games where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.puzzle_attempts where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.review_queue where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.lesson_progress where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.daily_activity where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.theme_stats where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.ratings where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.explanation_usage where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.explanation_feedback where user_id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  delete from public.profiles where id = p_user_id;
  get diagnostics n = row_count; total := total + n;
  return total;
end;
$$;

revoke execute on function
  public.consume_explanation_quota(uuid, integer, date),
  public.delete_user_data(uuid)
from public, anon, authenticated;

grant execute on function
  public.consume_explanation_quota(uuid, integer, date),
  public.delete_user_data(uuid)
to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Realtime: other open devices subscribe to their own rows (`postgres_changes`, RLS applies)
-- ---------------------------------------------------------------------------------------------------------------

-- Guarded: the publication exists on Supabase, not in plain Postgres (tests).
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'profiles', 'ratings', 'puzzle_attempts', 'review_queue', 'games', 'game_moves', 'game_analyses',
      'lesson_progress', 'daily_activity', 'theme_stats', 'explanation_feedback'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
