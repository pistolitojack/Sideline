-- Phase 3.5: silent review behaviour tracking.
--
-- Nothing here is shown to the coach. It records HOW a decision was made, not
-- just what it was: a reel approved in two seconds without opening the detail
-- is a different signal from one approved after thirty seconds of study, even
-- though both land as "approved".
--
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table content_pieces add column if not exists reviewed_at timestamptz;
alter table content_pieces add column if not exists review_dwell_ms int;
alter table content_pieces add column if not exists detail_opened boolean;
alter table content_pieces add column if not exists revision_count int not null default 0;

notify pgrst, 'reload schema';

select 'review behavior ready' as result;

-- Incrementing in the database rather than read-modify-write from the app, so
-- two revisions in quick succession can't clobber each other's count.
create or replace function bump_revision_count(piece_id uuid)
  returns void language sql security invoker as $$
  update content_pieces
     set revision_count = coalesce(revision_count, 0) + 1
   where id = piece_id;
$$;

grant execute on function bump_revision_count(uuid) to authenticated;

select 'revision counter ready' as result;
