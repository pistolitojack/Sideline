-- Stop cleanup re-deleting files that are already gone.
--
-- THE PROBLEM
-- When cleanup removes a clip's intermediates or the clip itself, it deletes the
-- FILE but keeps the media_assets ROW. That is deliberate: `moments` and every
-- piece's edl reference raw asset ids, so dropping the row would break the admin
-- view and the coach's learning history.
--
-- The side effect was that each run recomputed the same paths, asked storage to
-- delete files that had already gone, and counted them as removed. The log read
-- "cleanup done — removed 217 files" every six hours while deleting nothing. A
-- number that wrong is worse than no number, especially since the log is how we
-- verify everything else.
--
-- THE FIX
-- Mark what has already been purged, and skip it.
--
-- TWO COLUMNS, NOT ONE. A clip's wav and transcript become worthless the moment
-- its session finishes; the clip itself survives another 30 days so "ask for
-- changes" keeps working. They are purged on different clocks, so one mark could
-- never say which had happened.
--
-- These are for RAW assets. Renders need nothing — their rows are deleted along
-- with their files, which is what makes a cleared reel legible to the app.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste the whole thing → Run.

alter table media_assets
  add column if not exists artifacts_purged_at timestamptz;
alter table media_assets
  add column if not exists file_purged_at timestamptz;

notify pgrst, 'reload schema';

select 'purge tracking ready' as result;

-- ═══════════════════════════════════════════════════════════════
-- WHAT TO EXPECT
--
-- Existing rows start unmarked, so the FIRST cleanup after this migration
-- re-reports the same numbers one last time (158 intermediates, 59 raw videos),
-- deletes nothing, and marks every row. From the run after that the log tells
-- the truth — all zeroes until there is genuinely something new to remove.
--
-- To watch it settle:
--
--   select
--     count(*) as raw_assets,
--     count(artifacts_purged_at) as intermediates_marked,
--     count(file_purged_at)      as clips_marked
--   from media_assets
--   where kind = 'raw';
-- ═══════════════════════════════════════════════════════════════
