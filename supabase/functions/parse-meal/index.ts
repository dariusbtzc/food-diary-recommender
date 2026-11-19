import { createAdminClient } from "../_shared/admin-client.ts";
import { requireWorkerSecret } from "../_shared/worker-auth.ts";
import { createAnthropicClient } from "./model.ts";
import { processBatch } from "./parse.ts";
import { createSupabaseStore } from "./store.ts";

// Supabase's Edge Runtime keeps the instance alive until a promise passed to
// EdgeRuntime.waitUntil settles (up to the wall-clock limit, 150 s on Free).
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

function runInBackground(work: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
}

function log(event: Record<string, unknown>) {
  console.log(JSON.stringify({ fn: "parse-meal", ...event }));
}

// Called by Postgres (trigger and 1-minute backstop) through pg_net. It
// answers 202 at once and parses in the background, so pg_net's timeout
// never cuts a run short.
export function createHandler(
  startBatch: () => Promise<unknown>,
  background: (work: Promise<unknown>) => void,
) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return Response.json({ error: "method not allowed" }, {
        status: 405,
        headers: { allow: "POST" },
      });
    }
    const refused = await requireWorkerSecret(req);
    if (refused) return refused;

    background(
      startBatch().then(
        (counts) => log({ batch: counts }),
        (error) => log({ batch: "error", error: String(error) }),
      ),
    );
    return Response.json({ accepted: true }, { status: 202 });
  };
}

// async, so a missing env var becomes a logged rejection, not a 500. The
// messages stay queued and the backstop calls again.
async function startBatch() {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return await processBatch({
    store: createSupabaseStore(createAdminClient()),
    anthropic: createAnthropicClient(apiKey),
    now: () => new Date(),
  });
}

export const handler = createHandler(startBatch, runInBackground);

if (import.meta.main) Deno.serve(handler);
