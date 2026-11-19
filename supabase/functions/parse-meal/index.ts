import { requireWorkerSecret } from "../_shared/worker-auth.ts";

// Stub until M2 task 3: authenticates the caller and reports no work done.
export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, {
      status: 405,
      headers: { allow: "POST" },
    });
  }
  const refused = await requireWorkerSecret(req);
  if (refused) return refused;
  return Response.json({ processed: 0 });
}

if (import.meta.main) Deno.serve(handler);
