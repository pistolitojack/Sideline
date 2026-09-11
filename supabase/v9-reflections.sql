-- Phase 3.7: self-reflection after each session.
--
-- After a session is fully reviewed, the AI writes 2-3 sentences about what it
-- learned about THIS coach's taste. Item 6 gives the director a list of what
-- happened; this gives it a conclusion. Raw history grows and gets noisier —
-- a synthesized preference stays sharp.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.

create table if not exists coach_reflections (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id) on delete cascade,
  session_id uuid references sessions (id) on delete set null,
  reflection text not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_reflections_coach_idx
  on coach_reflections (coach_id, created_at desc);

-- One reflection per session, so a re-run can't stack duplicates.
create unique index if not exists coach_reflections_session_uniq
  on coach_reflections (session_id) where session_id is not null;

alter table coach_reflections enable row level security;

-- A coach can read what the AI has learned about them. They cannot write it,
-- and they never see another coach's.
drop policy if exists "own reflections - select" on coach_reflections;
create policy "own reflections - select" on coach_reflections
  for select using (
    coach_id in (select id from coaches where auth_user_id = auth.uid())
  );

drop policy if exists "admin reads all reflections" on coach_reflections;
create policy "admin reads all reflections" on coach_reflections
  for select using (is_admin());

notify pgrst, 'reload schema';

select 'reflections ready' as result;
