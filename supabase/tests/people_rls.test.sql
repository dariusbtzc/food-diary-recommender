-- RLS and integrity tests for people, constraints, cuisine_prefs.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

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

insert into public.constraints (id, person_id, tag) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'no_beef'),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'halal');

insert into public.cuisine_prefs (person_id, cuisine, stated_score) values
  ('a1000000-0000-4000-8000-000000000002', 'thai', 1),
  ('b1000000-0000-4000-8000-000000000001', 'korean', -1);

-- RLS is on ---------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.people'::regclass), 'RLS enabled on people');
select ok((select relrowsecurity from pg_class where oid = 'public.constraints'::regclass), 'RLS enabled on constraints');
select ok((select relrowsecurity from pg_class where oid = 'public.cuisine_prefs'::regclass), 'RLS enabled on cuisine_prefs');

-- As user A ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.people), 2, 'A sees only their own people');
select is((select count(*)::int from public.constraints), 1, 'A sees only constraints of their people');
select is((select count(*)::int from public.cuisine_prefs), 1, 'A sees only prefs of their people');

select throws_ok(
  $$insert into public.people (owner_id, name) values ('b0000000-0000-4000-8000-00000000000b', 'Sneaky')$$,
  '42501', null, 'A cannot insert a person owned by B');

select throws_ok(
  $$insert into public.constraints (person_id, tag) values ('b1000000-0000-4000-8000-000000000001', 'vegan')$$,
  '42501', null, 'A cannot add a constraint to B''s person');

select throws_ok(
  $$insert into public.cuisine_prefs (person_id, cuisine) values ('b1000000-0000-4000-8000-000000000001', 'thai')$$,
  '42501', null, 'A cannot add a pref to B''s person');

select throws_ok(
  $$update public.constraints set person_id = 'b1000000-0000-4000-8000-000000000001'
    where id = 'a2000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'A cannot re-parent a constraint onto B''s person');

prepare update_b_person as
  update public.people set name = 'Hacked' where id = 'b1000000-0000-4000-8000-000000000001' returning id;
select is_empty('update_b_person', 'A cannot update B''s person');

prepare delete_b_constraint as
  delete from public.constraints where id = 'b2000000-0000-4000-8000-000000000001' returning id;
select is_empty('delete_b_constraint', 'A cannot delete B''s constraint');

select lives_ok(
  $$insert into public.people (id, name) values ('a1000000-0000-4000-8000-000000000003', 'Cara')$$,
  'A can insert a person, owner_id defaults to auth.uid()');

select is(
  (select owner_id from public.people where id = 'a1000000-0000-4000-8000-000000000003'),
  'a0000000-0000-4000-8000-00000000000a'::uuid, 'Default owner_id is the caller');

-- Integrity checks --------------------------------------------------------------
select throws_ok(
  $$insert into public.people (name, is_self) values ('Second self', true)$$,
  '23505', null, 'At most one is_self person per owner');

select throws_ok(
  $$insert into public.people (name) values ('   ')$$,
  '23514', null, 'Blank names are rejected');

select throws_ok(
  $$insert into public.constraints (person_id, tag) values ('a1000000-0000-4000-8000-000000000002', 'No Pork')$$,
  '23514', null, 'Constraint tags must be snake_case');

select throws_ok(
  $$insert into public.cuisine_prefs (person_id, cuisine, stated_score) values ('a1000000-0000-4000-8000-000000000002', 'malay', 2)$$,
  '23514', null, 'stated_score is limited to -1, 0, 1');

select throws_ok(
  $$insert into public.cuisine_prefs (person_id, cuisine, inferred_score) values ('a1000000-0000-4000-8000-000000000002', 'malay', 1.5)$$,
  '23514', null, 'inferred_score is limited to 0..1');

select throws_ok(
  $$insert into public.cuisine_prefs (person_id, cuisine) values ('a1000000-0000-4000-8000-000000000002', 'Malay')$$,
  '23514', null, 'Cuisine must be lowercase');

-- Anonymous ---------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.people', '42501', null, 'anon has no access to people');

-- Triggers and cascades (as postgres) -------------------------------------------
reset role;

update public.cuisine_prefs set updated_at = '2000-01-01', n_obs = 3
  where person_id = 'a1000000-0000-4000-8000-000000000002' and cuisine = 'thai';
select is(
  (select updated_at from public.cuisine_prefs
    where person_id = 'a1000000-0000-4000-8000-000000000002' and cuisine = 'thai'),
  now(), 'updated_at is set on update');

delete from public.people where id = 'a1000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.constraints where person_id = 'a1000000-0000-4000-8000-000000000002'),
  0, 'Deleting a person cascades to constraints');
select is(
  (select count(*)::int from public.cuisine_prefs where person_id = 'a1000000-0000-4000-8000-000000000002'),
  0, 'Deleting a person cascades to cuisine_prefs');

select * from finish();
rollback;
