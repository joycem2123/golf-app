-- Recently deleted: when a round or event is deleted, a full copy is kept for 30 days so its owner can restore it
-- (More → Recently deleted). Captured by the database itself just before the delete, so it works whichever app
-- version deleted it. Rounds keep their scores, players and player links; events keep their members (their rounds
-- aren't deleted with them, only unlinked, and restoring the event links them back).
create table if not exists public.deleted_items (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('round', 'event')),
  item_id text not null,
  title text not null,
  event_name text,
  payload jsonb not null,
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_items_owner on public.deleted_items (owner, deleted_at desc);
alter table public.deleted_items enable row level security;
-- No policies: read and restored only through the functions below (owner only).

create or replace function public.keep_deleted_round() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev text;
begin
  -- Account being deleted (its user is already gone): nothing to keep.
  if not exists (select 1 from auth.users where id = old.owner) then return old; end if;
  select data->>'name' into ev from events where id = coalesce(old.event_id, old.data->>'eventId');
  insert into deleted_items (owner, kind, item_id, title, event_name, payload)
  values (old.owner, 'round', old.id, coalesce(old.data->>'label', 'Round'), ev, jsonb_build_object(
    'row', to_jsonb(old),
    'scores', coalesce((select jsonb_agg(to_jsonb(s)) from scores s where s.round_id = old.id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from round_members m where m.round_id = old.id), '[]'::jsonb),
    'identities', coalesce((select jsonb_agg(to_jsonb(i)) from round_identities i where i.round_id = old.id), '[]'::jsonb)
  ));
  delete from deleted_items where deleted_at < now() - interval '30 days';
  return old;
end;
$$;
drop trigger if exists keep_deleted_round on public.rounds;
create trigger keep_deleted_round before delete on public.rounds for each row execute function public.keep_deleted_round();

create or replace function public.keep_deleted_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from auth.users where id = old.owner) then return old; end if;
  insert into deleted_items (owner, kind, item_id, title, payload)
  values (old.owner, 'event', old.id, coalesce(old.data->>'name', 'Event'), jsonb_build_object(
    'row', to_jsonb(old),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from event_members m where m.event_id = old.id), '[]'::jsonb)
  ));
  delete from deleted_items where deleted_at < now() - interval '30 days';
  return old;
end;
$$;
drop trigger if exists keep_deleted_event on public.events;
create trigger keep_deleted_event before delete on public.events for each row execute function public.keep_deleted_event();

-- My recently deleted rounds and events (last 30 days).
create or replace function public.my_deleted() returns table (id bigint, kind text, item_id text, title text, event_name text, deleted_at timestamptz, holes_scored int, players text)
language sql security definer stable set search_path = public as $$
  select d.id, d.kind, d.item_id, d.title, d.event_name, d.deleted_at,
    case when d.kind = 'round' then (select count(distinct (s->>'hole'))::int from jsonb_array_elements(d.payload->'scores') s) end,
    case when d.kind = 'round' then (select string_agg(p->>'name', ', ') from jsonb_array_elements(d.payload->'row'->'data'->'players') p) end
  from deleted_items d
  where d.owner = auth.uid() and d.deleted_at > now() - interval '30 days'
  order by d.deleted_at desc;
$$;
revoke all on function public.my_deleted() from public;
grant execute on function public.my_deleted() to authenticated;

-- Put a deleted round or event back exactly as it was. Returns the kind and id, for the app to download it again.
create or replace function public.restore_deleted(item bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d deleted_items; r rounds; e events; label text;
begin
  select * into d from deleted_items where id = item and owner = auth.uid() and deleted_at > now() - interval '30 days';
  if not found then raise exception 'Not found'; end if;
  if d.kind = 'round' then
    if exists (select 1 from rounds where id = d.item_id) then raise exception 'That round is already back'; end if;
    r := jsonb_populate_record(null::rounds, d.payload->'row');
    -- Its event may have been deleted since: then it comes back on its own.
    if r.event_id is not null and not exists (select 1 from events where id = r.event_id) then r.event_id := null; end if;
    insert into rounds select r.*;
    insert into scores select * from jsonb_populate_recordset(null::scores, d.payload->'scores') on conflict do nothing;
    insert into round_members select * from jsonb_populate_recordset(null::round_members, d.payload->'members') on conflict do nothing;
    insert into round_identities select * from jsonb_populate_recordset(null::round_identities, d.payload->'identities') on conflict do nothing;
    -- Link it back into its event's plan slot of the same name ("Round 8", or a name it was given), if it's free.
    label := r.data->>'label';
    if r.event_id is not null and label is not null then
      update events ev set data = jsonb_set(ev.data, '{rounds}', (
        select jsonb_agg(case when x->>'roundId' is null and coalesce(nullif(trim(x->>'name'), ''), 'Round ' || (x->>'number')) = label then x || jsonb_build_object('roundId', r.id) else x end order by ord)
        from jsonb_array_elements(ev.data->'rounds') with ordinality as t(x, ord)
      )), updated_at = now()
      where ev.id = r.event_id and jsonb_typeof(ev.data->'rounds') = 'array'
        and not exists (select 1 from jsonb_array_elements(ev.data->'rounds') x where x->>'roundId' = r.id);
    end if;
  else
    if exists (select 1 from events where id = d.item_id) then raise exception 'That event is already back'; end if;
    e := jsonb_populate_record(null::events, d.payload->'row');
    insert into events select e.*;
    insert into event_members select * from jsonb_populate_recordset(null::event_members, d.payload->'members') on conflict do nothing;
    -- Its rounds were only unlinked; link them back.
    update rounds set event_id = e.id where event_id is null and data->>'eventId' = e.id;
  end if;
  delete from deleted_items where id = d.id;
  return jsonb_build_object('kind', d.kind, 'id', d.item_id, 'eventId', case when d.kind = 'round' then r.event_id end);
end;
$$;
revoke all on function public.restore_deleted(bigint) from public;
grant execute on function public.restore_deleted(bigint) to authenticated;
