-- The event TV board (clutchupgolf.com/tv/board/?c=CODE): everything needed to show an event's scoreboard,
-- read by its share code. Anyone with the code can already join and follow the event, so this shows
-- nothing more; it's read-only and needs no account (TVs aren't signed in).
create or replace function public.tv_board(code text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'event', jsonb_build_object('id', e.id, 'share_code', e.share_code, 'data', e.data),
    'rounds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'data', r.data,
        'scores', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'hole', s.hole, 'gross', s.gross)), '[]'::jsonb) from scores s where s.round_id = r.id)
      )), '[]'::jsonb)
      from rounds r where r.event_id = e.id
    )
  )
  from events e
  where e.share_code = upper(trim(code)) and length(trim(code)) = 6;
$$;
revoke all on function public.tv_board(text) from public;
grant execute on function public.tv_board(text) to anon, authenticated;
