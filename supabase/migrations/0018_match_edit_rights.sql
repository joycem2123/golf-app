-- Who can enter or change a match's scores:
--   * someone playing in that match, or
--   * anyone in the round, when every player in that match is a guest (added by name, no Clutch Up account), or
--   * someone a player in that match approved, after they asked ("Request to edit").

create table if not exists public.edit_requests (
  id uuid primary key default gen_random_uuid(),
  round_id text not null references public.rounds on delete cascade,
  game_id text not null,
  requester uuid not null default auth.uid() references auth.users on delete cascade,
  requester_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (round_id, game_id, requester)
);
alter table public.edit_requests enable row level security;
drop policy if exists "edit requests read" on public.edit_requests;
create policy "edit requests read" on public.edit_requests for select to authenticated
  using (requester = auth.uid() or public.is_round_member(round_id) or exists (select 1 from rounds r where r.id = round_id and r.owner = auth.uid()));
drop policy if exists "edit requests ask" on public.edit_requests;
create policy "edit requests ask" on public.edit_requests for insert to authenticated
  with check (requester = auth.uid() and (public.is_round_member(round_id, true) or exists (select 1 from rounds r where r.id = round_id and r.owner = auth.uid())));
do $$ begin
  begin alter publication supabase_realtime add table public.edit_requests; exception when duplicate_object then null; end;
end $$;

-- A game's players (player ids) and score keys (player ids plus team-ball ids) from the round's saved data.
create or replace function public.game_people(data jsonb, gid text, out members text[], out keys text[])
language plpgsql immutable as $$
declare g jsonb; idx bigint;
begin
  members := '{}'; keys := '{}';
  for g, idx in select value, ordinality from jsonb_array_elements(coalesce(data->'games', '[]'::jsonb)) with ordinality loop
    if coalesce(g->>'id', (idx - 1)::text) <> gid then continue; end if;
    select coalesce(array_agg(distinct x), '{}') into members from (
      select jsonb_array_elements_text(g->'sideA'->'members') x union all
      select jsonb_array_elements_text(g->'sideB'->'members') union all
      select jsonb_array_elements_text(g->'teamA'->'members') union all
      select jsonb_array_elements_text(g->'teamB'->'members') union all
      select jsonb_array_elements_text(t->'members') from jsonb_array_elements(coalesce(g->'teams', '[]'::jsonb)) t union all
      select jsonb_array_elements_text(coalesce(g->'playerIds', '[]'::jsonb)) union all
      select jsonb_array_elements_text(coalesce(g->'order', '[]'::jsonb))
    ) s where x is not null;
    select coalesce(array_agg(distinct x), '{}') into keys from (
      select unnest(members) x union all
      select g->'sideA'->>'id' union all select g->'sideB'->>'id' union all
      select g->'teamA'->>'id' union all select g->'teamB'->>'id' union all
      select t->>'id' from jsonb_array_elements(coalesce(g->'teams', '[]'::jsonb)) t
    ) s where x is not null;
    return;
  end loop;
end $$;

-- May the signed-in user save this score key in this round?
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
    if auth.uid()::text = any(p.members) then return true; end if;
    -- Every player in it is a guest (no Clutch Up account: their ids aren't account ids).
    if not exists (select 1 from unnest(p.members) m where lower(m) ~ uuid_re) then return true; end if;
    -- A player in it said yes.
    if exists (select 1 from edit_requests r where r.round_id = rid and r.game_id = gid and r.requester = auth.uid() and r.status = 'approved') then return true; end if;
  end loop;
  -- A score key that isn't in any game: only the round's owner.
  return not found and owner_ = auth.uid();
end $$;

-- Saving a score now checks the match rules.
create or replace function public.upsert_score(p_round text, p_key text, p_hole int, p_gross int, p_entered_at bigint)
returns public.scores
language plpgsql security definer set search_path = public as $$
declare
  kept public.scores;
begin
  if not public.is_round_member(p_round, true) then raise exception 'Not a scorekeeper for this round'; end if;
  if not public.can_edit_score(p_round, p_key) then raise exception 'not_your_match'; end if;
  insert into scores (round_id, key, hole, gross, entered_by, entered_at)
  values (p_round, p_key, p_hole, p_gross, auth.uid(), p_entered_at)
  on conflict (round_id, key, hole) do update
    set gross = excluded.gross, entered_by = excluded.entered_by, entered_at = excluded.entered_at
    where scores.entered_at <= excluded.entered_at;
  select * into kept from scores where round_id = p_round and key = p_key and hole = p_hole;
  return kept;
end $$;

-- Approve or decline a request: only someone playing in that match.
create or replace function public.answer_edit_request(req uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r record; d jsonb; p record;
begin
  select * into r from edit_requests where id = req;
  if r is null then raise exception 'Request not found'; end if;
  select data into d from rounds where id = r.round_id;
  select * into p from public.game_people(d, r.game_id);
  if not (auth.uid()::text = any(p.members)) then raise exception 'Only players in this match can answer'; end if;
  update edit_requests set status = case when approve then 'approved' else 'declined' end, decided_by = auth.uid(), decided_at = now() where id = req;
end $$;

revoke all on function public.can_edit_score(text, text) from public;
revoke all on function public.answer_edit_request(uuid, boolean) from public;
grant execute on function public.can_edit_score(text, text) to authenticated;
grant execute on function public.answer_edit_request(uuid, boolean) to authenticated;
grant execute on function public.upsert_score(text, text, int, int, bigint) to authenticated;
