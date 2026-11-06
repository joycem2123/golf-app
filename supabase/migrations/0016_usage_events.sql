-- Anonymous feature-usage counts: which features get used, not who used them.
-- Each install has a random id (not linked to the account). No names, emails or scores.
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  install_id uuid not null,
  name text not null check (name ~ '^[a-z0-9_]{1,40}$'),
  props jsonb check (props is null or octet_length(props::text) <= 300),
  screen text check (screen is null or length(screen) <= 60),
  platform text check (platform is null or platform in ('ios', 'android', 'web')),
  app_version text check (app_version is null or length(app_version) <= 20),
  at timestamptz not null default now(),
  received_at timestamptz not null default now()
);
create index if not exists usage_events_name_at on public.usage_events (name, at);
create index if not exists usage_events_at on public.usage_events (at);
alter table public.usage_events enable row level security;
-- The app can add events but never read them back (you read them in the Supabase dashboard).
drop policy if exists "usage add" on public.usage_events;
create policy "usage add" on public.usage_events for insert to anon, authenticated
  with check (at > now() - interval '30 days' and at < now() + interval '1 day');
grant insert on public.usage_events to anon, authenticated;
revoke select, update, delete on public.usage_events from anon, authenticated;

-- Summary for the owner: last 30 days, per feature.
create or replace view public.usage_summary with (security_invoker = true) as
select name,
       count(*) as times_used,
       count(distinct install_id) as installs_using,
       max(at) as last_used
from public.usage_events
where at > now() - interval '30 days'
group by name
order by installs_using desc, times_used desc;
revoke all on public.usage_summary from anon, authenticated;
