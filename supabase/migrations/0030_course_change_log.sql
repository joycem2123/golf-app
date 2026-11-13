-- Audit trail for scorecard edits. A player's edit only changes their own copy of a course, but every saved change
-- is logged here (who, which course, exactly what changed, and how: by hand or from a photo) for the team's
-- review inbox in the app (no notifications), so a card can be reviewed and corrected for everyone if needed.
create table if not exists public.course_change_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete set null,
  user_name text,
  course_id text not null,
  course_name text not null,
  method text not null default 'manual',      -- 'manual' or 'photo'
  summary text not null,                       -- e.g. "Black (men): rating 70.9 → 71.2; hole 4 par 4 → 5"
  changes jsonb not null,                      -- [{ tee, gender, field, hole?, from, to }]
  course_after jsonb,                          -- the whole card as they saved it
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  review_note text
);
create index if not exists course_change_log_course on public.course_change_log (course_id, created_at desc);
alter table public.course_change_log enable row level security;
-- No policies: written by the course-change function, read in the dashboard by the team.

-- Who gets the alerts (kept private: not readable from the app).
create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;
insert into public.admins (user_id) values ('31481c52-00f7-4c1b-b22c-60fe8b2a86af') on conflict do nothing;

-- The review inbox in the app (More → Course changes), for admins only. No notifications are sent: changes wait
-- here until someone on the team looks.
create or replace function public.am_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
revoke all on function public.am_admin() from public;
grant execute on function public.am_admin() to authenticated;

create or replace function public.course_changes(only_open boolean default true) returns setof public.course_change_log
language sql security definer stable set search_path = public as $$
  select * from course_change_log
  where exists (select 1 from admins where user_id = auth.uid())
    and (not only_open or reviewed_at is null)
  order by created_at desc
  limit 200;
$$;
revoke all on function public.course_changes(boolean) from public;
grant execute on function public.course_changes(boolean) to authenticated;

create or replace function public.review_course_change(change_id bigint, note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admins where user_id = auth.uid()) then raise exception 'Not allowed'; end if;
  update course_change_log set reviewed_at = now(), review_note = nullif(trim(coalesce(note, '')), '') where id = change_id;
end;
$$;
revoke all on function public.review_course_change(bigint, text) from public;
grant execute on function public.review_course_change(bigint, text) to authenticated;
