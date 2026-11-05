-- Owners can always see and update their own rounds/events (needed for INSERT ... RETURNING,
-- which is checked before the owner's membership row exists).
drop policy if exists "rounds read" on public.rounds;
create policy "rounds read" on public.rounds for select to authenticated using (owner = auth.uid() or public.is_round_member(id));
drop policy if exists "rounds update" on public.rounds;
create policy "rounds update" on public.rounds for update to authenticated using (owner = auth.uid() or public.is_round_member(id, true));

drop policy if exists "events read" on public.events;
create policy "events read" on public.events for select to authenticated using (owner = auth.uid() or public.is_event_member(id));
drop policy if exists "events update" on public.events;
create policy "events update" on public.events for update to authenticated using (owner = auth.uid() or public.is_event_member(id, true));
