-- Unique usernames for every user (guests included) and a friends list per account.

alter table public.profiles add column if not exists username text;
do $$ begin
  alter table public.profiles add constraint profiles_username_format check (username ~ '^[a-z0-9_.]{3,20}$');
exception when duplicate_object then null; end $$;
create unique index if not exists profiles_username_unique on public.profiles (lower(username));

create table if not exists public.friends (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  friend_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, friend_id)
);
alter table public.friends enable row level security;
drop policy if exists "friends own" on public.friends;
create policy "friends own" on public.friends for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- Is a username free? (Ignores your own.)
create or replace function public.username_available(u text) returns boolean
language sql security definer stable set search_path = public as $$
  select lower(u) ~ '^[a-z0-9_.]{3,20}$'
     and not exists (select 1 from profiles where lower(username) = lower(u) and id is distinct from auth.uid());
$$;

-- Type-ahead search by username (prefix) or name (anywhere). Never returns yourself.
create or replace function public.search_profiles(q text)
returns table (id uuid, username text, display_name text, handicap_index numeric, gender text)
language sql security definer stable set search_path = public as $$
  with term as (select replace(replace(replace(lower(trim(q)), '\', '\\'), '%', '\%'), '_', '\_') as t)
  select p.id, p.username, p.display_name, p.handicap_index, p.gender
  from profiles p, term
  where auth.uid() is not null
    and length(term.t) > 0
    and p.username is not null
    and p.id <> auth.uid()
    and (lower(p.username) like term.t || '%' or lower(p.display_name) like '%' || term.t || '%')
  order by (lower(p.username) like term.t || '%') desc, p.username
  limit 20;
$$;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.search_profiles(text) to authenticated;
