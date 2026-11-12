-- Friends' matches, round 2:
--  * each friend round says which of its players is which friend (a player added by name and later
--    claimed by their account has a different id from the account), so filtering by friend finds them;
--  * friends' events: every live or recent one (not only those with rounds to come), with their rounds,
--    so they can be listed like my own events.

-- Players in a round who are one of my friends: { player_id, user_id }.
create or replace function public.round_friend_players(rid text) returns jsonb
language sql security definer stable set search_path = public as $$
  with fr as (select public.my_friend_ids() as id)
  select coalesce(jsonb_agg(distinct jsonb_build_object('player_id', x.pid, 'user_id', x.uid)), '[]'::jsonb) from (
    select p->>'id' as pid, (p->>'id')::uuid as uid
      from rounds r, jsonb_array_elements(coalesce(r.data->'players', '[]'::jsonb)) p
      where r.id = rid and (p->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    union all
    select i.player_id, i.user_id from round_identities i where i.round_id = rid
  ) x where x.uid in (select id from fr);
$$;

create or replace function public.friend_rounds(days int default 14) returns jsonb
language sql security definer stable set search_path = public as $$
  with fr as (select public.my_friend_ids() as id),
  rs as (
    select r.id, r.status, r.event_id, r.data, r.updated_at,
      (select coalesce(jsonb_agg(u::text), '[]'::jsonb) from public.round_player_ids(r.id) u where u in (select id from fr)) as friends,
      public.is_round_member(r.id) or r.owner = auth.uid() as member
    from rounds r
    where (r.status = 'active' and r.updated_at > now() - interval '2 days') or r.updated_at > now() - make_interval(days => least(greatest(days, 1), 60))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', rs.id, 'status', rs.status, 'event_id', rs.event_id, 'data', rs.data, 'updated_at', rs.updated_at,
      'friends', rs.friends, 'member', rs.member, 'friend_players', public.round_friend_players(rs.id),
      'scores', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'hole', s.hole, 'gross', s.gross)), '[]'::jsonb) from scores s where s.round_id = rs.id)
    ) order by rs.updated_at desc), '[]'::jsonb)
  from (select * from rs where jsonb_array_length(rs.friends) > 0 order by updated_at desc limit 60) rs;
$$;

create or replace function public.friend_events() returns jsonb
language sql security definer stable set search_path = public as $$
  with fr as (select public.my_friend_ids() as id),
  es as (
    select e.id, e.data, e.updated_at,
      (select coalesce(jsonb_agg(distinct u::text), '[]'::jsonb) from (
         select e.owner as u
         union select m.user_id from event_members m where m.event_id = e.id and m.role <> 'viewer'
         union select (pid #>> '{}')::uuid from jsonb_array_elements(coalesce(e.data->'playerIds', '[]'::jsonb)) pid
           where (pid #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       ) people where u in (select id from fr)) as friends,
      public.is_event_member(e.id) or e.owner = auth.uid() as member
    from events e
    where coalesce(e.data->>'status', 'active') <> 'complete' or e.updated_at > now() - interval '30 days'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', es.id, 'data', es.data, 'friends', es.friends, 'member', es.member,
      'rounds', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'status', r.status, 'event_id', r.event_id, 'data', r.data,
          'scores', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'hole', s.hole, 'gross', s.gross)), '[]'::jsonb) from scores s where s.round_id = r.id)
        )), '[]'::jsonb) from rounds r where r.event_id = es.id)
    ) order by es.updated_at desc), '[]'::jsonb)
  from (select * from es where jsonb_array_length(es.friends) > 0 order by updated_at desc limit 30) es;
$$;

revoke all on function public.round_friend_players(text) from public, anon, authenticated;
grant execute on function public.friend_rounds(int) to authenticated;
grant execute on function public.friend_events() to authenticated;
