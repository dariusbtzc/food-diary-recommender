-- Parse queue: extensions, enqueue trigger, invoke_edge_function, backstop,
-- worker RPCs, privileges, new columns and per-owner place uniqueness.
begin;
create extension if not exists pgtap with schema extensions;

select plan(44);

-- Fixtures (as postgres, bypassing RLS) -----------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-00000000000a', 'a@test.local'),
  ('b0000000-0000-4000-8000-00000000000b', 'b@test.local');

delete from public.people where is_self;

insert into public.people (id, owner_id, name, is_self) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'A self', true),
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000b', 'B self', true);

-- Start from an empty queue, and count only HTTP requests made by this test.
select pgmq.purge_queue('parse_meal');
create temp table _base on commit drop as
  select coalesce(max(id), 0) as id from net.http_request_queue;
grant select on _base to authenticated, service_role;

create function pg_temp.requests_made() returns bigint language sql as $$
  select count(*) from net.http_request_queue where id > (select id from _base)
$$;

-- Schema ------------------------------------------------------------------------
select has_extension('pgmq', 'pgmq is installed');
select has_extension('pg_net', 'pg_net is installed');
select has_extension('pg_cron', 'pg_cron is installed');
select has_table('pgmq', 'q_parse_meal', 'parse_meal queue exists');
select ok((select relrowsecurity from pg_class where oid = 'pgmq.q_parse_meal'::regclass), 'RLS enabled on the queue table');
select ok((select relrowsecurity from pg_class where oid = 'pgmq.a_parse_meal'::regclass), 'RLS enabled on the queue archive');

select col_type_is('public', 'meals', 'edited_at', 'timestamp with time zone', 'meals.edited_at is timestamptz');
select col_is_null('public', 'meals', 'edited_at', 'meals.edited_at is nullable');
select col_type_is('public', 'places', 'refreshed_at', 'timestamp with time zone', 'places.refreshed_at is timestamptz');
select col_is_null('public', 'places', 'refreshed_at', 'places.refreshed_at is nullable');

select is(
  (select schedule from cron.job where jobname = 'parse-meal-backstop'),
  '* * * * *',
  'backstop runs every minute');
select is(
  (select command from cron.job where jobname = 'parse-meal-backstop'),
  'select public.parse_meal_backstop()',
  'backstop calls parse_meal_backstop()');

-- Privileges --------------------------------------------------------------------
create function pg_temp.can_execute_any(p_role text, p_fns text[]) returns boolean language sql as $$
  select bool_or(has_function_privilege(p_role, fn, 'execute')) from unnest(p_fns) as fn
$$;

select ok(not has_schema_privilege('anon', 'pgmq', 'usage'), 'anon has no usage on pgmq');
select ok(not has_schema_privilege('authenticated', 'pgmq', 'usage'), 'authenticated has no usage on pgmq');

select ok(
  not pg_temp.can_execute_any('anon', array[
    'public.invoke_edge_function(text, jsonb)', 'public.enqueue_meal_parse()',
    'public.parse_meal_backstop()', 'public.parse_queue_read(integer, integer)',
    'public.parse_queue_delete(bigint)', 'public.parse_queue_requeue(bigint, timestamptz)']),
  'anon can execute none of the queue functions');
select ok(
  not pg_temp.can_execute_any('authenticated', array[
    'public.invoke_edge_function(text, jsonb)', 'public.enqueue_meal_parse()',
    'public.parse_meal_backstop()', 'public.parse_queue_read(integer, integer)',
    'public.parse_queue_delete(bigint)', 'public.parse_queue_requeue(bigint, timestamptz)']),
  'authenticated can execute none of the queue functions');
select ok(
  not pg_temp.can_execute_any('service_role', array[
    'public.invoke_edge_function(text, jsonb)', 'public.enqueue_meal_parse()',
    'public.parse_meal_backstop()']),
  'service_role cannot invoke functions or run the backstop directly');
select ok(
  has_function_privilege('service_role', 'public.parse_queue_read(integer, integer)', 'execute')
  and has_function_privilege('service_role', 'public.parse_queue_delete(bigint)', 'execute')
  and has_function_privilege('service_role', 'public.parse_queue_requeue(bigint, timestamptz)', 'execute'),
  'service_role can execute the worker RPCs');
select ok(
  (select bool_and(prosecdef) from pg_proc
   where oid in ('public.invoke_edge_function(text, jsonb)'::regprocedure,
                 'public.enqueue_meal_parse()'::regprocedure,
                 'public.parse_meal_backstop()'::regprocedure,
                 'public.parse_queue_read(integer, integer)'::regprocedure,
                 'public.parse_queue_delete(bigint)'::regprocedure,
                 'public.parse_queue_requeue(bigint, timestamptz)'::regprocedure)),
  'queue functions are security definer');
select is(
  (select prosecdef from pg_proc where oid = 'public.create_meal(uuid[], text, text, text, jsonb)'::regprocedure),
  false,
  'create_meal stays security invoker');

-- Enqueue without Vault: the meal saves, the message exists, no call is made --
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$select public.create_meal(array['a1000000-0000-4000-8000-000000000001']::uuid[], 'laksa')$$,
  'a user can log a meal through create_meal');

reset role;

select results_eq(
  $$select message ->> 'meal_id' from pgmq.q_parse_meal$$,
  $$select id::text from public.meals where raw_text = 'laksa'$$,
  'logging a meal leaves one message with its meal_id');
select is(pg_temp.requests_made(), 0::bigint, 'no HTTP call while Vault is not set');
select is(public.invoke_edge_function('parse-meal'), null, 'invoke_edge_function returns null without Vault');
select throws_ok(
  $$select public.invoke_edge_function('../parse-meal')$$,
  '22023', null, 'invoke_edge_function rejects a malformed function name');

-- Enqueue with Vault: the trigger pings the worker with the secret --------------
select vault.create_secret('http://kong:8000/functions/v1/', 'edge_functions_url');
select vault.create_secret('test-worker-secret', 'parse_worker_secret');

insert into public.meals (owner_id, raw_text)
values ('a0000000-0000-4000-8000-00000000000a', 'chicken rice');

select is(pg_temp.requests_made(), 1::bigint, 'a new meal makes one HTTP call');
select results_eq(
  $$select method::text, url, headers ->> 'Authorization'
    from net.http_request_queue where id > (select id from _base)$$,
  $$values ('POST'::text, 'http://kong:8000/functions/v1/parse-meal'::text, 'Bearer test-worker-secret'::text)$$,
  'the call POSTs to parse-meal with the worker secret');
select is((select count(*) from pgmq.q_parse_meal), 2::bigint, 'each meal has its own message');

-- Backstop ----------------------------------------------------------------------
select isnt(public.parse_meal_backstop(), null, 'backstop calls the worker when messages are visible');
select is(pg_temp.requests_made(), 2::bigint, 'backstop made one more call');

select pgmq.purge_queue('parse_meal');
select is(public.parse_meal_backstop(), null, 'backstop makes no call on an empty queue');

select pgmq.send('parse_meal', '{"meal_id":"00000000-0000-4000-8000-0000000000ff"}'::jsonb, 3600);
select is(public.parse_meal_backstop(), null, 'backstop makes no call when the only message is delayed');
select is(pg_temp.requests_made(), 2::bigint, 'no further calls were made');
select pgmq.purge_queue('parse_meal');

-- Worker RPCs as service_role ---------------------------------------------------
select pgmq.send('parse_meal', '{"meal_id":"00000000-0000-4000-8000-0000000000aa"}'::jsonb);
create temp table _msg on commit drop as select max(msg_id) as id from pgmq.q_parse_meal;
grant select on _msg to service_role;

set local role service_role;

select results_eq(
  $$select read_ct, message from public.parse_queue_read(5, 120)$$,
  $$values (1, '{"meal_id":"00000000-0000-4000-8000-0000000000aa"}'::jsonb)$$,
  'parse_queue_read returns the message with read_ct 1');
select is_empty(
  $$select * from public.parse_queue_read(5, 120)$$,
  'a read message is hidden for the visibility timeout');
select throws_ok(
  $$select * from public.parse_queue_read(0, 120)$$,
  '22023', null, 'parse_queue_read rejects a non-positive batch size');

select isnt(
  public.parse_queue_requeue((select id from _msg), '2030-01-01 16:00:00+00'),
  null,
  'parse_queue_requeue returns the new message id');
select is(
  public.parse_queue_requeue((select id from _msg), '2030-01-01 16:00:00+00'),
  null,
  'requeueing a message that no longer exists returns null');

reset role;

select results_eq(
  $$select msg_id <> (select id from _msg), read_ct, vt, message from pgmq.q_parse_meal$$,
  $$values (true, 0, '2030-01-01 16:00:00+00'::timestamptz, '{"meal_id":"00000000-0000-4000-8000-0000000000aa"}'::jsonb)$$,
  'requeue replaces the message: same payload, read_ct 0, hidden until the given time');

create temp table _requeued on commit drop as select msg_id as id from pgmq.q_parse_meal;
grant select on _requeued to service_role;

set local role service_role;
select is(public.parse_queue_delete((select id from _requeued)), true, 'parse_queue_delete deletes the message');
reset role;
select is((select count(*) from pgmq.q_parse_meal), 0::bigint, 'the queue is empty after the delete');

-- Places: unique google_place_id per owner (S4) ---------------------------------
select lives_ok(
  $$insert into public.places (owner_id, google_place_id, name, latitude, longitude) values
      ('a0000000-0000-4000-8000-00000000000a', 'g-shared', 'A name', 1.30, 103.85),
      ('b0000000-0000-4000-8000-00000000000b', 'g-shared', 'B name', 1.30, 103.85)$$,
  'two owners can each have a row for the same Google place');
select throws_ok(
  $$insert into public.places (owner_id, google_place_id, name, latitude, longitude) values
      ('a0000000-0000-4000-8000-00000000000a', 'g-shared', 'A again', 1.30, 103.85)$$,
  '23505', null, 'one owner cannot have the same Google place twice');
select lives_ok(
  $$insert into public.places (owner_id, name, latitude, longitude) values
      ('a0000000-0000-4000-8000-00000000000a', 'Typed 1', 1.30, 103.85),
      ('a0000000-0000-4000-8000-00000000000a', 'Typed 2', 1.30, 103.85)$$,
  'places without a Google id are not constrained');

select * from finish();
rollback;
