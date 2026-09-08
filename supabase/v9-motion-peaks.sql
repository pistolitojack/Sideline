-- Phase 3.7b: motion peaks reach the editor.
-- Ingest already measures where each clip's action actually happens (it uses
-- that to decide which frames to show the AI). This stores those beats so the
-- composer can be told where to land its cuts instead of guessing from stills.
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table media_assets add column if not exists motion_peaks jsonb;

notify pgrst, 'reload schema';

select 'motion_peaks column ready' as result;
