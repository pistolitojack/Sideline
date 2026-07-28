-- Phase 1.2: coach location. A city ("City, State") that later shapes
-- location hashtags and audience tuning. Nullable — soft-required, not hard.
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table coaches add column if not exists city text;

select 'city column ready' as result;
