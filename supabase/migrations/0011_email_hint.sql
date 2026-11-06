-- "Forgot your email?": given a username, return a masked hint of the sign-in email
-- (e.g. "ma•••@gm•••.com"), never the full address. Guests without an email get null.
create or replace function public.email_hint(u text) returns text
language plpgsql security definer stable set search_path = public, auth as $$
declare e text; local text; dom text; tld text;
begin
  select au.email into e
  from profiles p join auth.users au on au.id = p.id
  where p.username = lower(trim(u)) and au.email is not null and au.email <> '';
  if e is null then return null; end if;
  local := split_part(e, '@', 1);
  dom := split_part(e, '@', 2);
  tld := case when position('.' in dom) > 0 then substring(dom from '(\.[^.]+)$') else '' end;
  dom := left(dom, length(dom) - length(tld));
  return left(local, least(2, greatest(1, length(local) - 1))) || '•••@' || left(dom, least(2, greatest(1, length(dom) - 1))) || '•••' || tld;
end $$;
revoke all on function public.email_hint(text) from public;
grant execute on function public.email_hint(text) to anon, authenticated;
