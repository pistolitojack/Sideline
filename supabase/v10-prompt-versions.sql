-- Phase 3.8: prompt version tracking.
--
-- Every piece records which version of each prompt produced it. This is the
-- ruler that turns anecdote into evidence when we finally touch the judgment
-- layer: "pieces made with compose v1 averaged 2.1 flags; v2 averaged 0.9" is
-- a sentence we cannot currently say, because everything is mixed together.
--
-- The numbers are bumped BY HAND in worker/src/stages.js (PROMPT_VERSIONS)
-- when a prompt changes meaningfully. Manual on purpose — bumping it is a
-- deliberate statement that a change is worth measuring.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table content_pieces add column if not exists director_prompt_version int;
alter table content_pieces add column if not exists compose_prompt_version int;
alter table content_pieces add column if not exists revise_prompt_version int;

-- The reflection prompt has its own version. It was rewritten once already
-- (the craft/preference split), which is exactly the kind of change this is
-- meant to make visible.
alter table coach_reflections add column if not exists reflect_prompt_version int;

notify pgrst, 'reload schema';

select 'prompt versions ready' as result;
