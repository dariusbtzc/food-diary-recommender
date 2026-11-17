import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { supabaseEnv } from "./env";

// Server-side client with the publishable key and no user session, for
// requests that aren't made by a signed-in user (e.g. the keep-alive cron).
// It runs as anon, which has no table grants, so it can only call functions
// granted to anon.
export function createAnonClient() {
  const { url, publishableKey } = supabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
