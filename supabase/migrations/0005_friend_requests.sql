-- Friend requests with approval. A friendship is two rows in `friends` (one per direction),
-- created only when the other person accepts.

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_user, to_user),
  check (from_user <> to_user)
);
alter table public.friend_requests enable row level security;
drop policy if exists "requests read own" on public.friend_requests;
create policy "requests read own" on public.friend_requests for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- Friends can no longer be written directly by the app: only through the functions below.
drop policy if exists "friends own" on public.friends;
drop policy if exists "friends read own" on public.friends;
create policy "friends read own" on public.friends for select to authenticated using (owner = auth.uid());

-- Turn existing one-way adds into pending requests.
insert into public.friend_requests (from_user, to_user)
  select f.owner, f.friend_id from public.friends f
  where not exists (select 1 from public.friends g where g.owner = f.friend_id and g.friend_id = f.owner)
  on conflict do nothing;
delete from public.friends f
  where not exists (select 1 from public.friends g where g.owner = f.friend_id and g.friend_id = f.owner);

create or replace function public.make_friends(a uuid, b uuid) returns void
language sql security definer set search_path = public as $$
  insert into friends (owner, friend_id) values (a, b), (b, a) on conflict do nothing;
$$;
revoke execute on function public.make_friends(uuid, uuid) from public, anon, authenticated;

-- Send a request. Returns 'sent', 'accepted' (they had already asked you) or 'friends'.
create or replace function public.send_friend_request(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if target = me then raise exception 'That''s you'; end if;
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

-- Accept or decline a request sent to you.
create or replace function public.respond_friend_request(req uuid, accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare r friend_requests;
begin
  select * into r from friend_requests where id = req and to_user = auth.uid() and status = 'pending';
  if not found then raise exception 'That request is no longer waiting'; end if;
  update friend_requests set status = case when accept then 'accepted' else 'declined' end, responded_at = now() where id = req;
  if accept then perform make_friends(r.from_user, r.to_user); end if;
  return case when accept then 'accepted' else 'declined' end;
end $$;

create or replace function public.cancel_friend_request(target uuid) returns void
language sql security definer set search_path = public as $$
  delete from friend_requests where from_user = auth.uid() and to_user = target and status = 'pending';
$$;

-- Unfriend: removes the friendship on both sides.
create or replace function public.remove_friend(target uuid) returns void
language sql security definer set search_path = public as $$
  delete from friends where (owner = auth.uid() and friend_id = target) or (owner = target and friend_id = auth.uid());
  delete from friend_requests where (from_user = auth.uid() and to_user = target) or (from_user = target and to_user = auth.uid());
$$;

-- Pending requests to and from me, with the other person's details.
create or replace function public.list_friend_requests()
returns table (id uuid, direction text, other_id uuid, username text, display_name text, handicap_index numeric, gender text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select r.id,
         case when r.to_user = auth.uid() then 'incoming' else 'outgoing' end,
         p.id, p.username, p.display_name, p.handicap_index, p.gender, r.created_at
  from friend_requests r
  join profiles p on p.id = case when r.to_user = auth.uid() then r.from_user else r.to_user end
  where r.status = 'pending' and (r.to_user = auth.uid() or r.from_user = auth.uid())
  order by r.created_at desc;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.list_friend_requests() to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.friend_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.friends; exception when duplicate_object then null; end;
end $$;
