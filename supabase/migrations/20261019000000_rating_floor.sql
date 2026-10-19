-- Rating floor: stored puzzle and bot ratings never go below 100 (client: MIN_PUZZLE_RATING in src/core/rating.ts).
-- Redefines zz_rate (same signature, grants stay) so the stored rating and rating_after are greatest(100, new rating).
create or replace function public.zz_rate(
  p_user_id uuid, p_kind text, p_opponent_rating double precision, p_opponent_rd double precision,
  p_score double precision, out rating_before double precision, out rating_after double precision
)
language plpgsql volatile set search_path = ''
as $$
declare
  cur public.ratings%rowtype;
  nxt record;
  floored double precision;
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
  floored := case when p_kind in ('puzzle', 'bot') then greatest(100, nxt.rating) else nxt.rating end;
  insert into public.ratings as r (user_id, kind, rating, rd, volatility, games_count, updated_at)
  values (p_user_id, p_kind, floored, nxt.rd, nxt.volatility, cur.games_count + 1, now())
  on conflict (user_id, kind) do update
    set rating = excluded.rating,
        rd = excluded.rd,
        volatility = excluded.volatility,
        games_count = excluded.games_count,
        updated_at = excluded.updated_at;
  rating_before := cur.rating;
  rating_after := floored;
end;
$$;
