import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

// Service-role client for the worker functions. It bypasses RLS, so every
// query that touches user data must filter by owner_id itself.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the Edge Runtime
// (hosted and `supabase functions serve`).
export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
