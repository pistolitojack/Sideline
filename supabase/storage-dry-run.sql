-- STORAGE DRY RUN — reads only. Deletes nothing. Changes nothing.
--
-- Answers three questions before any retention policy is written:
--   1. Where is the space actually going right now?
--   2. How much would each candidate retention window free?
--   3. Is anything sitting in the bucket that nothing in the database knows
--      about?
--
-- Sizes are REAL bytes read from Supabase's own storage metadata, not
-- estimates. (The business brief guesses ~10MB per reel and ~40MB per clip and
-- marks both [CONFIRM] — this is that confirmation.)
--
-- Run in Supabase: SQL Editor → New query → paste the whole thing → Run.

with sized as (
  -- Every file the database has a record of, with its true size on disk.
  select
    ma.id,
    ma.kind,
    ma.storage_path,
    coalesce((o.metadata->>'size')::bigint, 0) as bytes,
    (o.name is null) as missing_from_storage
  from media_assets ma
  left join storage.objects o
    on o.bucket_id = 'raw' and o.name = ma.storage_path
),
tagged as (
  -- Attach the piece each file belongs to. Reels hang off render_asset_id;
  -- posters are referenced from inside the piece's edl, so both joins are
  -- needed or every poster would look unowned.
  select
    s.id,
    s.bytes,
    s.missing_from_storage,
    case
      when s.kind = 'raw' and s.storage_path ilike '%.mp4' then 'raw footage'
      when s.kind = 'raw' then 'raw (other)'
      when s.storage_path ilike '%.mp4' then 'finished reel'
      when s.storage_path ilike '%.jpg' then 'poster image'
      else 'other'
    end as filetype,
    p.id as piece_id,
    p.status as piece_status,
    -- When the coach decided. Falls back to creation date for pieces made
    -- before review timestamps existed.
    coalesce(p.reviewed_at, p.created_at) as decided_at
  from sized s
  left join content_pieces p
    on p.render_asset_id = s.id
    or p.edl->>'poster_asset_id' = s.id::text
),
reels as (
  -- Only the files a retention policy would ever touch: the finished reel and
  -- its poster. Raw footage already purges at 30 days in cleanup().
  select * from tagged
  where filetype in ('finished reel', 'poster image')
)
select * from (
  -- ——— 1. the whole bucket, from storage itself ———
  select 1 as sort, 'THE BUCKET, MEASURED DIRECTLY' as line,
         count(*)::bigint as files,
         round(sum(coalesce((metadata->>'size')::bigint, 0)) / 1048576.0, 1) as mb
  from storage.objects where bucket_id = 'raw'

  -- ——— 2. where that space is going ———
  union all
  select 2, 'BY TYPE (files the database knows about)', null, null
  union all
  select 3, '   ' || filetype, count(*)::bigint,
         round(sum(bytes) / 1048576.0, 1)
  from tagged group by filetype

  -- ——— 3. reels and posters by the coach's decision ———
  union all
  select 4, 'REELS + POSTERS BY DECISION', null, null
  union all
  select 5, '   ' || coalesce(piece_status, '(no piece — orphan)'),
         count(*)::bigint, round(sum(bytes) / 1048576.0, 1)
  from reels group by piece_status

  -- ——— 4. what each candidate window would free, TODAY ———
  union all
  select 6, 'SKIPPED — what each window frees today', null, null
  union all
  select 7, '   skipped, decided over 7 days ago', count(*)::bigint,
         round(sum(bytes) / 1048576.0, 1)
  from reels where piece_status = 'skipped'
    and decided_at < now() - interval '7 days'
  union all
  select 8, '   skipped, decided over 14 days ago', count(*)::bigint,
         round(sum(bytes) / 1048576.0, 1)
  from reels where piece_status = 'skipped'
    and decided_at < now() - interval '14 days'
  union all
  select 9, '   skipped, decided over 30 days ago', count(*)::bigint,
         round(sum(bytes) / 1048576.0, 1)
  from reels where piece_status = 'skipped'
    and decided_at < now() - interval '30 days'

  union all
  select 10, 'APPROVED + DOWNLOADED — same question', null, null
  union all
  select 11, '   approved/downloaded over 90 days ago', count(*)::bigint,
         round(sum(bytes) / 1048576.0, 1)
  from reels where piece_status in ('approved', 'downloaded')
    and decided_at < now() - interval '90 days'
  union all
  select 12, '   approved/downloaded over 180 days ago', count(*)::bigint,
         round(sum(bytes) / 1048576.0, 1)
  from reels where piece_status in ('approved', 'downloaded')
    and decided_at < now() - interval '180 days'
  union all
  select 13, '   approved/downloaded over 365 days ago', count(*)::bigint,
         round(sum(bytes) / 1048576.0, 1)
  from reels where piece_status in ('approved', 'downloaded')
    and decided_at < now() - interval '365 days'

  -- ——— 5. the real per-file averages, to replace the guesses ———
  union all
  select 14, 'AVERAGE FILE SIZE (MB per file)', null, null
  union all
  select 15, '   ' || filetype, count(*)::bigint,
         round(avg(bytes) / 1048576.0, 2)
  from tagged where bytes > 0 group by filetype

  -- ——— 6. anything that looks wrong ———
  union all
  select 16, 'SANITY CHECKS', null, null
  union all
  select 17, '   database rows whose file is already gone', count(*)::bigint, null
  from tagged where missing_from_storage
  union all
  select 18, '   reels/posters with no piece (already collectable)',
         count(*)::bigint, round(sum(bytes) / 1048576.0, 1)
  from reels where piece_id is null
  union all
  -- The bucket total minus everything the database can account for. This is
  -- the wav + transcript artifacts cleanup() already handles, plus anything
  -- genuinely unaccounted for. If this number is large, something is leaking
  -- that no retention policy here would catch.
  select 19, '   in the bucket but not in any table above', null,
         round((
           (select sum(coalesce((metadata->>'size')::bigint, 0))
              from storage.objects where bucket_id = 'raw')
           - (select coalesce(sum(bytes), 0) from tagged)
         ) / 1048576.0, 1)
) r
order by sort, line;
