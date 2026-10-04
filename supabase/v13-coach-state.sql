-- Split a coach's location into city AND state.
--
-- WHY: the city field was a single input whose placeholder already read
-- "City, State" — and the founder's own row came back holding just "GA". The
-- hint was there and it still did not elicit both halves. One box asking for two
-- things reliably gets one of them, and which one you get is a coin toss: the
-- director then builds location hashtags from either a city with no region or a
-- region with no city.
--
-- Two fields ask two questions, so both get answered.
--
-- Nothing is migrated automatically. A row holding "GA" in `city` is wrong, but
-- guessing which half it is — and inventing the other — would put made-up data
-- where the AI reads it as fact, which is the exact failure the onboarding work
-- just finished removing. Existing coaches fix it themselves through the new
-- "Edit your Coach DNA" route, or with the UPDATE at the bottom.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste the whole thing → Run.

alter table coaches add column if not exists state text;

notify pgrst, 'reload schema';

select 'coach state ready' as result;

-- ═══════════════════════════════════════════════════════════════
-- To correct a row by hand instead (replace both values):
--
--   update coaches
--      set city  = 'Atlanta',
--          state = 'GA'
--    where auth_user_id = (
--      select id from auth.users where email = 'you@example.com'
--    );
--
-- To see where everyone stands:
--
--   select c.name, u.email, c.city, c.state
--   from coaches c
--   join auth.users u on u.id = c.auth_user_id
--   order by c.created_at desc;
-- ═══════════════════════════════════════════════════════════════
