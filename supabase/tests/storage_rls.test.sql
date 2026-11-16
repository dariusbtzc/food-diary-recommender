-- The meal-photos bucket is private and each user can only touch their own folder.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'a@test.local'),
  ('b0000000-0000-4000-8000-00000000000b', 'b@test.local');

insert into storage.objects (bucket_id, name, owner_id) values
  ('meal-photos', 'b0000000-0000-4000-8000-00000000000b/b.jpg', 'b0000000-0000-4000-8000-00000000000b');

-- Bucket ------------------------------------------------------------------------
select is((select public from storage.buckets where id = 'meal-photos'), false, 'meal-photos bucket is private');
select is((select file_size_limit from storage.buckets where id = 'meal-photos'), 1048576::bigint, 'Bucket limit is 1 MiB');
select is((select allowed_mime_types from storage.buckets where id = 'meal-photos'), array['image/jpeg'], 'Bucket accepts JPEG only');

-- Signed in as A ----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('meal-photos', 'a0000000-0000-4000-8000-00000000000a/a.jpg', 'a0000000-0000-4000-8000-00000000000a')$$,
  'A can insert into their own folder');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('meal-photos', 'b0000000-0000-4000-8000-00000000000b/x.jpg', 'a0000000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'A cannot insert into B''s folder');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('meal-photos', 'a.jpg', 'a0000000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'A cannot insert at the bucket root');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'meal-photos'),
  1, 'A sees only their own object');

select is(
  (select count(*)::int from storage.objects where name like 'b0000000-0000-4000-8000-00000000000b/%'),
  0, 'A cannot read B''s object');

update storage.objects set name = 'a0000000-0000-4000-8000-00000000000a/renamed.jpg'
  where name = 'a0000000-0000-4000-8000-00000000000a/a.jpg';
select is(
  (select count(*)::int from storage.objects where name = 'a0000000-0000-4000-8000-00000000000a/a.jpg'),
  1, 'A cannot update objects (no update policy)');

-- The Storage API sets this before deleting; without it a trigger blocks all
-- direct deletes, which would hide whether RLS is doing the work.
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = 'b0000000-0000-4000-8000-00000000000b/b.jpg';
delete from storage.objects where name = 'a0000000-0000-4000-8000-00000000000a/a.jpg';
select is(
  (select count(*)::int from storage.objects where bucket_id = 'meal-photos'),
  0, 'A can delete their own object');

-- Anonymous ---------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('meal-photos', 'a0000000-0000-4000-8000-00000000000a/anon.jpg')$$,
  '42501', null, 'anon cannot insert');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'meal-photos'),
  0, 'anon cannot read any object');

-- As postgres, bypassing RLS ---------------------------------------------------
reset role;
select is(
  (select count(*)::int from storage.objects where name = 'b0000000-0000-4000-8000-00000000000b/b.jpg'),
  1, 'A''s delete did not remove B''s object');

select * from finish();
rollback;
