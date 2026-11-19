-- Parse queue (M2 task 2; brief, Flow 2).
--
-- A trigger on new meals enqueues { meal_id } on the pgmq queue parse_meal and
-- pings the parse-meal Edge Function through pg_net. A 1-minute pg_cron job is
-- the backstop and calls the worker only when the queue has visible messages.
-- The worker (service role) reads, deletes and re-queues through the
-- parse_queue_* RPCs below.
--
-- The functions URL and the worker secret live in Vault (edge_functions_url,
-- parse_worker_secret), set once per environment; see
-- supabase/snippets/vault-setup.sql. They are not in migrations or seed.sql.
--
-- Also: meals.edited_at, places.refreshed_at, and places unique per owner on
-- google_place_id (S4).

-- Extensions --------------------------------------------------------------------
create extension if not exists pgmq;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Supabase grants anon and authenticated usage on the net schema and execute
-- on net.http_post. The grants are made by supabase_admin, so this migration
-- (run as postgres) can't revoke them. They aren't reachable from the API: the
-- net schema isn't exposed through PostgREST, and no function callable by API
-- roles passes caller input to pg_net. Keep it that way.

-- Queue -------------------------------------------------------------------------
select pgmq.create('parse_meal');

-- API roles have no usage on the pgmq schema. RLS with no policies keeps the
-- queue tables closed even if that changes; only postgres (the owner) and the
-- security definer functions below touch them.
alter table pgmq.q_parse_meal enable row level security;
alter table pgmq.a_parse_meal enable row level security;

-- Columns -----------------------------------------------------------------------
-- Set when a parsed field (dishes, place, cost) is changed by hand; with
-- parse_confidence it measures M2's exit criterion.
alter table public.meals add column edited_at timestamptz;

-- When the coordinates were last fetched from Google (kept within Google's
-- 30-day caching limit by refresh-places). Not "row last changed".
alter table public.places add column refreshed_at timestamptz;

-- Places are deduplicated per owner, not globally (S4): two users can each
-- have a row for the same Google place.
alter table public.places
  drop constraint places_google_place_id_key,
  add constraint places_owner_id_google_place_id_key unique (owner_id, google_place_id);

-- invoke_edge_function() --------------------------------------------------------
-- POSTs to <edge_functions_url>/<p_name> with the worker secret as a Bearer
-- token. Returns the pg_net request id, or null when the call was skipped.
-- It never fails its caller over Vault or pg_net: a missed call is picked up by
-- the backstop. Reused by M3's recompute-prefs.
--
-- The timeout only bounds how long pg_net waits to log the response; the
-- worker can take several seconds per run.
create function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  if p_name is null or p_name !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'invalid edge function name: %', p_name using errcode = '22023';
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'edge_functions_url';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'parse_worker_secret';

  if nullif(btrim(v_url), '') is null or nullif(v_secret, '') is null then
    raise warning 'invoke_edge_function(%): Vault secrets edge_functions_url and parse_worker_secret are not set; skipped', p_name;
    return null;
  end if;

  begin
    select net.http_post(
      url := rtrim(btrim(v_url), '/') || '/' || p_name,
      body := coalesce(p_body, '{}'::jsonb),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      timeout_milliseconds := 60000
    ) into v_request_id;
  exception when others then
    raise warning 'invoke_edge_function(%): %', p_name, sqlerrm;
    return null;
  end;

  return v_request_id;
end;
$$;

-- Supabase's default privileges also grant new functions to service_role; the
-- internal functions here are called only by the trigger and pg_cron.
revoke execute on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated, service_role;

-- Backlog -----------------------------------------------------------------------
-- Meals logged before this migration (M1) are still pending. The backstop
-- picks them up once Vault is set.
select pgmq.send('parse_meal', jsonb_build_object('meal_id', id))
from public.meals
where parse_status = 'pending'
order by eaten_at;

-- Enqueue trigger ---------------------------------------------------------------
-- Security definer, so create_meal() stays security invoker and callers need
-- no rights on pgmq. A failed enqueue fails the insert, so every new meal has
-- a message. pg_net sends only after commit, so the worker never reads a
-- message before the meal row is visible.
create function public.enqueue_meal_parse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pgmq.send('parse_meal', jsonb_build_object('meal_id', new.id));
  perform public.invoke_edge_function('parse-meal');
  return null;
end;
$$;

revoke execute on function public.enqueue_meal_parse() from public, anon, authenticated, service_role;

create trigger meals_enqueue_parse
  after insert on public.meals
  for each row execute function public.enqueue_meal_parse();

-- Backstop (S2) -----------------------------------------------------------------
-- Calls the worker only when a message is visible now. Messages re-queued
-- until SGT midnight (owner at the daily limit) are not visible yet, so they
-- cause no calls. clock_timestamp(), like pgmq.read, not the transaction's
-- now().
create function public.parse_meal_backstop()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from pgmq.q_parse_meal where vt <= clock_timestamp()) then
    return public.invoke_edge_function('parse-meal');
  end if;
  return null;
end;
$$;

revoke execute on function public.parse_meal_backstop() from public, anon, authenticated, service_role;

select cron.schedule('parse-meal-backstop', '* * * * *', 'select public.parse_meal_backstop()');

-- Worker RPCs (service role only) -----------------------------------------------
-- The message is returned as raw JSON; the worker validates it with Zod.
-- Batch size and visibility timeout come from the worker's config.
create function public.parse_queue_read(p_qty integer, p_vt_seconds integer)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, message jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_qty is null or p_qty < 1 or p_vt_seconds is null or p_vt_seconds < 1 then
    raise exception 'p_qty and p_vt_seconds must be positive' using errcode = '22023';
  end if;

  return query
    select r.msg_id, r.read_ct, r.enqueued_at, r.message
    from pgmq.read('parse_meal', p_vt_seconds, p_qty) as r;
end;
$$;

create function public.parse_queue_delete(p_msg_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.delete('parse_meal', p_msg_id);
$$;

-- Deletes the message and sends its payload again, invisible until
-- p_not_before, in one transaction (S1). The new message starts with
-- read_ct = 0, so waiting for the daily limit uses no attempt. Returns the new
-- message id, or null if the message no longer exists.
create function public.parse_queue_requeue(p_msg_id bigint, p_not_before timestamptz)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message jsonb;
  v_new_id bigint;
begin
  if p_not_before is null then
    raise exception 'p_not_before is required' using errcode = '22023';
  end if;

  select q.message into v_message
  from pgmq.q_parse_meal as q
  where q.msg_id = p_msg_id
  for update;

  if not found then
    return null;
  end if;

  perform pgmq.delete('parse_meal', p_msg_id);
  select pgmq.send('parse_meal', v_message, p_not_before) into v_new_id;
  return v_new_id;
end;
$$;

revoke execute on function public.parse_queue_read(integer, integer) from public, anon, authenticated;
revoke execute on function public.parse_queue_delete(bigint) from public, anon, authenticated;
revoke execute on function public.parse_queue_requeue(bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.parse_queue_read(integer, integer) to service_role;
grant execute on function public.parse_queue_delete(bigint) to service_role;
grant execute on function public.parse_queue_requeue(bigint, timestamptz) to service_role;
