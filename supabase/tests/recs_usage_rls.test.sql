-- RLS, integrity and index tests for rec_requests, rec_results, llm_usage.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

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

insert into public.places (id, owner_id, name, latitude, longitude) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'A Cafe', 1.30, 103.85),
  ('a3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'A Grill', 1.31, 103.86),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'B Bistro', 1.29, 103.84);

insert into public.rec_requests (id, owner_id, diner_ids, meal_type, budget, latitude, longitude, mode) values
  ('a5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
   '{a1000000-0000-4000-8000-000000000001,a1000000-0000-4000-8000-000000000002}',
   'dinner', 'casual', 1.30, 103.85, 'either'),
  ('b5000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b',
   '{b1000000-0000-4000-8000-000000000001}', 'lunch', 'hawker', 1.29, 103.84, 'known');

insert into public.rec_results (request_id, place_id, rank, group_score, per_person_scores, chosen) values
  ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 1, 0.8, '{}', true),
  ('b5000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 1, 0.7, '{}', false);

insert into public.llm_usage (id, owner_id, purpose, input_tokens, output_tokens) values
  ('a6000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'parse', 1500, 300),
  ('b6000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'explain', 1000, 200);

-- Schema ------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables where schemaname = 'public'),
  12, 'public has all 12 tables');

select ok((select relrowsecurity from pg_class where oid = 'public.rec_requests'::regclass), 'RLS enabled on rec_requests');
select ok((select relrowsecurity from pg_class where oid = 'public.rec_results'::regclass), 'RLS enabled on rec_results');
select ok((select relrowsecurity from pg_class where oid = 'public.llm_usage'::regclass), 'RLS enabled on llm_usage');

select has_index('public', 'llm_usage', 'llm_usage_owner_id_day_idx', array['owner_id', 'day'], 'llm_usage (owner_id, day) index');

select is(
  (select day from public.llm_usage where id = 'a6000000-0000-4000-8000-000000000001'),
  (now() at time zone 'Asia/Singapore')::date, 'llm_usage.day defaults to the Singapore date');

-- As user A ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.rec_requests), 1, 'A sees only their own requests');
select is((select count(*)::int from public.rec_results), 1, 'A sees only results of their requests');
select is((select count(*)::int from public.llm_usage), 1, 'A sees only their own usage');

select lives_ok(
  $$insert into public.rec_requests (id, diner_ids, meal_type, budget, latitude, longitude, mode)
    values ('a5000000-0000-4000-8000-000000000002', '{a1000000-0000-4000-8000-000000000001}',
            'lunch', 'nice', 1.28, 103.85, 'new')$$,
  'A can create a request for their own people; owner_id defaults to auth.uid()');

select throws_ok(
  $$insert into public.rec_requests (diner_ids, meal_type, budget, latitude, longitude, mode)
    values ('{a1000000-0000-4000-8000-000000000001,b1000000-0000-4000-8000-000000000001}',
            'lunch', 'nice', 1.28, 103.85, 'new')$$,
  '42501', null, 'A cannot include B''s person in diner_ids');

select throws_ok(
  $$update public.rec_requests set diner_ids = '{b1000000-0000-4000-8000-000000000001}'
    where id = 'a5000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'A cannot change diner_ids to B''s person');

select throws_ok(
  $$insert into public.rec_results (request_id, place_id, rank, group_score, per_person_scores)
    values ('a5000000-0000-4000-8000-000000000001', 'b3000000-0000-4000-8000-000000000001', 2, 0.5, '{}')$$,
  '42501', null, 'A cannot add B''s place to their results');

select throws_ok(
  $$insert into public.rec_results (request_id, place_id, rank, group_score, per_person_scores)
    values ('b5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 2, 0.5, '{}')$$,
  '42501', null, 'A cannot add results to B''s request');

prepare update_b_result as
  update public.rec_results set chosen = true
  where request_id = 'b5000000-0000-4000-8000-000000000001' returning place_id;
select is_empty('update_b_result', 'A cannot update B''s results');

select throws_ok(
  $$insert into public.llm_usage (owner_id, purpose, input_tokens, output_tokens)
    values ('b0000000-0000-4000-8000-00000000000b', 'parse', 1, 1)$$,
  '42501', null, 'A cannot log usage for B');

prepare delete_own_usage as
  delete from public.llm_usage where id = 'a6000000-0000-4000-8000-000000000001' returning id;
select is_empty('delete_own_usage', 'A cannot delete their own usage rows');

prepare update_own_usage as
  update public.llm_usage set input_tokens = 0 where id = 'a6000000-0000-4000-8000-000000000001' returning id;
select is_empty('update_own_usage', 'A cannot update their own usage rows');

-- Integrity checks --------------------------------------------------------------
select throws_ok(
  $$insert into public.rec_requests (diner_ids, meal_type, budget, latitude, longitude, mode)
    values ('{}', 'lunch', 'nice', 1.28, 103.85, 'new')$$,
  '23514', null, 'diner_ids cannot be empty');

select throws_ok(
  $$insert into public.rec_requests (diner_ids, meal_type, budget, latitude, longitude, mode)
    values ('{a1000000-0000-4000-8000-000000000001}', 'lunch', 'cheap', 1.28, 103.85, 'new')$$,
  '23514', null, 'budget is limited to the app-ui bands');

select throws_ok(
  $$insert into public.rec_requests (diner_ids, meal_type, budget, latitude, longitude, mode)
    values ('{a1000000-0000-4000-8000-000000000001}', 'lunch', 'nice', 1.28, 103.85, 'any')$$,
  '23514', null, 'mode is limited to known, new, either');

select throws_ok(
  $$insert into public.rec_results (request_id, place_id, rank, group_score, per_person_scores, chosen)
    values ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 2, 0.6, '{}', true)$$,
  '23505', null, 'At most one chosen result per request');

select throws_ok(
  $$insert into public.rec_results (request_id, place_id, rank, group_score, per_person_scores)
    values ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 1, 0.6, '{}')$$,
  '23505', null, 'Ranks are unique within a request');

select throws_ok(
  $$insert into public.rec_results (request_id, place_id, rank, group_score, per_person_scores)
    values ('a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 2, 0.6, '[]')$$,
  '23514', null, 'per_person_scores must be an object');

select throws_ok(
  $$insert into public.llm_usage (purpose, input_tokens, output_tokens) values ('chat', 1, 1)$$,
  '23514', null, 'purpose is limited to parse, explain, review_check');

-- Anonymous ---------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.llm_usage', '42501', null, 'anon has no access to llm_usage');

-- Cascades (as postgres) --------------------------------------------------------
reset role;

delete from public.rec_requests where id = 'a5000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.rec_results where request_id = 'a5000000-0000-4000-8000-000000000001'),
  0, 'Deleting a request cascades to its results');

delete from auth.users where id = 'b0000000-0000-4000-8000-00000000000b';
select is(
  (select count(*)::int from public.llm_usage where owner_id = 'b0000000-0000-4000-8000-00000000000b'),
  0, 'Deleting a user cascades to their usage rows');

select * from finish();
rollback;
