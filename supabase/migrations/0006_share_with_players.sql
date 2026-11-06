-- Rounds and events show up automatically for every MatchDay player in them.
-- A scorekeeper can add players to a round/event, but only people who are friends
-- with them or with its owner (or already in it).

create or replace function public.share_round_with(rid text, users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  own uuid;
  n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select owner into own from rounds where id = rid;
  if own is null then raise exception 'Round not found'; end if;
  if not (own = auth.uid() or public.is_round_member(rid, true)) then raise exception 'Not a scorekeeper for this round'; end if;
  insert into round_members (round_id, user_id, role)
  select rid, u, 'scorer' from unnest(users) as u
  where u <> auth.uid()
    and exists (select 1 from auth.users x where x.id = u)
    and (exists (select 1 from friends f where f.owner = auth.uid() and f.friend_id = u)
      or exists (select 1 from friends f where f.owner = own and f.friend_id = u)
      or u = own)
  on conflict (round_id, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.share_event_with(eid text, users uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  own uuid;
  n int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select owner into own from events where id = eid;
  if own is null then raise exception 'Event not found'; end if;
  if not (own = auth.uid() or public.is_event_member(eid, true)) then raise exception 'Not a scorekeeper for this event'; end if;
  insert into event_members (event_id, user_id, role)
  select eid, u, 'scorer' from unnest(users) as u
  where u <> auth.uid()
    and exists (select 1 from auth.users x where x.id = u)
    and (exists (select 1 from friends f where f.owner = auth.uid() and f.friend_id = u)
      or exists (select 1 from friends f where f.owner = own and f.friend_id = u)
      or u = own)
  on conflict (event_id, user_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.share_round_with(text, uuid[]) to authenticated;
grant execute on function public.share_event_with(text, uuid[]) to authenticated;

-- So a phone hears straight away when it's added to a round or event.
do $$
begin
  begin alter publication supabase_realtime add table public.round_members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.event_members; exception when duplicate_object then null; end;
end $$;
