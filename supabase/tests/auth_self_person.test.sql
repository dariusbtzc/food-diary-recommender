-- The auth.users trigger creates exactly one is_self person per user.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'a@test.local'),
  ('b0000000-0000-4000-8000-00000000000b', 'b@test.local');

select is(
  (select count(*)::int from public.people
    where owner_id = 'a0000000-0000-4000-8000-00000000000a' and is_self),
  1, 'A new user gets one is_self person');

select is(
  (select name from public.people
    where owner_id = 'a0000000-0000-4000-8000-00000000000a' and is_self),
  'You', 'The self person is named You');

select is(
  (select count(*)::int from public.people
    where owner_id = 'b0000000-0000-4000-8000-00000000000b' and is_self),
  1, 'Each user gets their own self person');

-- Re-running the trigger body for an existing user is a no-op, not an error.
select lives_ok(
  $$insert into public.people (owner_id, name, is_self)
    values ('a0000000-0000-4000-8000-00000000000a', 'You', true)
    on conflict (owner_id) where is_self do nothing$$,
  'A second self insert is skipped');

select is(
  (select count(*)::int from public.people
    where owner_id = 'a0000000-0000-4000-8000-00000000000a' and is_self),
  1, 'Still one is_self person');

select ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  'anon cannot execute handle_new_user');

select ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'authenticated cannot execute handle_new_user');

delete from auth.users where id = 'a0000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.people
    where owner_id = 'a0000000-0000-4000-8000-00000000000a'),
  0, 'Deleting the user removes their self person');

select * from finish();
rollback;
