-- ————————————————————————————————————————————————
-- Sideline database schema (from SPEC.md)
-- Run this ONCE in your Supabase project:
-- Dashboard → SQL Editor → New query → paste everything → Run
-- ————————————————————————————————————————————————

create extension if not exists "pgcrypto";

-- The coach's profile — one row per signed-up coach ("Coach DNA")
create table if not exists coaches (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null,
  sport text,
  tones text[] default '{}',
  accent_hex text default '#C8102E',
  audience text,
  mission text,
  ig_handle text,
  voice_memo_transcript text,
  is_active boolean default false,
  created_at timestamptz default now()
);

-- One upload batch = one session
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coaches (id) on delete cascade,
  status text not null default 'uploading'
    check (status in ('uploading','queued','processing','ready','failed')),
  created_at timestamptz default now()
);

-- Raw uploads and finished renders
create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  storage_path text not null,
  kind text not null check (kind in ('raw','render')),
  duration_sec double precision,
  width int,
  height int
);

-- Moments the AI found in the footage
create table if not exists moments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  asset_id uuid references media_assets (id) on delete set null,
  t_start double precision not null,
  t_end double precision not null,
  type text,
  score double precision,
  reason text,
  transcript_span text
);

-- Finished pieces the coach reviews
create table if not exists content_pieces (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  format text check (format in ('reel','story')),
  edl jsonb,
  render_asset_id uuid references media_assets (id) on delete set null,
  hook text,
  caption text,
  hashtags text,
  cta text,
  why text,
  suggested_slot text,
  suggested_sound text,
  status text not null default 'rendering'
    check (status in ('rendering','ready','approved','skipped','downloaded')),
  skip_reason text,
  created_at timestamptz default now()
);

-- The pipeline job queue (polled by the worker from Phase 4 on)
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  stage text not null,
  status text not null default 'pending'
    check (status in ('pending','running','done','failed')),
  attempts int default 0,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ————————————————————————————————————————————————
-- Row Level Security: coaches can only see and touch their own rows.
-- (The background worker uses the service-role key, which bypasses RLS.)
-- ————————————————————————————————————————————————

alter table coaches enable row level security;
alter table sessions enable row level security;
alter table media_assets enable row level security;
alter table moments enable row level security;
alter table content_pieces enable row level security;
alter table jobs enable row level security;

create policy "own coach row - select" on coaches
  for select using (auth_user_id = auth.uid());
create policy "own coach row - insert" on coaches
  for insert with check (auth_user_id = auth.uid());
create policy "own coach row - update" on coaches
  for update using (auth_user_id = auth.uid());

create policy "own sessions - all" on sessions
  for all using (
    coach_id in (select id from coaches where auth_user_id = auth.uid())
  ) with check (
    coach_id in (select id from coaches where auth_user_id = auth.uid())
  );

create policy "own media - all" on media_assets
  for all using (
    session_id in (
      select s.id from sessions s
      join coaches c on c.id = s.coach_id
      where c.auth_user_id = auth.uid()
    )
  ) with check (
    session_id in (
      select s.id from sessions s
      join coaches c on c.id = s.coach_id
      where c.auth_user_id = auth.uid()
    )
  );

create policy "own moments - select" on moments
  for select using (
    session_id in (
      select s.id from sessions s
      join coaches c on c.id = s.coach_id
      where c.auth_user_id = auth.uid()
    )
  );

create policy "own pieces - all" on content_pieces
  for all using (
    session_id in (
      select s.id from sessions s
      join coaches c on c.id = s.coach_id
      where c.auth_user_id = auth.uid()
    )
  ) with check (
    session_id in (
      select s.id from sessions s
      join coaches c on c.id = s.coach_id
      where c.auth_user_id = auth.uid()
    )
  );

create policy "own jobs - all" on jobs
  for all using (
    session_id in (
      select s.id from sessions s
      join coaches c on c.id = s.coach_id
      where c.auth_user_id = auth.uid()
    )
  ) with check (
    session_id in (
      select s.id from sessions s
      join coaches c on c.id = s.coach_id
      where c.auth_user_id = auth.uid()
    )
  );
