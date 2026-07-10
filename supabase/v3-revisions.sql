-- V2 creative engine part 2: the revision loop.
-- Run ONCE in Supabase: SQL Editor → New snippet → paste → Run.

alter table content_pieces add column if not exists revision_note text;

select 'revision column ready' as result;
