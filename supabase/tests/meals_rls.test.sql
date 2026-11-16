-- RLS, integrity and index tests for places, place_tags, meals, meal_attendees,
-- ratings, meal_items.
begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

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

insert into public.places (id, owner_id, google_place_id, name, latitude, longitude) values
  ('a3000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'g-a', 'A Cafe', 1.30, 103.85),
  ('b3000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'g-b', 'B Bistro', 1.29, 103.84);

insert into public.place_tags (place_id, tag, source, value) values
  ('a3000000-0000-4000-8000-000000000001', 'halal', 'user', true),
  ('b3000000-0000-4000-8000-000000000001', 'vegan', 'review', false);

insert into public.meals (id, owner_id, place_id, raw_text) values
  ('a4000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'a3000000-0000-4000-8000-000000000001', 'laksa with Bob'),
  ('b4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'b3000000-0000-4000-8000-000000000001', 'steak');

insert into public.meal_attendees (meal_id, person_id) values
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002'),
  ('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');

insert into public.ratings (meal_id, person_id, score, source) values
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 4, 'stated'),
  ('b4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 5, 'stated');

insert into public.meal_items (meal_id, dish_name, cuisine) values
  ('a4000000-0000-4000-8000-000000000001', 'Laksa', 'peranakan'),
  ('b4000000-0000-4000-8000-000000000001', 'Ribeye', 'western');

-- RLS is on ---------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.places'::regclass), 'RLS enabled on places');
select ok((select relrowsecurity from pg_class where oid = 'public.place_tags'::regclass), 'RLS enabled on place_tags');
select ok((select relrowsecurity from pg_class where oid = 'public.meals'::regclass), 'RLS enabled on meals');
select ok((select relrowsecurity from pg_class where oid = 'public.meal_attendees'::regclass), 'RLS enabled on meal_attendees');
select ok((select relrowsecurity from pg_class where oid = 'public.ratings'::regclass), 'RLS enabled on ratings');
select ok((select relrowsecurity from pg_class where oid = 'public.meal_items'::regclass), 'RLS enabled on meal_items');

-- Indexes -----------------------------------------------------------------------
select has_index('public', 'meals', 'meals_owner_id_eaten_at_idx', 'Diary feed index on meals');
select has_index('public', 'meal_attendees', 'meal_attendees_person_id_idx', 'Attendees by person index');
select has_index('public', 'places', 'places_google_place_id_key', 'Unique google_place_id index');
select index_is_unique('public', 'places', 'places_google_place_id_key', 'google_place_id index is unique');
select has_index('public', 'places', 'places_location_idx', 'll_to_earth index on places');
select index_is_type('public', 'places', 'places_location_idx', 'gist', 'll_to_earth index is GiST');
select has_index('public', 'meal_items', 'meal_items_embedding_idx', 'Embedding index on meal_items');
select index_is_type('public', 'meal_items', 'meal_items_embedding_idx', 'hnsw', 'Embedding index is HNSW');
select hasnt_column('public', 'places', 'tags', 'places has no tags column');

-- As user A ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.places), 1, 'A sees only their own places');
select is((select count(*)::int from public.place_tags), 1, 'A sees only tags of their places');
select is((select count(*)::int from public.meals), 1, 'A sees only their own meals');
select is((select count(*)::int from public.meal_attendees), 2, 'A sees only attendees of their meals');
select is((select count(*)::int from public.ratings), 1, 'A sees only ratings of their meals');
select is((select count(*)::int from public.meal_items), 1, 'A sees only items of their meals');

select throws_ok(
  $$insert into public.meals (place_id, raw_text) values ('b3000000-0000-4000-8000-000000000001', 'sneaky')$$,
  '42501', null, 'A cannot attach a meal to B''s place');

select throws_ok(
  $$update public.meals set place_id = 'b3000000-0000-4000-8000-000000000001'
    where id = 'a4000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'A cannot move a meal onto B''s place');

select throws_ok(
  $$insert into public.meal_attendees (meal_id, person_id)
    values ('a4000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'A cannot add B''s person to A''s meal');

select throws_ok(
  $$insert into public.meal_attendees (meal_id, person_id)
    values ('b4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'A cannot add their person to B''s meal');

select throws_ok(
  $$insert into public.place_tags (place_id, tag, source, value)
    values ('b3000000-0000-4000-8000-000000000001', 'halal', 'user', true)$$,
  '42501', null, 'A cannot tag B''s place');

select throws_ok(
  $$insert into public.meal_items (meal_id, dish_name) values ('b4000000-0000-4000-8000-000000000001', 'Fries')$$,
  '42501', null, 'A cannot add an item to B''s meal');

prepare update_b_rating as
  update public.ratings set score = 1
  where meal_id = 'b4000000-0000-4000-8000-000000000001' returning meal_id;
select is_empty('update_b_rating', 'A cannot update B''s rating');

prepare delete_b_meal as
  delete from public.meals where id = 'b4000000-0000-4000-8000-000000000001' returning id;
select is_empty('delete_b_meal', 'A cannot delete B''s meal');

select lives_ok(
  $$insert into public.meals (id, photo_path) values ('a4000000-0000-4000-8000-000000000002', 'a/photo.jpg')$$,
  'A can log a photo-only meal; owner_id defaults to auth.uid()');

select is(
  (select parse_status from public.meals where id = 'a4000000-0000-4000-8000-000000000002'),
  'pending', 'New meals default to parse_status pending');

-- Integrity checks --------------------------------------------------------------
select throws_ok(
  $$insert into public.place_tags (place_id, tag, source, value)
    values ('a3000000-0000-4000-8000-000000000001', 'halal', 'review', true)$$,
  '23514', null, 'A review row tagged halal is rejected');

select lives_ok(
  $$insert into public.place_tags (place_id, tag, source, value)
    values ('a3000000-0000-4000-8000-000000000001', 'vegetarian', 'review', false)$$,
  'A review row tagged vegetarian is allowed');

select throws_ok(
  $$insert into public.place_tags (place_id, tag, source, value)
    values ('a3000000-0000-4000-8000-000000000001', 'vegan', 'google', true)$$,
  '23514', null, 'place_tags source is limited to user or review');

select throws_ok(
  $$insert into public.meals (raw_text) values ('   ')$$,
  '23514', null, 'A meal needs text or a photo');

select throws_ok(
  $$insert into public.meals (raw_text, parse_status) values ('x', 'queued')$$,
  '23514', null, 'parse_status is limited to the brief''s values');

select throws_ok(
  $$insert into public.meals (raw_text, meal_type) values ('x', 'elevenses')$$,
  '23514', null, 'meal_type is limited to the allowed set');

select throws_ok(
  $$insert into public.ratings (meal_id, person_id, score, source)
    values ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 6, 'stated')$$,
  '23514', null, 'score is limited to 1..5');

select throws_ok(
  $$insert into public.ratings (meal_id, person_id, score, source)
    values ('a4000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 3, 'stated')$$,
  '23503', null, 'Only attendees can rate a meal');

-- Anonymous ---------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.meals', '42501', null, 'anon has no access to meals');

-- Triggers, cascades and the ll_to_earth index (as postgres) --------------------
reset role;

update public.place_tags set updated_at = '2000-01-01', value = false
  where place_id = 'a3000000-0000-4000-8000-000000000001' and tag = 'halal' and source = 'user';
select is(
  (select updated_at from public.place_tags
    where place_id = 'a3000000-0000-4000-8000-000000000001' and tag = 'halal' and source = 'user'),
  now(), 'place_tags.updated_at is set on update');

-- Index expressions must work with an empty search_path (as during pg_restore).
-- pgTAP itself needs a search_path, so insert first and assert afterwards.
set local search_path = '';
insert into public.places (owner_id, name, latitude, longitude)
  values ('a0000000-0000-4000-8000-00000000000a', 'No path', 1.35, 103.82);
reset search_path;
select ok(
  exists (select 1 from public.places where name = 'No path'),
  'll_to_earth index works with an empty search_path');

delete from public.people where id = 'a1000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.meal_attendees where person_id = 'a1000000-0000-4000-8000-000000000002')
  + (select count(*)::int from public.ratings where person_id = 'a1000000-0000-4000-8000-000000000002'),
  0, 'Deleting a person cascades to attendee rows and ratings');

delete from public.meals where id = 'a4000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.meal_items where meal_id = 'a4000000-0000-4000-8000-000000000001'),
  0, 'Deleting a meal cascades to meal_items');

delete from public.places where id = 'b3000000-0000-4000-8000-000000000001';
select is(
  (select place_id from public.meals where id = 'b4000000-0000-4000-8000-000000000001'),
  null, 'Deleting a place sets meals.place_id to null');

select * from finish();
rollback;
