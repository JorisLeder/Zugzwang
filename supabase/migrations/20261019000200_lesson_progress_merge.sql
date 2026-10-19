-- Lesson progress merge refinements (client twin: mergeLessonProgress in src/data/progress/rules.ts).
-- - Both records completed: `score` is the greater one (greatest ignores null), so the best test result stays.
-- - Both records not completed and the older one (by updated_at; on a tie the incoming row counts as newer) is a
--   scored test run (score not null): the newer record replaces it wholesale. Otherwise a failed test, which is stored
--   with current_step = number of steps, would block the resume of every retry (max step wins) forever.
-- Everything else is unchanged: furthest progress wins, completed is OR-ed, stars are the maximum.
create or replace function public.zz_lesson_progress_before_update() returns trigger
language plpgsql set search_path = ''
as $$
declare
  merged public.lesson_progress;
  incoming_newer boolean;
begin
  if not old.completed and not new.completed then
    incoming_newer := new.updated_at >= old.updated_at;
    if (case when incoming_newer then old.score else new.score end) is not null then
      merged := case when incoming_newer then new else old end;
      merged.user_id := old.user_id;
      merged.lesson_id := old.lesson_id;
      merged.lesson_version := greatest(old.lesson_version, new.lesson_version);
      merged.completed_at := coalesce(old.completed_at, new.completed_at);
      merged.updated_at := greatest(old.updated_at, new.updated_at);
      return merged;
    end if;
  end if;
  if (new.completed and not old.completed)
     or (new.completed = old.completed and new.current_step >= old.current_step) then
    merged := new;
  else
    merged := old;
  end if;
  merged.user_id := old.user_id;
  merged.lesson_id := old.lesson_id;
  merged.lesson_version := greatest(old.lesson_version, new.lesson_version);
  merged.current_step := greatest(old.current_step, new.current_step);
  merged.completed := old.completed or new.completed;
  merged.stars := greatest(old.stars, new.stars);
  if old.completed and new.completed then
    merged.score := greatest(old.score, new.score);
  end if;
  merged.completed_at := coalesce(old.completed_at, new.completed_at);
  merged.updated_at := greatest(old.updated_at, new.updated_at);
  return merged;
end;
$$;
