-- Leaving a round or event someone else started (deleting it from your own app).
create or replace function public.leave_round(rid text) returns void
language sql security definer set search_path = public as $$
  delete from round_members where round_id = rid and user_id = auth.uid() and role <> 'owner';
$$;
create or replace function public.leave_event(eid text) returns void
language sql security definer set search_path = public as $$
  delete from event_members where event_id = eid and user_id = auth.uid() and role <> 'owner';
$$;
grant execute on function public.leave_round(text) to authenticated;
grant execute on function public.leave_event(text) to authenticated;
