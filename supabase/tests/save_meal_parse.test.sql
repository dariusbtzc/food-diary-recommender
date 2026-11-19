-- save_meal_parse(): one transaction per parse result, pending meals only,
-- owner-checked, service role only.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- Fixtures (as postgres, bypassing RLS) -----------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'a@test.local'),
  ('b0000000-0000-4000-8000-00000000000b', 'b@test.local');

insert into public.places (id, owner_id, name, latitude, longitude, cuisines) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'Katong Laksa', 1.30, 103.90, '{chinese}'),
  ('a3000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'Preset Place', 1.30, 103.90, '{}'),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'B Place', 1.30, 103.90, '{}');

insert into public.meals (id, owner_id, place_id, raw_text, parse_status) values
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', null, 'laksa', 'pending'),
  ('a4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000002', 'pre-set', 'pending'),
  ('a4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a', null, 'photo only', 'pending'),
  ('b4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', null, 'steak', 'pending');

-- Privileges --------------------------------------------------------------------
select ok(
  has_function_privilege('service_role', 'public.save_meal_parse(uuid, uuid, jsonb, uuid, numeric, real, text)', 'execute'),
  'service_role can execute save_meal_parse');
select ok(
  not has_function_privilege('authenticated', 'public.save_meal_parse(uuid, uuid, jsonb, uuid, numeric, real, text)', 'execute'),
  'authenticated cannot execute save_meal_parse');
select ok(
  not has_function_privilege('anon', 'public.save_meal_parse(uuid, uuid, jsonb, uuid, numeric, real, text)', 'execute'),
  'anon cannot execute save_meal_parse');

-- A full parse ------------------------------------------------------------------
set local role service_role;

select is(
  public.save_meal_parse(
    'a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
    '[{"dish_name":"laksa","cuisine":"peranakan","tags":["spicy","contains_seafood"]},
      {"dish_name":"otah","cuisine":null,"tags":[]}]'::jsonb,
    'a3000000-0000-4000-8000-000000000001', 14.50, 0.92, 'done'),
  true,
  'saves a pending meal');

reset role;

select results_eq(
  $$select place_id, total_cost_sgd, parse_confidence, parse_status, edited_at
    from public.meals where id = 'a4000000-0000-4000-8000-000000000001'$$,
  $$values ('a3000000-0000-4000-8000-000000000001'::uuid, 14.50::numeric(10,2), 0.92::real, 'done'::text, null::timestamptz)$$,
  'meal gets place, cost, confidence and status; edited_at stays null');
select results_eq(
  $$select dish_name, cuisine, tags from public.meal_items
    where meal_id = 'a4000000-0000-4000-8000-000000000001' order by dish_name$$,
  $$values ('laksa'::text, 'peranakan'::text, '{spicy,contains_seafood}'::text[]),
           ('otah'::text, null::text, '{}'::text[])$$,
  'dishes are written with cuisine and tags');
select is(
  (select cuisines from public.places where id = 'a3000000-0000-4000-8000-000000000001'),
  '{chinese,peranakan}'::text[],
  'the place gains the new cuisine, sorted, without duplicates');

-- Only once, only pending -------------------------------------------------------
set local role service_role;
select is(
  public.save_meal_parse(
    'a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
    '[{"dish_name":"something else","cuisine":null,"tags":[]}]'::jsonb,
    null, null, 0.1, 'needs_review'),
  false,
  'a meal that has left pending is not overwritten');
reset role;
select is(
  (select count(*)::int from public.meal_items where meal_id = 'a4000000-0000-4000-8000-000000000001'),
  2,
  'the earlier dishes are untouched');
select is(
  (select parse_status from public.meals where id = 'a4000000-0000-4000-8000-000000000001'),
  'done',
  'the earlier status is untouched');

-- Owner checks ------------------------------------------------------------------
set local role service_role;
select is(
  public.save_meal_parse(
    'b4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a',
    '[{"dish_name":"steak","cuisine":"western","tags":[]}]'::jsonb,
    null, null, 0.9, 'needs_review'),
  false,
  'another owner''s meal is not written');
select throws_ok(
  $$select public.save_meal_parse(
      'a4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a',
      '[{"dish_name":"rice","cuisine":null,"tags":[]}]'::jsonb,
      'b3000000-0000-4000-8000-000000000001', null, 0.9, 'done')$$,
  '42501', null, 'another owner''s place is rejected');
reset role;
select is(
  (select parse_status from public.meals where id = 'b4000000-0000-4000-8000-000000000001'),
  'pending',
  'the other owner''s meal is still pending');

-- Pre-set place -----------------------------------------------------------------
set local role service_role;
select is(
  public.save_meal_parse(
    'a4000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-00000000000a',
    '[{"dish_name":"chicken rice","cuisine":"chinese","tags":[]}]'::jsonb,
    'a3000000-0000-4000-8000-000000000001', null, 0.9, 'done'),
  true,
  'a meal with a pre-set place is saved');
reset role;
select is(
  (select place_id from public.meals where id = 'a4000000-0000-4000-8000-000000000002'),
  'a3000000-0000-4000-8000-000000000002'::uuid,
  'the pre-set place is kept');
select is(
  (select cuisines from public.places where id = 'a3000000-0000-4000-8000-000000000002'),
  '{chinese}'::text[],
  'the pre-set place gains the cuisine');

-- No place ----------------------------------------------------------------------
set local role service_role;
select is(
  public.save_meal_parse(
    'a4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a',
    '[{"dish_name":"nasi lemak","cuisine":"malay","tags":[]}]'::jsonb,
    null, null, 0.8, 'needs_review'),
  true,
  'a meal without a place is saved as needs_review');
reset role;
select results_eq(
  $$select place_id, parse_status from public.meals where id = 'a4000000-0000-4000-8000-000000000003'$$,
  $$values (null::uuid, 'needs_review'::text)$$,
  'place stays null');

-- Bad input ---------------------------------------------------------------------
select throws_ok(
  $$select public.save_meal_parse(
      'a4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a',
      '[{"dish_name":"x","cuisine":null,"tags":[]}]'::jsonb, null, null, 0.9, 'failed')$$,
  '22023', null, 'only done or needs_review can be saved');
select throws_ok(
  $$select public.save_meal_parse(
      'a4000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-00000000000a',
      '[]'::jsonb, null, null, 0.9, 'done')$$,
  '22023', null, 'a parse needs at least one dish');

select * from finish();
rollback;
