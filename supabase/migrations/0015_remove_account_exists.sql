-- Two-step sign-in removed: no "does this account exist?" check.
drop function if exists public.account_exists(text);
drop table if exists public.lookup_log;
