-- Live score cards (iOS Live Activities): each phone's card for a match, so the server can update it
-- when someone else enters a score while the app is closed. Phones only see and change their own.
create table if not exists public.live_activity_tokens (
  activity_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  round_id text not null,
  game_index int not null,
  side text not null default '' check (side in ('', 'a', 'b')),
  token text not null,
  updated_at timestamptz not null default now()
);
create index if not exists live_activity_tokens_round on public.live_activity_tokens (round_id, game_index);

alter table public.live_activity_tokens enable row level security;
drop policy if exists "own live activity tokens" on public.live_activity_tokens;
create policy "own live activity tokens" on public.live_activity_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
