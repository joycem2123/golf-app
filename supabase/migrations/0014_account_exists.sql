-- Two-step sign-in: "Is there an account for this email or username?"
-- Limited to 20 checks per 15 minutes per network address, so it can't be used to test long lists of emails.
create table if not exists public.lookup_log (
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists lookup_log_ip_at on public.lookup_log (ip, at);
alter table public.lookup_log enable row level security; -- no policies: not readable from the app

create or replace function public.account_exists(identifier text) returns boolean
language plpgsql security definer volatile set search_path = public, auth as $$
declare
  h json := nullif(current_setting('request.headers', true), '')::json;
  client_ip text := coalesce(
    nullif(trim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''),
    h ->> 'cf-connecting-ip', h ->> 'x-real-ip', 'unknown');
  v text := lower(trim(coalesce(identifier, '')));
  recent int;
begin
  select count(*) into recent from lookup_log l where l.ip = client_ip and l.at > now() - interval '15 minutes';
  if recent >= (case when client_ip = 'unknown' then 200 else 20 end) then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;
  insert into lookup_log (ip) values (client_ip);
  delete from lookup_log where at < now() - interval '1 day';
  if position('@' in v) > 1 then
    return exists (select 1 from auth.users where lower(email) = v and deleted_at is null);
  end if;
  v := ltrim(v, '@');
  return exists (
    select 1 from profiles p join auth.users au on au.id = p.id
    where p.username = v and au.email is not null and au.email <> '' and au.deleted_at is null);
end $$;
revoke all on function public.account_exists(text) from public;
grant execute on function public.account_exists(text) to anon, authenticated;
