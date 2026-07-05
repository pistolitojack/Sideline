-- ————————————————————————————————————————————————
-- Sideline storage bucket for raw uploads (Phase 3)
-- Run ONCE in Supabase: SQL Editor → paste → Run
-- ————————————————————————————————————————————————

-- Private bucket for raw training footage. Files live under
-- {auth_user_id}/{session_id}/{filename} so each coach can only
-- touch their own folder.
insert into storage.buckets (id, name, public)
values ('raw', 'raw', false)
on conflict (id) do nothing;

drop policy if exists "own raw upload" on storage.objects;
drop policy if exists "own raw update" on storage.objects;
drop policy if exists "own raw read" on storage.objects;
drop policy if exists "own raw delete" on storage.objects;

create policy "own raw upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own raw update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own raw read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own raw delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

select 'Storage ready — raw bucket + policies in place' as result;
