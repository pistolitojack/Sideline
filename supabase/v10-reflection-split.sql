-- Phase 3.7b: split the reflection into craft and preference.
--
-- The first real reflection got it wrong in a way worth designing against.
-- Jack rejected ONE badly-cut montage — repeated footage — and the AI concluded
-- "prioritise story pieces over high-energy multi-drill cuts". It turned a
-- craft problem into a menu rule, and that rule would have reached every
-- future session as fact.
--
-- The two kinds of lesson are genuinely different:
--   craft      — how a piece was MADE. Applies to every kind. The common case.
--   preference — which KINDS a coach wants. Rare, and needs real evidence,
--                because getting it wrong silently removes a whole format.
--
-- Separate fields make the mistake structurally impossible: the AI cannot
-- write a menu rule while describing a kitchen problem, because they are
-- different questions.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table coach_reflections add column if not exists craft_lesson text;
alter table coach_reflections add column if not exists preference_note text;
alter table coach_reflections add column if not exists decisions_at_time int;

-- `reflection` predates the split and is kept so old rows still read, but new
-- rows fill the two fields above.
alter table coach_reflections alter column reflection drop not null;

notify pgrst, 'reload schema';

-- Remove the one bad note. It was written by a prompt we have since agreed was
-- wrong, and leaving it would teach the director to avoid montages.
delete from coach_reflections
where reflection ilike '%prioritize standalone story-driven%'
   or reflection ilike '%over high-energy multi-drill%';

select count(*) as reflections_remaining from coach_reflections;
