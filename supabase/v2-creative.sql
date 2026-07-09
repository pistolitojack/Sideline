-- V2 creative engine: per-session coach brief + montage request.
-- Run ONCE in Supabase: SQL Editor → New snippet → paste → Run.

alter table sessions add column if not exists brief text;
alter table sessions add column if not exists montage boolean default false;

select 'V2 columns ready' as result;
