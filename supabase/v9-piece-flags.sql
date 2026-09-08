-- Phase 3.1: the objective scorecard.
-- Every finished piece records which structural checks fired on it, before
-- the coach ever sees it. Flags are our internal signal — the app never shows
-- them to the coach.
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table content_pieces add column if not exists flags jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';

select 'piece flags ready' as result;
