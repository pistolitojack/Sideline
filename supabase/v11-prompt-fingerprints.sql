-- Automatic prompt versioning.
--
-- THE PROBLEM THIS FIXES
-- Phase 3.8 stamped every piece with a prompt version number typed by hand in
-- worker/src/stages.js. That is only correct while someone remembers to bump
-- it, and a forgotten bump fails in the worst direction available: the column
-- does not go blank, it reports the OLD version for a NEW prompt. Two different
-- prompts end up sharing a number, every comparison built on them is wrong, and
-- nothing in the data suggests anything is off. A column that lies quietly is
-- worse than no column.
--
-- WHAT REPLACES IT
-- An 8-character hash derived from the source of the function that builds each
-- prompt. Reword an instruction and the hash changes by itself. Nothing to
-- remember, nothing to bump, no way to drift.
--
-- THE OLD COLUMNS ARE LEFT IN PLACE ON PURPOSE. They hold the hand-set version
-- of every piece made before today and that is real history. They simply stop
-- being written. Pieces from before this migration have a version and no
-- fingerprint; pieces after have a fingerprint and no version. That boundary is
-- visible in the data instead of hidden inside it.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste the whole thing → Run.

alter table content_pieces add column if not exists director_prompt_fp text;
alter table content_pieces add column if not exists compose_prompt_fp text;
alter table content_pieces add column if not exists revise_prompt_fp text;

alter table coach_reflections add column if not exists reflect_prompt_fp text;

notify pgrst, 'reload schema';

select 'prompt fingerprints ready' as result;

-- ═══════════════════════════════════════════════════════════════
-- WHAT THIS BUYS YOU — the question that was impossible before.
--
-- Which composer prompt produces cleaner reels? Run this after a few sessions
-- on each version. first_seen orders them for you, so the newest row is the
-- prompt running right now:
--
--   select compose_prompt_fp as prompt,
--          count(*) as pieces,
--          min(created_at)::date as first_seen,
--          round(avg(jsonb_array_length(coalesce(flags, '[]'::jsonb))), 2)
--            as avg_flags,
--          count(*) filter (where jsonb_array_length(coalesce(flags, '[]'::jsonb)) = 0)
--            as clean_pieces
--   from content_pieces
--   where compose_prompt_fp is not null
--   group by compose_prompt_fp
--   order by first_seen;
--
-- Treat anything under ~10 pieces per version as a hint, not a result. That is
-- the same trap the director fell into when it dropped montages after one
-- rejection.
--
-- And to see which specific problem a prompt change moved:
--
--   select p.compose_prompt_fp as prompt, f.flag, count(*)
--   from content_pieces p,
--        jsonb_array_elements_text(p.flags) as f(flag)
--   where p.compose_prompt_fp is not null
--   group by p.compose_prompt_fp, f.flag
--   order by p.compose_prompt_fp, count(*) desc;
-- ═══════════════════════════════════════════════════════════════
