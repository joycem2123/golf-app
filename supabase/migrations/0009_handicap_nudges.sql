-- When each player last updated (or confirmed) their handicap index, friends asking
-- each other to update it, and push notification tokens.

alter table public.profiles add column if not exists handicap_updated_at timestamptz;
update public.profiles set handicap_updated_at = now() where handicap_updated_at is null;

create or replace function public.touch_handicap() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.handicap_index is distinct from old.handicap_index then
    new.handicap_updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists profiles_handicap_touch on public.profiles;
create trigger profiles_handicap_touch before insert or update on public.profiles
  for each row execute function public.touch_handicap();

-- "My index is still right."
create or replace function public.confirm_handicap() returns timestamptz
language sql security definer set search_path = public as $$
  update profiles set handicap_updated_at = now() where id = auth.uid() returning handicap_updated_at;
$$;
grant execute on function public.confirm_handicap() to authenticated;

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  kind text not null default 'handicap' check (kind in ('handicap')),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists nudges_to_idx on public.nudges (to_user, seen_at);
alter table public.nudges enable row level security;
drop policy if exists "nudges read" on public.nudges;
create policy "nudges read" on public.nudges for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
-- Only friends, and at most one unanswered nudge per pair every 6 hours.
drop policy if exists "nudges insert" on public.nudges;
create policy "nudges insert" on public.nudges for insert to authenticated with check (
  from_user = auth.uid()
  and exists (select 1 from friends f where f.owner = auth.uid() and f.friend_id = to_user)
  and not exists (select 1 from nudges n where n.from_user = auth.uid() and n.to_user = nudges.to_user and n.seen_at is null and n.created_at > now() - interval '6 hours')
);
drop policy if exists "nudges answer" on public.nudges;
create policy "nudges answer" on public.nudges for update to authenticated using (to_user = auth.uid()) with check (to_user = auth.uid());

create table if not exists public.push_tokens (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  token text not null,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
drop policy if exists "push tokens own" on public.push_tokens;
create policy "push tokens own" on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$ begin
  begin alter publication supabase_realtime add table public.nudges; exception when duplicate_object then null; end;
end $$;
