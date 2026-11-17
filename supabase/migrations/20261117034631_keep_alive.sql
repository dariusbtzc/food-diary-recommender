-- keep_alive(): the daily Vercel cron calls this so Supabase Free sees activity
-- and doesn't pause the project after 7 idle days.
--
-- The cron has no user session, and anon has no grants on any table, so the
-- cron can't query a table. This function reads no tables and returns a
-- constant, which still needs a round trip through PostgREST to Postgres.
-- No new table, so no new RLS.
create function public.keep_alive()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

comment on function public.keep_alive() is
  'Keep-alive ping for the daily cron. Reads no data.';

revoke execute on function public.keep_alive() from public, authenticated;
grant execute on function public.keep_alive() to anon;
