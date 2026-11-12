-- A side bet doesn't open up a player's scores: their main match decides who can enter them.
-- (Before, a side bet between two guests let anyone enter those two players' scores, even when
-- their main match was locked to its players.) Side bets still count for someone in no main match.
create or replace function public.can_edit_score(rid text, k text) returns boolean
language plpgsql security definer stable set search_path = public as $$
declare d jsonb; owner_ uuid; g jsonb; idx bigint; gid text; p record; found boolean := false; in_main boolean := false;
  uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  select data, owner into d, owner_ from rounds where id = rid;
  if d is null then return false; end if;
  if not (owner_ = auth.uid() or public.is_round_member(rid, true)) then return false; end if;
  -- Is this player in any main (non side-bet) game?
  for g, idx in select value, ordinality from jsonb_array_elements(coalesce(d->'games', '[]'::jsonb)) with ordinality loop
    gid := coalesce(g->>'id', (idx - 1)::text);
    if gid like 'side-%' then continue; end if;
    select * into p from public.game_people(d, gid);
    if k = any(p.keys) then in_main := true; exit; end if;
  end loop;
  for g, idx in select value, ordinality from jsonb_array_elements(coalesce(d->'games', '[]'::jsonb)) with ordinality loop
    gid := coalesce(g->>'id', (idx - 1)::text);
    if in_main and gid like 'side-%' then continue; end if;
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
