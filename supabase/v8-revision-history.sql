-- Phase 2.5: natural-language revision history.
-- Each revision the coach asks for is appended here so the app can show a
-- little "changes you've asked for" list on the piece.
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table content_pieces
  add column if not exists revision_history jsonb default '[]'::jsonb;

select 'revision history ready' as result;
