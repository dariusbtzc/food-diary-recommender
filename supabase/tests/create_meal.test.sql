-- create_meal(): atomic insert of a meal, its attendees and stated ratings,
-- run as the caller under RLS.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- Fixtures (as postgres, bypassing RLS) -----------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'a@test.local'),
  ('b0000000-0000-4000-8000-00000000000b', 'b@test.local');

-- The auth trigger creates a self row per user; replace it with the fixed fixtures below.
delete from public.people where is_self;

insert into public.people (id, owner_id, name, is_self) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'A self', true),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'Bob', false),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'B self', true);

-- Privileges --------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.create_meal(uuid[], text, text, text, jsonb)', 'execute'),
  'authenticated can execute create_meal');
select ok(
  not has_function_privilege('anon', 'public.create_meal(uuid[], text, text, text, jsonb)', 'execute'),
  'anon cannot execute create_meal');

-- As user A -------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.create_meal(
      array['a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002']::uuid[],
      'laksa w/ Bob at Katong', null, 'dinner',
      '[{"person_id":"a1000000-0000-4000-8000-000000000002","score":4}]'::jsonb)$$,
  'A can log a text meal with two attendees and a rating');

select is(
  (select count(*)::int from public.meals), 1, 'one meal saved');
select results_eq(
  $$select owner_id, parse_status, meal_type from public.meals$$,
  $$values ('a0000000-0000-4000-8000-00000000000a'::uuid, 'pending'::text, 'dinner'::text)$$,
  'meal is owned by A and pending');
select is(
  (select count(*)::int from public.meal_attendees), 2, 'both attendees saved');
select results_eq(
  $$select person_id, score, source from public.ratings$$,
  $$values ('a1000000-0000-4000-8000-000000000002'::uuid, 4::smallint, 'stated'::text)$$,
  'the rating is saved as stated');

select lives_ok(
  $$select public.create_meal(
      array['a1000000-0000-4000-8000-000000000001']::uuid[],
      null, 'a0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-000000000001.jpg')$$,
  'A can log a photo-only meal with no ratings');

-- Failures roll back the whole meal.
select throws_ok(
  $$select public.create_meal(
      array['a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001']::uuid[],
      'with B''s person')$$,
  '42501', null, 'A cannot add B''s person as an attendee');
select throws_ok(
  $$select public.create_meal(
      array['a1000000-0000-4000-8000-000000000001']::uuid[], 'rating a non-attendee', null, null,
      '[{"person_id":"a1000000-0000-4000-8000-000000000002","score":3}]'::jsonb)$$,
  '23503', null, 'A cannot rate someone who was not there');
select throws_ok(
  $$select public.create_meal(array[]::uuid[], 'nobody there')$$,
  '22023', null, 'a meal needs at least one attendee');
select throws_ok(
  $$select public.create_meal(array['a1000000-0000-4000-8000-000000000001']::uuid[], '   ')$$,
  '23514', null, 'a meal needs text or a photo');
select throws_ok(
  $$select public.create_meal(
      array['a1000000-0000-4000-8000-000000000001']::uuid[], 'half star', null, null,
      '[{"person_id":"a1000000-0000-4000-8000-000000000001","score":3.5}]'::jsonb)$$,
  '22P02', null, 'scores must be whole numbers');
select throws_ok(
  $$select public.create_meal(
      array['a1000000-0000-4000-8000-000000000001']::uuid[], 'six stars', null, null,
      '[{"person_id":"a1000000-0000-4000-8000-000000000001","score":6}]'::jsonb)$$,
  '23514', null, 'scores must be 1 to 5');
select throws_ok(
  $$select public.create_meal(
      array['a1000000-0000-4000-8000-000000000001']::uuid[], 'not an array', null, null,
      '{"person_id":"a1000000-0000-4000-8000-000000000001","score":3}'::jsonb)$$,
  '22023', null, 'ratings must be a JSON array');

select is(
  (select count(*)::int from public.meals), 2, 'failed calls left no orphan meals');

-- As user B: A's meals stay invisible.
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.meals), 0, 'B sees none of A''s meals');

select * from finish();
rollback;
