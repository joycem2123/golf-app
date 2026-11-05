-- Golf app: accounts, shared rounds/events, live scores.
-- Apply with the Supabase SQL editor or the management API.

-- ------------------------------------------------------------------ helpers
create or replace function public.gen_share_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 6);
$$;

-- ------------------------------------------------------------------ tables
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  handicap_index numeric(4,1),
  gender text check (gender in ('M', 'F')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  share_code text unique not null default public.gen_share_code(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.event_members (
  event_id text not null references public.events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'scorer' check (role in ('owner', 'scorer', 'viewer')),
  primary key (event_id, user_id)
);

create table if not exists public.rounds (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  event_id text references public.events on delete set null,
  share_code text unique not null default public.gen_share_code(),
  data jsonb not null,
  status text not null default 'active' check (status in ('active', 'complete')),
  updated_at timestamptz not null default now()
);

create table if not exists public.round_members (
  round_id text not null references public.rounds on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'scorer' check (role in ('owner', 'scorer', 'viewer')),
  primary key (round_id, user_id)
);

create table if not exists public.scores (
  round_id text not null references public.rounds on delete cascade,
  key text not null,
  hole int not null check (hole between 1 and 18),
  gross int check (gross between 1 and 20), -- null = cleared
  entered_by uuid not null default auth.uid(),
  entered_at bigint not null,
  primary key (round_id, key, hole)
);

create index if not exists rounds_event_idx on public.rounds (event_id);

-- ------------------------------------------------------------------ membership checks
create or replace function public.is_event_member(eid text, writer boolean default false) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from event_members m
    where m.event_id = eid and m.user_id = auth.uid() and (not writer or m.role <> 'viewer')
  );
$$;

create or replace function public.is_round_member(rid text, writer boolean default false) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from round_members m
    where m.round_id = rid and m.user_id = auth.uid() and (not writer or m.role <> 'viewer')
  ) or exists (
    select 1 from rounds r
    where r.id = rid and r.event_id is not null and public.is_event_member(r.event_id, writer)
  );
$$;

-- Owners become members automatically.
create or replace function public.add_owner_round() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into round_members (round_id, user_id, role) values (new.id, new.owner, 'owner') on conflict do nothing;
  return new;
end $$;

create or replace function public.add_owner_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into event_members (event_id, user_id, role) values (new.id, new.owner, 'owner') on conflict do nothing;
  return new;
end $$;

drop trigger if exists rounds_owner on public.rounds;
create trigger rounds_owner after insert on public.rounds for each row execute function public.add_owner_round();
drop trigger if exists events_owner on public.events;
create trigger events_owner after insert on public.events for each row execute function public.add_owner_event();

-- ------------------------------------------------------------------ row level security
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.rounds enable row level security;
alter table public.round_members enable row level security;
alter table public.scores enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles write own" on public.profiles;
create policy "profiles write own" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "events read" on public.events;
create policy "events read" on public.events for select to authenticated using (public.is_event_member(id));
drop policy if exists "events insert" on public.events;
create policy "events insert" on public.events for insert to authenticated with check (owner = auth.uid());
drop policy if exists "events update" on public.events;
create policy "events update" on public.events for update to authenticated using (public.is_event_member(id, true));
drop policy if exists "events delete" on public.events;
create policy "events delete" on public.events for delete to authenticated using (owner = auth.uid());

drop policy if exists "event members read" on public.event_members;
create policy "event members read" on public.event_members for select to authenticated using (public.is_event_member(event_id));

drop policy if exists "rounds read" on public.rounds;
create policy "rounds read" on public.rounds for select to authenticated using (public.is_round_member(id));
drop policy if exists "rounds insert" on public.rounds;
create policy "rounds insert" on public.rounds for insert to authenticated
  with check (owner = auth.uid() and (event_id is null or public.is_event_member(event_id, true)));
drop policy if exists "rounds update" on public.rounds;
create policy "rounds update" on public.rounds for update to authenticated using (public.is_round_member(id, true));
drop policy if exists "rounds delete" on public.rounds;
create policy "rounds delete" on public.rounds for delete to authenticated using (owner = auth.uid());

drop policy if exists "round members read" on public.round_members;
create policy "round members read" on public.round_members for select to authenticated using (public.is_round_member(round_id));

drop policy if exists "scores read" on public.scores;
create policy "scores read" on public.scores for select to authenticated using (public.is_round_member(round_id));
-- Scores are written only through upsert_score().

-- ------------------------------------------------------------------ RPCs
-- Join a round or event with its share code, as a scorekeeper or a viewer (guest).
create or replace function public.join_by_code(code text, as_role text default 'viewer') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c text := upper(trim(code));
  r text;
  e text;
  role_ text := case when as_role = 'scorer' then 'scorer' else 'viewer' end;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into r from rounds where share_code = c;
  if r is not null then
    insert into round_members (round_id, user_id, role) values (r, auth.uid(), role_)
      on conflict (round_id, user_id) do update set role = case when round_members.role = 'owner' then 'owner' else excluded.role end;
    return jsonb_build_object('kind', 'round', 'id', r);
  end if;
  select id into e from events where share_code = c;
  if e is not null then
    insert into event_members (event_id, user_id, role) values (e, auth.uid(), role_)
      on conflict (event_id, user_id) do update set role = case when event_members.role = 'owner' then 'owner' else excluded.role end;
    return jsonb_build_object('kind', 'event', 'id', e);
  end if;
  raise exception 'No round or event with code %', c;
end $$;

-- Save a score. The latest entry (by entered_at) wins; returns the row that was kept.
create or replace function public.upsert_score(p_round text, p_key text, p_hole int, p_gross int, p_entered_at bigint)
returns public.scores
language plpgsql security definer set search_path = public as $$
declare
  kept public.scores;
begin
  if not public.is_round_member(p_round, true) then raise exception 'Not a scorekeeper for this round'; end if;
  insert into scores (round_id, key, hole, gross, entered_by, entered_at)
  values (p_round, p_key, p_hole, p_gross, auth.uid(), p_entered_at)
  on conflict (round_id, key, hole) do update
    set gross = excluded.gross, entered_by = excluded.entered_by, entered_at = excluded.entered_at
    where scores.entered_at <= excluded.entered_at;
  select * into kept from scores where round_id = p_round and key = p_key and hole = p_hole;
  return kept;
end $$;

grant execute on function public.join_by_code(text, text) to authenticated;
grant execute on function public.upsert_score(text, text, int, int, bigint) to authenticated;

-- ------------------------------------------------------------------ realtime
do $$
begin
  begin alter publication supabase_realtime add table public.scores; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.rounds; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.events; exception when duplicate_object then null; end;
end $$;
