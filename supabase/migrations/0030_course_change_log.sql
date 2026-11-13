-- Audit trail for scorecard edits. A player's edit only changes their own copy of a course, but every saved change
-- is logged here (who, which course, exactly what changed, and how: by hand or from a photo) and the admins get a
-- push notification, so a card can be reviewed and corrected for everyone if needed.
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
