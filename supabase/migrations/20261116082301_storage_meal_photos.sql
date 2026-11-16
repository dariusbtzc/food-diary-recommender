-- Private bucket for meal photos. Objects live at {auth.uid()}/{uuid}.jpg; the
-- server picks the path and issues a signed upload URL, the client compresses
-- (max 1600 px, ~200 KB JPEG) and uploads. Reads go through 1-hour signed URLs.
-- Created here (not config.toml) so `supabase db push` creates it when hosted.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-photos', 'meal-photos', false, 1048576, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS on storage.objects is enabled by Supabase. Each policy limits a signed-in
-- user to their own top-level folder in this bucket. No update policy: photos
-- are never overwritten. Nothing for anon.

create policy "meal_photos_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "meal_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "meal_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
