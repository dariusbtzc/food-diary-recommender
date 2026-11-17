import { connection, NextResponse } from "next/server";

import { isAuthorizedCron } from "@/lib/cron/auth";
import { createAnonClient } from "@/lib/supabase/anon";

// Daily Vercel cron (vercel.json). Pings Postgres through PostgREST so
// Supabase Free doesn't pause the project after 7 idle days. keep_alive()
// reads no data; no user session is involved.
export async function GET(request: Request) {
  // Always run at request time, never prerendered at build.
  await connection();

  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAnonClient().rpc("keep_alive");
  if (error || data !== true) {
    console.error("keep_alive failed", { code: error?.code });
    return NextResponse.json({ error: "keep_alive_failed" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
