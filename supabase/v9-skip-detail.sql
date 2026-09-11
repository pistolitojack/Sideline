-- Phase 3.4: better skip reasons + the coach's own words at review.
--
-- `skip_reason` already exists and keeps holding the reason the coach tapped.
-- This adds the optional free-text note underneath it — "what would've made it
-- better?" — which is where the actual teaching signal lives. A reason chip
-- says a piece was wrong; the note says how.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table content_pieces add column if not exists skip_reason_text text;

notify pgrst, 'reload schema';

select 'skip detail ready' as result;
