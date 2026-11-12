-- Following friends' matches: see what friends are playing, follow a match (it joins your Home screen
-- as a viewer) and get notified when it changes.

-- What I follow. A live match is (round_id, game_index). An upcoming event round is (event_id, plan_id),
-- with round_id '' and game_index -1, until it starts.
create table if not exists public.match_follows (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  round_id text not null default '',
  game_index int not null default -1,
  event_id text not null default '',
  plan_id text not null default '',
  follow boolean not null default false,
  notify boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, round_id, game_index, event_id, plan_id)
);
create index if not exists match_follows_round on public.match_follows (round_id, game_index) where notify;
create index if not exists match_follows_event on public.match_follows (event_id) where notify;
alter table public.match_follows enable row level security;
drop policy if exists "own follows" on public.match_follows;
create policy "own follows" on public.match_follows
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The last state each match was announced at, so followers only hear about real changes.
create table if not exists public.match_status (
  round_id text not null,
  game_index int not null,
  state text not null,
  updated_at timestamptz not null default now(),
  primary key (round_id, game_index)
);
alter table public.match_status enable row level security; -- server only (no policies)

-- My friends (not anyone I've blocked or who's blocked me).
create or replace function public.my_friend_ids() returns setof uuid
language sql security definer stable set search_path = public as $$
  select f.friend_id from friends f where f.owner = auth.uid() and not public.is_blocked_between(auth.uid(), f.friend_id);
$$;

-- Accounts playing in a round: the owner, scorers, players with account ids, and claimed players.
create or replace function public.round_player_ids(rid text) returns setof uuid
language sql security definer stable set search_path = public as $$
  select r.owner from rounds r where r.id = rid
  union select m.user_id from round_members m where m.round_id = rid and m.role <> 'viewer'
  union select (p->>'id')::uuid from rounds r, jsonb_array_elements(coalesce(r.data->'players', '[]'::jsonb)) p
    where r.id = rid and (p->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union select i.user_id from round_identities i where i.round_id = rid;
$$;

-- Friends' rounds: everything live, plus those finished in the last `days` days, newest first,
-- each with its scores and which of my friends are in it.
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
      'friends', rs.friends, 'member', rs.member,
      'scores', (select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'hole', s.hole, 'gross', s.gross)), '[]'::jsonb) from scores s where s.round_id = rs.id)
    ) order by rs.updated_at desc), '[]'::jsonb)
  from (select * from rs where jsonb_array_length(rs.friends) > 0 order by updated_at desc limit 60) rs;
$$;

-- Friends' events with rounds still to come.
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
    where coalesce(e.data->>'status', 'active') <> 'complete'
      and exists (select 1 from jsonb_array_elements(coalesce(e.data->'rounds', '[]'::jsonb)) x
                  where x->>'roundId' is null and coalesce(x->>'date', '') >= to_char(now() - interval '1 day', 'YYYY-MM-DD'))
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', es.id, 'data', es.data, 'friends', es.friends, 'member', es.member) order by es.updated_at desc), '[]'::jsonb)
  from (select * from es where jsonb_array_length(es.friends) > 0 limit 30) es;
$$;

-- Follow a friend's round or event: join it as a viewer (it then syncs to my phone like any shared round).
create or replace function public.follow_round(rid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (select 1 from public.round_player_ids(rid) u where u in (select public.my_friend_ids())) then
    raise exception 'You can only follow your friends’ rounds';
  end if;
  insert into round_members (round_id, user_id, role) values (rid, auth.uid(), 'viewer') on conflict (round_id, user_id) do nothing;
end $$;

create or replace function public.follow_event(eid text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not exists (
    select 1 from events e where e.id = eid and (
      e.owner in (select public.my_friend_ids())
      or exists (select 1 from event_members m where m.event_id = eid and m.role <> 'viewer' and m.user_id in (select public.my_friend_ids()))
      or exists (select 1 from jsonb_array_elements_text(coalesce(e.data->'playerIds', '[]'::jsonb)) pid
                 where pid in (select id::text from public.my_friend_ids() id)))
  ) then
    raise exception 'You can only follow your friends’ events';
  end if;
  insert into event_members (event_id, user_id, role) values (eid, auth.uid(), 'viewer') on conflict (event_id, user_id) do nothing;
end $$;

-- Helpers only for the functions above, not to be called directly.
revoke all on function public.my_friend_ids() from public, anon, authenticated;
revoke all on function public.round_player_ids(text) from public, anon, authenticated;
grant execute on function public.friend_rounds(int) to authenticated;
grant execute on function public.friend_events() to authenticated;
grant execute on function public.follow_round(text) to authenticated;
grant execute on function public.follow_event(text) to authenticated;
