import { assertEquals } from "@std/assert";
import { isAuthorizedWorker, requireWorkerSecret } from "./worker-auth.ts";

const SECRET = "test-worker-secret";

Deno.test("isAuthorizedWorker accepts only the exact bearer secret", async () => {
  assertEquals(await isAuthorizedWorker(`Bearer ${SECRET}`, SECRET), true);
  assertEquals(await isAuthorizedWorker(null, SECRET), false);
  assertEquals(await isAuthorizedWorker("", SECRET), false);
  assertEquals(await isAuthorizedWorker(SECRET, SECRET), false);
  assertEquals(await isAuthorizedWorker(`Bearer ${SECRET}x`, SECRET), false);
  assertEquals(await isAuthorizedWorker(`bearer ${SECRET}`, SECRET), false);
  assertEquals(await isAuthorizedWorker("Bearer " + "x".repeat(2000), SECRET), false);
});

Deno.test("isAuthorizedWorker refuses everything when the secret is unset or empty", async () => {
  assertEquals(await isAuthorizedWorker("Bearer undefined", undefined), false);
  assertEquals(await isAuthorizedWorker("Bearer ", ""), false);
});

Deno.test("requireWorkerSecret fails closed with 500 when the env var is missing", async () => {
  const previous = Deno.env.get("PARSE_WORKER_SECRET");
  Deno.env.delete("PARSE_WORKER_SECRET");
  try {
    const res = await requireWorkerSecret(
      new Request("http://localhost", { headers: { authorization: "Bearer x" } }),
    );
    assertEquals(res?.status, 500);
  } finally {
    if (previous !== undefined) Deno.env.set("PARSE_WORKER_SECRET", previous);
  }
});
