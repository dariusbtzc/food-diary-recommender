import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db/types";
import { supabaseEnv } from "./env";

// Browser client under RLS with the publishable key. Talks only to our own
// Supabase project; external APIs are called from the server.
export function createClient() {
  const { url, publishableKey } = supabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
