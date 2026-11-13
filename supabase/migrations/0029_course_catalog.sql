-- Courses brought in from the online course database (GolfCourseAPI), looked up when someone searches for a course
-- the app doesn't have. Each course and each search is fetched once and kept here for everyone (the provider's terms
-- allow caching what our users ask for; no bulk copying). Only the course-catalog function writes these.
create table if not exists public.catalog_courses (
  id text primary key,                 -- the app's course id, e.g. gca-fe90656b
  source text not null,                -- 'golfcourseapi'
  source_id text not null,
  name text not null,
  city text,
  region text,
  country text,
  data jsonb not null,                 -- the course in the app's own format (tees, ratings, holes)
  fetched_at timestamptz not null default now(),
  unique (source, source_id)
);
alter table public.catalog_courses enable row level security;
drop policy if exists "catalog courses read" on public.catalog_courses;
create policy "catalog courses read" on public.catalog_courses for select to authenticated using (true);

-- Recent searches, so the same words don't go to the provider twice (kept 30 days).
create table if not exists public.catalog_searches (
  q text primary key,
  results jsonb not null,
  searched_at timestamptz not null default now()
);
alter table public.catalog_searches enable row level security;
-- No policies: only the function (server side) reads and writes searches.
