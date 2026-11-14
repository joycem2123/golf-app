-- Moving rounds between events. A round already in an event can only be moved (to another event, or out of events
-- altogether) by its organiser: the event's organiser. A round not in an event can be put into one by anyone who
-- keeps score in it (as before). Either way, the event it goes into must be one the mover keeps score in, and the
-- mover keeps their access to the round once it's moved.
create or replace function public.guard_round_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.event_id is not distinct from old.event_id or auth.uid() is null then
    return new;
  end if;
  if old.event_id is not null and public.round_organizer(old.id) is distinct from auth.uid() then
    raise exception 'Only the event''s organizer can move this round';
  end if;
  if new.event_id is not null and not public.is_event_member(new.event_id, true) then
    raise exception 'You can only move a round into an event you keep score in';
  end if;
  insert into round_members (round_id, user_id, role) values (old.id, auth.uid(), 'scorer')
    on conflict (round_id, user_id) do update set role = case when round_members.role = 'viewer' then 'scorer' else round_members.role end;
  return new;
end;
$$;
drop trigger if exists guard_round_event on public.rounds;
create trigger guard_round_event before update of event_id on public.rounds for each row execute function public.guard_round_event();
