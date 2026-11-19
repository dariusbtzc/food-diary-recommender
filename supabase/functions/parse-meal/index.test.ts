import { assertEquals } from "@std/assert";
import { createHandler } from "./index.ts";

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

// A handler whose batch only counts how often it started.
function countingHandler() {
  const state = { started: 0, background: [] as Promise<unknown>[] };
  const handler = createHandler(
    () => {
      state.started++;
      return Promise.resolve({ parsed: 0 });
    },
    (work) => state.background.push(work),
  );
  return { handler, state };
}

Deno.test("parse-meal refuses a request with no secret and starts nothing", () =>
  withSecret(SECRET, async () => {
    const { handler, state } = countingHandler();
    const res = await handler(post());
    assertEquals(res.status, 401);
    assertEquals(state.started, 0);
  }));

Deno.test("parse-meal refuses a wrong secret", () =>
  withSecret(SECRET, async () => {
    const { handler, state } = countingHandler();
    const res = await handler(post("Bearer wrong"));
    assertEquals(res.status, 401);
    assertEquals(state.started, 0);
  }));

Deno.test("parse-meal answers 202 and runs the batch in the background", () =>
  withSecret(SECRET, async () => {
    const { handler, state } = countingHandler();
    const res = await handler(post(`Bearer ${SECRET}`));
    assertEquals(res.status, 202);
    assertEquals(await res.json(), { accepted: true });
    assertEquals(state.started, 1);
    assertEquals(state.background.length, 1);
    await Promise.all(state.background);
  }));

Deno.test("parse-meal logs, not throws, when the batch fails", () =>
  withSecret(SECRET, async () => {
    const background: Promise<unknown>[] = [];
    const handler = createHandler(
      () => Promise.reject(new Error("boom")),
      (work) => background.push(work),
    );
    const res = await handler(post(`Bearer ${SECRET}`));
    assertEquals(res.status, 202);
    await Promise.all(background); // resolves: the rejection is handled
  }));

Deno.test("parse-meal returns 500 when the secret isn't configured", () =>
  withSecret(undefined, async () => {
    const { handler, state } = countingHandler();
    const res = await handler(post(`Bearer ${SECRET}`));
    assertEquals(res.status, 500);
    assertEquals(state.started, 0);
  }));

Deno.test("parse-meal only accepts POST", () =>
  withSecret(SECRET, async () => {
    const { handler } = countingHandler();
    const res = await handler(
      new Request("http://localhost/parse-meal", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    assertEquals(res.status, 405);
    await res.body?.cancel();
  }));
