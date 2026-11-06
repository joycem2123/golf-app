-- Blocking and reporting other users (App Store requirement for apps where people connect).

create table if not exists public.blocks (
  blocker uuid not null default auth.uid() references auth.users on delete cascade,
  blocked uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "blocks own" on public.blocks;
create policy "blocks own" on public.blocks for all to authenticated using (blocker = auth.uid()) with check (blocker = auth.uid());

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid default auth.uid() references auth.users on delete set null,
  reported uuid references auth.users on delete set null,
  reason text not null,
  details text,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
-- Reports can be filed but not read back from the app (reviewed in the Supabase dashboard).
drop policy if exists "reports file" on public.reports;
create policy "reports file" on public.reports for insert to authenticated with check (reporter = auth.uid());

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

-- Block someone: ends the friendship, pending requests, shared courses and handicap requests between us.
create or replace function public.block_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if target = me then raise exception 'That''s you'; end if;
  insert into blocks (blocker, blocked) values (me, target) on conflict do nothing;
  delete from friends where (owner = me and friend_id = target) or (owner = target and friend_id = me);
  delete from friend_requests where (from_user = me and to_user = target) or (from_user = target and to_user = me);
  delete from course_shares where (owner = me and recipient = target) or (owner = target and recipient = me);
  delete from nudges where (from_user = me and to_user = target) or (from_user = target and to_user = me);
end $$;

create or replace function public.unblock_user(target uuid) returns void
language sql security definer set search_path = public as $$
  delete from blocks where blocker = auth.uid() and blocked = target;
$$;

create or replace function public.report_user(target uuid, reason text, details text default null) returns void
language sql security definer set search_path = public as $$
  insert into reports (reporter, reported, reason, details) values (auth.uid(), target, left(reason, 100), left(details, 1000));
$$;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.report_user(uuid, text, text) to authenticated;

-- Friend requests can't be sent either way between blocked people.
create or replace function public.send_friend_request(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if target = me then raise exception 'That''s you'; end if;
  if is_blocked_between(me, target) then raise exception 'You can''t send a request to this person'; end if;
  if exists (select 1 from friends where owner = me and friend_id = target) then return 'friends'; end if;
  if exists (select 1 from friend_requests where from_user = target and to_user = me and status = 'pending') then
    update friend_requests set status = 'accepted', responded_at = now() where from_user = target and to_user = me;
    perform make_friends(me, target);
    return 'accepted';
  end if;
  insert into friend_requests (from_user, to_user, status) values (me, target, 'pending')
    on conflict (from_user, to_user) do update set status = 'pending', created_at = now(), responded_at = null;
  return 'sent';
end $$;

-- Search never shows people I blocked or who blocked me.
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
    and not is_blocked_between(auth.uid(), p.id)
    and (lower(p.username) like term.t || '%' or lower(p.display_name) like '%' || term.t || '%')
  order by (lower(p.username) like term.t || '%') desc, p.username
  limit 20;
$$;
