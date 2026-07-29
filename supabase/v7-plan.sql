-- Phase 2.2: the director's content plan.
-- sessions.plan holds the whole plan (read of footage, clusters, planned
-- pieces). media_assets get the cluster the director assigned each video.
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table sessions add column if not exists plan jsonb;

alter table media_assets add column if not exists cluster_id text;
alter table media_assets add column if not exists cluster_label text;

select 'director plan ready' as result;
