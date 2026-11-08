-- Following one round of an event: read-only access to that event's overall score.
-- Returns the event and all its rounds (with scores) to anyone who is in the round, or null.
create or replace function public.round_event_snapshot(rid text) returns json
language plpgsql security definer stable set search_path = public as $$
declare eid text;
begin
  select event_id into eid from rounds where id = rid and (owner = auth.uid() or is_round_member(rid));
  if eid is null then return null; end if;
  return json_build_object(
    'event', (select json_build_object('id', e.id, 'share_code', e.share_code, 'data', e.data) from events e where e.id = eid),
    'rounds', (select coalesce(json_agg(json_build_object(
        'id', r.id, 'share_code', r.share_code, 'event_id', r.event_id, 'status', r.status, 'data', r.data,
        'scores', (select coalesce(json_agg(s), '[]'::json) from scores s where s.round_id = r.id)
      )), '[]'::json) from rounds r where r.event_id = eid)
  );
end $$;
revoke all on function public.round_event_snapshot(text) from public;
grant execute on function public.round_event_snapshot(text) to authenticated;
