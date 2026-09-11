-- Phase 3.2: admin session view + founder ratings.
--
-- Two parts:
--   1. Rating columns — the founder's calibration signal on each piece.
--   2. An `admins` table and matching RLS policies, so the admin view can read
--      sessions across ALL coaches.
--
-- Why an admins table instead of an ADMIN_EMAIL env var: an env var can gate a
-- page but cannot gate the database. Row-level security is what actually stops
-- one coach reading another's footage, and it needs to know who the admin is.
-- Keeping the answer in one place means one setting, not two that can disagree
-- — and it keeps the founder's email out of the repo.
--
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run.
-- THEN run the INSERT at the bottom with your own email.

-- ——— 1. founder ratings ———
alter table content_pieces add column if not exists hook_rating int
  check (hook_rating between 1 and 5);
alter table content_pieces add column if not exists pacing_rating int
  check (pacing_rating between 1 and 5);
alter table content_pieces add column if not exists copy_rating int
  check (copy_rating between 1 and 5);
alter table content_pieces add column if not exists would_post_rating int
  check (would_post_rating between 1 and 5);
alter table content_pieces add column if not exists founder_notes text;
alter table content_pieces add column if not exists rated_at timestamptz;

-- ——— 2. who is an admin ———
create table if not exists admins (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;

-- You can see your own admin row (and nobody else's). The app uses this to
-- decide whether to render the admin view at all.
drop policy if exists "see own admin row" on admins;
create policy "see own admin row" on admins
  for select using (lower(email) = lower(auth.jwt() ->> 'email'));

-- SECURITY DEFINER so this answers correctly regardless of RLS. Resolves the caller's email TWO ways: the JWT's email claim, and — if that
-- claim is absent — a lookup in auth.users by user id. Depending on the claim
-- alone locked the founder out of their own tool once already.
create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(
      nullif(auth.jwt() ->> 'email', ''),
      (select u.email from auth.users u where u.id = auth.uid())
    ))
  );
$$;

grant execute on function is_admin() to authenticated, anon;

-- ——— 3. admin read access across every coach ———
-- These are ADDITIVE. Coaches keep their existing "own rows only" policies;
-- Postgres ORs policies together, so nothing a coach can currently see changes.
drop policy if exists "admin reads all coaches" on coaches;
create policy "admin reads all coaches" on coaches for select using (is_admin());

drop policy if exists "admin reads all sessions" on sessions;
create policy "admin reads all sessions" on sessions for select using (is_admin());

drop policy if exists "admin reads all media" on media_assets;
create policy "admin reads all media" on media_assets for select using (is_admin());

drop policy if exists "admin reads all moments" on moments;
create policy "admin reads all moments" on moments for select using (is_admin());

drop policy if exists "admin reads all pieces" on content_pieces;
create policy "admin reads all pieces" on content_pieces for select using (is_admin());

-- ——— 4. admin can save ratings ———
drop policy if exists "admin rates pieces" on content_pieces;
create policy "admin rates pieces" on content_pieces
  for update using (is_admin()) with check (is_admin());

notify pgrst, 'reload schema';

select 'founder ratings ready — now run the insert below with YOUR email' as result;

-- ═══════════════════════════════════════════════════════════════
-- RUN THIS SECOND, with the email you log into Sideline with:
--
--   insert into admins (email) values ('you@example.com')
--   on conflict (email) do nothing;
--
-- Confirm it took:
--   select * from admins;
--
-- NOTE: `select is_admin()` returns FALSE in the SQL Editor even when set up
-- correctly — the editor has no logged-in user, so there is no email to match.
-- The real test is opening /admin/sessions in the browser.
-- ═══════════════════════════════════════════════════════════════
