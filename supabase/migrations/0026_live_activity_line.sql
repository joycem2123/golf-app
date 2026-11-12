-- Which match on a whole-round Lock Screen card is the phone owner's (so the Dynamic Island can show
-- their match's score): its position in the card's match list, or -1 for none.
alter table public.live_activity_tokens add column if not exists line_index int not null default -1;
