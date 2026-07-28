-- Phase 1.5: Instagram profile refresh. Tracks when the coach's IG was last
-- scanned so the worker can re-scan if it's null or older than 30 days.
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table coaches add column if not exists scanned_at timestamptz;

select 'scanned_at column ready' as result;
