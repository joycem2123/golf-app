-- Sign in with a username: returns the account's email ONLY when the password is right,
-- so emails are never revealed to someone who just knows a username.
-- After 5 wrong tries a username is locked for 15 minutes (brute-force protection).
create table if not exists public.login_failures (
  username text not null,
  at timestamptz not null default now()
);
create index if not exists login_failures_username_at on public.login_failures (username, at);
alter table public.login_failures enable row level security; -- no policies: not readable from the app

create or replace function public.login_email(u text, pw text) returns text
language plpgsql security definer volatile set search_path = public, auth, extensions as $$
declare name text := lower(trim(both from replace(coalesce(u, ''), '@', ''))); e text; hash text;
begin
  if (select count(*) from login_failures where username = name and at > now() - interval '15 minutes') >= 5 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;
  select au.email, au.encrypted_password into e, hash
  from profiles p join auth.users au on au.id = p.id
  where p.username = name and au.email is not null and au.email <> '' and au.deleted_at is null;
  if e is not null and hash is not null and hash <> '' and extensions.crypt(pw, hash) = hash then
    delete from login_failures where username = name;
    return e;
  end if;
  insert into login_failures (username) values (name);
  delete from login_failures where at < now() - interval '1 day';
  return null;
end $$;
revoke all on function public.login_email(text, text) from public;
grant execute on function public.login_email(text, text) to anon, authenticated;
