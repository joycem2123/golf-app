-- Clutch Up Pro ($24.99/yr through the App Store): creating events, AI stories and scorecard uploads.
-- The organiser pays: friends in a Pro member's round or event use those features free.
--
-- The paywall is OFF until launch (everyone has every feature). At launch, run
--   select public.start_paywall();
-- which turns it on and gives everyone who already has an account a free year (early testers).

-- Switches the app reads (e.g. whether the paywall is on). Everyone can read; only the server writes.
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists "config read" on public.app_config;
create policy "config read" on public.app_config for select to anon, authenticated using (true);
insert into public.app_config (key, value) values ('paywall', '{"on": false}') on conflict (key) do nothing;

-- Who has Pro, and until when. Kept apart from profiles (which people can edit): readable by its owner,
-- written only by the server (the App Store, through RevenueCat, and the launch grant).
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pro_until timestamptz,
  will_renew boolean,
  product text,
  -- Early testers: free Pro until this date.
  beta_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "own subscription" on public.subscriptions;
create policy "own subscription" on public.subscriptions for select to authenticated using (user_id = auth.uid());

-- Does this account have Pro (or is the paywall off)? Server-side only (any account id).
create or replace function public.has_pro_for(uid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select (value->>'on')::boolean from app_config where key = 'paywall'), false) = false
    or exists (select 1 from subscriptions s where s.user_id = uid and (s.pro_until > now() or s.beta_until > now()));
$$;
revoke all on function public.has_pro_for(uuid) from public, anon, authenticated;

-- Do I have Pro? (For rules and the app.)
create or replace function public.has_pro() returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and public.has_pro_for(auth.uid());
$$;
grant execute on function public.has_pro() to authenticated;

-- My Pro status for the app: { pro, paywall, until, beta_until, will_renew }.
create or replace function public.my_pro() returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'pro', public.has_pro(),
    'paywall', coalesce((select (value->>'on')::boolean from app_config where key = 'paywall'), false),
    'until', s.pro_until, 'beta_until', s.beta_until, 'will_renew', s.will_renew)
  from (select 1) one left join subscriptions s on s.user_id = auth.uid();
$$;
grant execute on function public.my_pro() to authenticated;

-- Creating an event is a Pro feature (the organiser's). Existing events keep working.
drop policy if exists "events insert" on public.events;
create policy "events insert" on public.events for insert to authenticated with check (owner = auth.uid() and public.has_pro());

-- Launch: turn the paywall on and give every existing account a free year. Run once, by the owner.
create or replace function public.start_paywall() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into subscriptions (user_id, beta_until)
    select u.id, now() + interval '1 year' from auth.users u
    on conflict (user_id) do update set beta_until = greatest(coalesce(subscriptions.beta_until, now()), excluded.beta_until), updated_at = now();
  update app_config set value = jsonb_build_object('on', true, 'launched', now()), updated_at = now() where key = 'paywall';
end $$;
revoke all on function public.start_paywall() from public, anon, authenticated;
