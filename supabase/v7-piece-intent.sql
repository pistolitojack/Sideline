-- Phase 2.3: compose follows the plan.
-- Each content piece records the director's planned kind and the one-line
-- reason (why_this_piece) it shows the coach as "why I made this".
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table content_pieces add column if not exists piece_kind text;
alter table content_pieces add column if not exists director_intent text;

select 'piece intent ready' as result;
