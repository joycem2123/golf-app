-- Push notifications for edit requests, friend requests and being added to a round: each sent once.
alter table public.edit_requests add column if not exists notified_at timestamptz;
alter table public.friend_requests add column if not exists notified_at timestamptz;
alter table public.round_members add column if not exists notified_at timestamptz;
-- Nothing from before this goes out.
update public.edit_requests set notified_at = now() where notified_at is null;
update public.friend_requests set notified_at = now() where notified_at is null;
update public.round_members set notified_at = now() where notified_at is null;
