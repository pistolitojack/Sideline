-- Phase 2.1: the optional prompt at upload. `prompt` is the new preferred
-- name for the coach's per-session note (the old `brief` is the legacy name);
-- existing briefs are copied into prompt. The unused `montage` toggle column
-- is dropped — the AI director decides montages now.
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table sessions add column if not exists prompt text;

update sessions set prompt = brief
where prompt is null and brief is not null;

alter table sessions drop column if exists montage;

select 'session prompt ready' as result;
