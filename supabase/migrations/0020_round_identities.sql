-- "This player in the round is me": for people whose player id isn't their account id
-- (playing without an account, or added before they signed up). One claim per player, first come.
create table if not exists public.round_identities (
  round_id text not null references public.rounds on delete cascade,
  player_id text not null,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  primary key (round_id, player_id)
);
alter table public.round_identities enable row level security;
drop policy if exists "identities read" on public.round_identities;
create policy "identities read" on public.round_identities for select to authenticated using (public.is_round_member(round_id) or user_id = auth.uid());
drop policy if exists "identities claim" on public.round_identities;
-- Only for guest-style ids (never someone's account id), and only by a member of the round.
create policy "identities claim" on public.round_identities for insert to authenticated
  with check (user_id = auth.uid() and player_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (public.is_round_member(round_id, true) or exists (select 1 from rounds r where r.id = round_id and r.owner = auth.uid())));

-- Is the signed-in user this player in this round?
create or replace function public.is_me_in_round(rid text, pid text) returns boolean
language sql security definer stable set search_path = public as $$
  select pid = auth.uid()::text or exists (select 1 from round_identities i where i.round_id = rid and i.player_id = pid and i.user_id = auth.uid());
$$;

create or replace function public.can_edit_score(rid text, k text) returns boolean
language plpgsql security definer stable set search_path = public as $$
declare d jsonb; owner_ uuid; g jsonb; idx bigint; gid text; p record; found boolean := false;
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select data, owner into d, owner_ from rounds where id = rid;
  if d is null then return false; end if;
  if not (owner_ = auth.uid() or public.is_round_member(rid, true)) then return false; end if;
  for g, idx in select value, ordinality from jsonb_array_elements(coalesce(d->'games', '[]'::jsonb)) with ordinality loop
    gid := coalesce(g->>'id', (idx - 1)::text);
    select * into p from public.game_people(d, gid);
    if not (k = any(p.keys)) then continue; end if;
    found := true;
    -- Playing in it.
    if exists (select 1 from unnest(p.members) m where public.is_me_in_round(rid, m)) then return true; end if;
    -- Every player in it is a guest: no Clutch Up account id, and nobody has said "that's me".
    if not exists (select 1 from unnest(p.members) m where lower(m) ~ uuid_re or exists (select 1 from round_identities i where i.round_id = rid and i.player_id = m)) then return true; end if;
    -- A player in it said yes.
    if exists (select 1 from edit_requests r where r.round_id = rid and r.game_id = gid and r.requester = auth.uid() and r.status = 'approved') then return true; end if;
  end loop;
  return not found and owner_ = auth.uid();
end $$;

create or replace function public.answer_edit_request(req uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record; d jsonb; p record;
begin
  select * into r from edit_requests where id = req;
  if r is null then raise exception 'Request not found'; end if;
  select data into d from rounds where id = r.round_id;
  select * into p from public.game_people(d, r.game_id);
  if not exists (select 1 from unnest(p.members) m where public.is_me_in_round(r.round_id, m)) then raise exception 'Only players in this match can answer'; end if;
  update edit_requests set status = case when approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = req;
end $$;

revoke all on function public.is_me_in_round(text, text) from public;
grant execute on function public.is_me_in_round(text, text) to authenticated;
