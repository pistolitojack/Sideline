-- V2 creative engine part 3: scanned Instagram brand brief.
-- Run ONCE in Supabase: SQL Editor → New snippet → paste → Run.

alter table coaches add column if not exists ig_profile text;

select 'ig_profile column ready' as result;
