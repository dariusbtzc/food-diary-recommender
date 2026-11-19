import { assertEquals } from "@std/assert";
import { handler } from "./index.ts";

const SECRET = "test-worker-secret";

function post(authorization?: string): Request {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new Request("http://localhost/parse-meal", { method: "POST", headers });
}

async function withSecret(value: string | undefined, fn: () => Promise<void>) {
  const previous = Deno.env.get("PARSE_WORKER_SECRET");
  if (value === undefined) Deno.env.delete("PARSE_WORKER_SECRET");
  else Deno.env.set("PARSE_WORKER_SECRET", value);
  try {
    await fn();
  } finally {
    if (previous === undefined) Deno.env.delete("PARSE_WORKER_SECRET");
    else Deno.env.set("PARSE_WORKER_SECRET", previous);
  }
}

Deno.test("parse-meal refuses a request with no secret", () =>
  withSecret(SECRET, async () => {
    const res = await handler(post());
    assertEquals(res.status, 401);
  }));

Deno.test("parse-meal refuses a wrong secret", () =>
  withSecret(SECRET, async () => {
    const res = await handler(post("Bearer wrong"));
    assertEquals(res.status, 401);
  }));

Deno.test("parse-meal accepts the right secret", () =>
  withSecret(SECRET, async () => {
    const res = await handler(post(`Bearer ${SECRET}`));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { processed: 0 });
  }));

Deno.test("parse-meal returns 500 when the secret isn't configured", () =>
  withSecret(undefined, async () => {
    const res = await handler(post(`Bearer ${SECRET}`));
    assertEquals(res.status, 500);
  }));

Deno.test("parse-meal only accepts POST", () =>
  withSecret(SECRET, async () => {
    const res = await handler(
      new Request("http://localhost/parse-meal", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    assertEquals(res.status, 405);
    await res.body?.cancel();
  }));
