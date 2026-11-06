-- Sharing a course I added or corrected with chosen friends.
create table if not exists public.course_shares (
  course_id text not null,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  recipient uuid not null references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (course_id, owner, recipient)
);
alter table public.course_shares enable row level security;

drop policy if exists "course shares read" on public.course_shares;
create policy "course shares read" on public.course_shares for select to authenticated
  using (owner = auth.uid() or recipient = auth.uid());
-- Only to friends.
drop policy if exists "course shares insert" on public.course_shares;
create policy "course shares insert" on public.course_shares for insert to authenticated
  with check (owner = auth.uid() and exists (select 1 from friends f where f.owner = auth.uid() and f.friend_id = recipient));
drop policy if exists "course shares update" on public.course_shares;
create policy "course shares update" on public.course_shares for update to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from friends f where f.owner = auth.uid() and f.friend_id = recipient));
-- The owner can stop sharing; a recipient can remove it from their list.
drop policy if exists "course shares delete" on public.course_shares;
create policy "course shares delete" on public.course_shares for delete to authenticated
  using (owner = auth.uid() or recipient = auth.uid());
