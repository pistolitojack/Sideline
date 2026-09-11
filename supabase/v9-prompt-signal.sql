-- Phase 3.3: prompt chips at upload.
--
-- Records what the coach reached for when asking for work: which starting
-- point (if any), whether they trusted it enough to send unchanged, how much
-- they wrote, and how long they sat with the screen before sending.
--
-- None of this changes how the director reads the prompt — it still gets the
-- same plain text field. This is signal only, and item 6 is what feeds it back.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

alter table sessions add column if not exists prompt_chip text;
alter table sessions add column if not exists prompt_source text;
alter table sessions add column if not exists prompt_length int;
alter table sessions add column if not exists prompt_dwell_ms int;

notify pgrst, 'reload schema';

select 'prompt signal ready' as result;
