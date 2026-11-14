-- Organisers. Every event and round has one: the person who created it. A round in an event is run by the
-- event's organiser, whoever started the round. Only the organiser can delete (everyone else hides it on their own
-- phone), and the organiser can hand the role to someone else in the round or event.

-- Who organises a round: its event's organiser when it's in an event, otherwise whoever created it.
create or replace function public.round_organizer(rid text) returns uuid
language sql security definer stable set search_path = public as $$
  select coalesce(
    (select e.owner from rounds r join events e on e.id = r.event_id where r.id = rid),
    (select owner from rounds where id = rid)
  );
$$;
revoke all on function public.round_organizer(text) from public, anon;
grant execute on function public.round_organizer(text) to authenticated;

-- Only the organiser can delete a round (a round in an event: the event's organiser).
drop policy if exists "rounds delete" on public.rounds;
create policy "rounds delete" on public.rounds for delete to authenticated using (public.round_organizer(id) = auth.uid());
-- Events: unchanged (owner only), restated here for clarity.
drop policy if exists "events delete" on public.events;
create policy "events delete" on public.events for delete to authenticated using (owner = auth.uid());

-- Scorekeepers can update a round or event, but never its owner: that only changes through a hand-off.
create or replace function public.keep_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.owner is distinct from old.owner and coalesce(current_setting('app.handoff', true), '') <> 'on' then
    new.owner := old.owner;
  end if;
  return new;
end;
$$;
drop trigger if exists keep_owner on public.events;
create trigger keep_owner before update on public.events for each row execute function public.keep_owner();
drop trigger if exists keep_owner on public.rounds;
create trigger keep_owner before update on public.rounds for each row execute function public.keep_owner();

-- Hand the organiser role to someone else who's in the event (or stand-alone round) and on Clutch Up.
create or replace function public.transfer_organizer(kind text, item text, new_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if new_owner = auth.uid() then return; end if;
  if kind = 'event' then
    if not exists (select 1 from events where id = item and owner = auth.uid()) then raise exception 'Only the organiser can hand this over'; end if;
    if not exists (select 1 from event_members where event_id = item and user_id = new_owner) then raise exception 'They need to be in the event first'; end if;
    perform set_config('app.handoff', 'on', true);
    update events set owner = new_owner where id = item;
    update event_members set role = 'scorer' where event_id = item and user_id = auth.uid();
    update event_members set role = 'owner' where event_id = item and user_id = new_owner;
  elsif kind = 'round' then
    if exists (select 1 from rounds where id = item and event_id is not null) then raise exception 'A round in an event is run by the event organiser'; end if;
    if not exists (select 1 from rounds where id = item and owner = auth.uid()) then raise exception 'Only the organiser can hand this over'; end if;
    if not exists (select 1 from round_members where round_id = item and user_id = new_owner) then raise exception 'They need to be in the round first'; end if;
    perform set_config('app.handoff', 'on', true);
    update rounds set owner = new_owner where id = item;
    update round_members set role = 'scorer' where round_id = item and user_id = auth.uid();
    update round_members set role = 'owner' where round_id = item and user_id = new_owner;
  else
    raise exception 'Bad request';
  end if;
  perform set_config('app.handoff', '', true);
end;
$$;
revoke all on function public.transfer_organizer(text, text, uuid) from public, anon;
grant execute on function public.transfer_organizer(text, text, uuid) to authenticated;
