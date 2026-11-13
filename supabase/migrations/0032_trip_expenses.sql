-- Trip expenses: shared bills on a trip (who paid, who shares it) and the payments people make to settle up.
-- Everyone in the trip can see them; anyone in it who can score (not viewers) can add or change them, as long as the
-- trip has expenses turned on and its organiser has Clutch Up Pro. The app never moves money: payments are records.
--
-- No foreign key to events on purpose: if a trip is deleted, its expenses wait with it in Recently deleted and come
-- back when it's restored. They're cleared once the trip is gone for good.
create table if not exists public.trip_ledger (
  id text primary key,
  event_id text not null,
  kind text not null check (kind in ('expense', 'payment')),
  data jsonb not null check (octet_length(data::text) < 20000),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists trip_ledger_event on public.trip_ledger (event_id);
alter table public.trip_ledger enable row level security;

-- Does this trip have expenses turned on, with an organiser who has Pro?
create or replace function public.trip_expenses_on(eid text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from events e
    where e.id = eid and coalesce((e.data->'expenses'->>'on')::boolean, false) and public.has_pro_for(e.owner)
  );
$$;
revoke all on function public.trip_expenses_on(text) from public, anon;
grant execute on function public.trip_expenses_on(text) to authenticated;

drop policy if exists "trip ledger read" on public.trip_ledger;
create policy "trip ledger read" on public.trip_ledger for select to authenticated using (public.is_event_member(event_id));
drop policy if exists "trip ledger add" on public.trip_ledger;
create policy "trip ledger add" on public.trip_ledger for insert to authenticated
  with check (public.is_event_member(event_id, true) and public.trip_expenses_on(event_id));
drop policy if exists "trip ledger change" on public.trip_ledger;
create policy "trip ledger change" on public.trip_ledger for update to authenticated
  using (public.is_event_member(event_id, true) and public.trip_expenses_on(event_id))
  with check (public.is_event_member(event_id, true) and public.trip_expenses_on(event_id));
drop policy if exists "trip ledger remove" on public.trip_ledger;
create policy "trip ledger remove" on public.trip_ledger for delete to authenticated
  using (public.is_event_member(event_id, true) and public.trip_expenses_on(event_id));

-- Who added and last changed each entry is set by the server, not the phone. An entry can't move to another trip.
create or replace function public.trip_ledger_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.event_id := old.event_id;
    new.kind := old.kind;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trip_ledger_stamp on public.trip_ledger;
create trigger trip_ledger_stamp before insert or update on public.trip_ledger for each row execute function public.trip_ledger_stamp();

-- When an event is deleted: clear expenses of trips that are gone for good (not waiting in Recently deleted).
create or replace function public.purge_trip_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from trip_ledger l
  where not exists (select 1 from events e where e.id = l.event_id)
    and not exists (select 1 from deleted_items d where d.kind = 'event' and d.item_id = l.event_id);
  return null;
end;
$$;
drop trigger if exists purge_trip_ledger on public.events;
create trigger purge_trip_ledger after delete on public.events for each statement execute function public.purge_trip_ledger();

-- Live updates: a bill added on one phone shows on everyone's.
do $$ begin
  begin alter publication supabase_realtime add table public.trip_ledger; exception when duplicate_object then null; end;
end $$;
