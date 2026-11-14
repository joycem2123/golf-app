-- Guests (Continue as guest: an anonymous sign-in, no account) can only follow rounds and events. They can't start
-- rounds or events, keep score, send friend requests, share courses, add trip expenses or ask to score a match.
-- Done with guards on the tables themselves, so it holds however the write arrives (app, server functions, old app
-- versions). The server's own functions (no signed-in user) are unaffected.

create or replace function public.is_guest() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- Refuse the write for guests.
create or replace function public.no_guests() returns trigger
language plpgsql as $$
begin
  if public.is_guest() then
    raise exception 'Create a free account to do this. Guests can follow rounds and events.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['rounds', 'events', 'scores', 'friend_requests', 'course_shares', 'edit_requests', 'round_identities', 'trip_ledger'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists no_guests on public.%I', t);
      execute format('create trigger no_guests before insert or update or delete on public.%I for each row execute function public.no_guests()', t);
    end if;
  end loop;
end $$;

-- Joining with a code: a guest always joins as a follower.
create or replace function public.guests_follow() returns trigger
language plpgsql as $$
begin
  if public.is_guest() and new.user_id = auth.uid() then new.role := 'viewer'; end if;
  return new;
end;
$$;
drop trigger if exists guests_follow on public.round_members;
create trigger guests_follow before insert or update on public.round_members for each row execute function public.guests_follow();
drop trigger if exists guests_follow on public.event_members;
create trigger guests_follow before insert or update on public.event_members for each row execute function public.guests_follow();

-- Guests who already joined as scorekeepers become followers.
update public.round_members m set role = 'viewer' from auth.users u where u.id = m.user_id and u.is_anonymous and m.role <> 'viewer';
update public.event_members m set role = 'viewer' from auth.users u where u.id = m.user_id and u.is_anonymous and m.role <> 'viewer';
