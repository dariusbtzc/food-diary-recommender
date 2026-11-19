import { z } from "npm:zod@4";

// Postgres (pg_net, via invoke_edge_function) calls the workers with
// `Authorization: Bearer <PARSE_WORKER_SECRET>`. The functions run with
// verify_jwt = false, so this check is the only gate.

const secretSchema = z.string().min(1);
const authorizationSchema = z.string().max(1024);

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

// Hashing both sides first gives equal-length inputs, so the loop below
// never exits early and the comparison time doesn't depend on the input.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [hashA, hashB] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) diff |= hashA[i] ^ hashB[i];
  return diff === 0;
}

// True only when the header is exactly `Bearer <secret>`. An unset or empty
// secret refuses every request, so `Bearer undefined` can never match.
export async function isAuthorizedWorker(
  authorization: string | null,
  secret: string | undefined,
): Promise<boolean> {
  const parsedSecret = secretSchema.safeParse(secret);
  const parsedHeader = authorizationSchema.safeParse(authorization);
  if (!parsedSecret.success || !parsedHeader.success) return false;
  return await timingSafeEqual(parsedHeader.data, `Bearer ${parsedSecret.data}`);
}

// Returns a response to send when the request must be refused, or null when
// it may go ahead. A missing secret is a server misconfiguration (500), not
// the caller's fault, and it fails closed.
export async function requireWorkerSecret(
  req: Request,
): Promise<Response | null> {
  const secret = Deno.env.get("PARSE_WORKER_SECRET");
  if (!secretSchema.safeParse(secret).success) {
    console.error("PARSE_WORKER_SECRET is not set");
    return Response.json({ error: "server misconfigured" }, { status: 500 });
  }
  const ok = await isAuthorizedWorker(req.headers.get("authorization"), secret);
  return ok ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
