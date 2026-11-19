-- Vault setup for the parse queue (M2). Run once per environment, and again
-- after every local `npx supabase db reset` (a reset empties Vault).
--
-- Paste this into the SQL editor (local Studio: http://127.0.0.1:54323; hosted:
-- the project's SQL editor), replace the two values there, and run it.
-- Never save a real secret into this file: it is committed.
--
-- edge_functions_url:
--   local:  http://kong:8000/functions/v1   (Postgres runs in Docker and
--           reaches the API gateway by its container name)
--   hosted: https://<project-ref>.supabase.co/functions/v1
-- parse_worker_secret: the same value as PARSE_WORKER_SECRET in
--   supabase/functions/.env (local) or `npx supabase secrets` (hosted).
--
-- Safe to re-run: existing secrets are updated in place.

do $$
declare
  v_url text := '<EDGE_FUNCTIONS_URL>';
  v_secret text := '<PARSE_WORKER_SECRET>';
begin
  if v_url like '<%' or v_secret like '<%' then
    raise exception 'Replace the <...> placeholders before running';
  end if;

  perform vault.update_secret(id, v_url) from vault.secrets where name = 'edge_functions_url';
  if not found then
    perform vault.create_secret(v_url, 'edge_functions_url', 'Base URL of the Edge Functions, for invoke_edge_function()');
  end if;

  perform vault.update_secret(id, v_secret) from vault.secrets where name = 'parse_worker_secret';
  if not found then
    perform vault.create_secret(v_secret, 'parse_worker_secret', 'Bearer token the worker functions require');
  end if;
end;
$$;
