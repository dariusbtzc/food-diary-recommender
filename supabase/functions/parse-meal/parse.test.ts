import { assert, assertEquals } from "@std/assert";
import Anthropic from "npm:@anthropic-ai/sdk@1.10.0";
import { config } from "./config.ts";
import {
  type Deps,
  matchPlace,
  nextSgtMidnight,
  normalizePlaceName,
  processBatch,
  processMessage,
  sgtDay,
} from "./parse.ts";
import type { Meal, Place, QueueMessage, SaveParseArgs, Store } from "./store.ts";
import type { Usage } from "./model.ts";

const OWNER = "a0000000-0000-4000-8000-00000000000a";
const OTHER = "b0000000-0000-4000-8000-00000000000b";
const MEAL = "a4000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-19T04:00:00Z"); // 12:00 SGT

// In-memory store ---------------------------------------------------------------
class FakeStore implements Store {
  meals = new Map<string, Meal>();
  places: Place[] = [];
  parsesToday = 0;
  names = ["You", "Jane"];
  photo = new Uint8Array([0xff, 0xd8, 0xff]);

  deleted: number[] = [];
  requeued: { msgId: number; notBefore: Date }[] = [];
  usage: { ownerId: string; day: string; usage: Usage }[] = [];
  saved: SaveParseArgs[] = [];
  failed: string[] = [];
  photosDownloaded: string[] = [];
  queue: QueueMessage[] = [];

  readQueue() {
    return Promise.resolve(this.queue);
  }
  deleteMessage(msgId: number) {
    this.deleted.push(msgId);
    return Promise.resolve();
  }
  requeue(msgId: number, notBefore: Date) {
    this.requeued.push({ msgId, notBefore });
    return Promise.resolve();
  }
  getMeal(id: string) {
    return Promise.resolve(this.meals.get(id) ?? null);
  }
  countParsesOn() {
    return Promise.resolve(this.parsesToday);
  }
  attendeeFirstNames() {
    return Promise.resolve(this.names);
  }
  downloadPhoto(path: string) {
    this.photosDownloaded.push(path);
    return Promise.resolve(this.photo);
  }
  listPlaces() {
    // Deliberately returns every owner's places: matchPlace must filter.
    return Promise.resolve(this.places);
  }
  recordUsage(ownerId: string, day: string, usage: Usage) {
    this.usage.push({ ownerId, day, usage });
    return Promise.resolve();
  }
  saveParse(args: SaveParseArgs) {
    this.saved.push(args);
    return Promise.resolve(true);
  }
  markFailed(mealId: string) {
    this.failed.push(mealId);
    return Promise.resolve();
  }
}

function pendingMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: MEAL,
    ownerId: OWNER,
    placeId: null,
    rawText: "laksa at Katong Laksa w/ Jane, $14",
    photoPath: null,
    parseStatus: "pending",
    ...overrides,
  };
}

function message(readCt = 1, body: unknown = { meal_id: MEAL }): QueueMessage {
  return { msgId: 7, readCt, message: body };
}

// Fake Anthropic API ------------------------------------------------------------
type Reply = () => Response;

function okAnswer(answer: unknown, extra: Record<string, unknown> = {}): Reply {
  return () =>
    Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: config.model,
      content: [{ type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 700,
        cache_read_input_tokens: 0,
      },
      ...extra,
    });
}

function apiError(status: number, type: string): Reply {
  return () =>
    Response.json({ type: "error", error: { type, message: "test error" } }, { status });
}

function fakeAnthropic(reply: Reply) {
  const requests: Record<string, unknown>[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return await Promise.resolve(reply());
    },
  });
  return { client, requests };
}

function setup(reply: Reply, meal: Meal | null = pendingMeal()) {
  const store = new FakeStore();
  if (meal) store.meals.set(meal.id, meal);
  const { client, requests } = fakeAnthropic(reply);
  const deps: Deps = { store, anthropic: client, now: () => NOW };
  return { store, deps, requests };
}

const GOOD = {
  place_name: "Katong Laksa",
  dishes: [{ name: "laksa", cuisine: "peranakan", tags: ["spicy", "contains_seafood"] }],
  total_cost_sgd: 14,
  confidence: 0.92,
};

const KATONG: Place = { id: "a3000000-0000-4000-8000-000000000001", ownerId: OWNER, name: "Katong Laksa" };

// Happy path ----------------------------------------------------------------------
Deno.test("a valid answer with a known place is saved as done", async () => {
  const { store, deps, requests } = setup(okAnswer(GOOD));
  store.places = [KATONG];

  assertEquals(await processMessage(deps, message()), "parsed");
  assertEquals(store.saved, [{
    mealId: MEAL,
    ownerId: OWNER,
    items: [{ dish_name: "laksa", cuisine: "peranakan", tags: ["spicy", "contains_seafood"] }],
    placeId: KATONG.id,
    totalCostSgd: 14,
    confidence: 0.92,
    status: "done",
  }]);
  assertEquals(store.deleted, [7]);
  // Usage counts cache writes as input.
  assertEquals(store.usage, [{
    ownerId: OWNER,
    day: "2026-11-19",
    usage: { inputTokens: 800, outputTokens: 50 },
  }]);

  // The request: model, limits, thinking off, cached system prompt, no sampling.
  const req = requests[0];
  assertEquals(req.model, "claude-haiku-5-5");
  assertEquals(req.max_tokens, 600);
  assertEquals(req.thinking, { type: "disabled" });
  assertEquals((req.output_config as { effort: string }).effort, "medium");
  assertEquals(
    ((req.output_config as { format: { type: string } }).format).type,
    "json_schema",
  );
  assertEquals((req.system as { cache_control: unknown }[])[0].cache_control, {
    type: "ephemeral",
  });
  assertEquals("temperature" in req, false);
  const text = JSON.stringify(req.messages);
  assert(text.includes("People at the meal: You, Jane"));
  assert(text.includes("There is no photo."));
});

Deno.test("place names match ignoring case and punctuation", () => {
  assertEquals(normalizePlaceName("  Tian-Tian Chicken Rice. "), "tian tian chicken rice");
  assertEquals(matchPlace("katong laksa!", OWNER, [KATONG])?.id, KATONG.id);
});

// needs_review ------------------------------------------------------------------
Deno.test("low confidence is saved as needs_review", async () => {
  const { store, deps } = setup(okAnswer({ ...GOOD, confidence: 0.5 }));
  store.places = [KATONG];
  assertEquals(await processMessage(deps, message()), "parsed");
  assertEquals(store.saved[0].status, "needs_review");
  assertEquals(store.saved[0].placeId, KATONG.id);
});

Deno.test("an unknown place leaves place_id null and needs_review", async () => {
  const { store, deps } = setup(okAnswer(GOOD));
  assertEquals(await processMessage(deps, message()), "parsed");
  assertEquals(store.saved[0].placeId, null);
  assertEquals(store.saved[0].status, "needs_review");
});

Deno.test("another owner's place is never matched (S4)", async () => {
  const { store, deps } = setup(okAnswer(GOOD));
  store.places = [{ ...KATONG, id: "b3000000-0000-4000-8000-000000000001", ownerId: OTHER }];
  assertEquals(await processMessage(deps, message()), "parsed");
  assertEquals(store.saved[0].placeId, null);
  assertEquals(store.saved[0].status, "needs_review");
});

Deno.test("a pre-set place is kept, whatever the parsed name", async () => {
  const preset = "a3000000-0000-4000-8000-0000000000ff";
  const { store, deps } = setup(
    okAnswer({ ...GOOD, place_name: "Somewhere Else" }),
    pendingMeal({ placeId: preset }),
  );
  store.places = [KATONG];
  assertEquals(await processMessage(deps, message()), "parsed");
  assertEquals(store.saved[0].placeId, preset);
  assertEquals(store.saved[0].status, "done");
});

// Invalid answers and attempts --------------------------------------------------
Deno.test("an answer that isn't JSON is retried and still counted", async () => {
  const { store, deps } = setup(okAnswer("not json at all"));
  assertEquals(await processMessage(deps, message(1)), "retry");
  assertEquals(store.deleted, []);
  assertEquals(store.failed, []);
  assertEquals(store.usage.length, 1);
});

Deno.test("a cuisine outside the list is invalid", async () => {
  const { store, deps } = setup(
    okAnswer({ ...GOOD, dishes: [{ name: "laksa", cuisine: "nyonya", tags: [] }] }),
  );
  assertEquals(await processMessage(deps, message(1)), "retry");
  assertEquals(store.saved, []);
});

Deno.test("a cost or confidence out of range is invalid", async () => {
  for (const bad of [{ ...GOOD, confidence: 1.4 }, { ...GOOD, total_cost_sgd: -3 }]) {
    const { store, deps } = setup(okAnswer(bad));
    assertEquals(await processMessage(deps, message(1)), "retry");
    assertEquals(store.saved, []);
  }
});

Deno.test("an answer cut off at max_tokens is retried", async () => {
  const { deps } = setup(okAnswer('{"place_name": "Kat', { stop_reason: "max_tokens" }));
  assertEquals(await processMessage(deps, message(1)), "retry");
});

Deno.test("the 3rd failed attempt marks the meal failed", async () => {
  const { store, deps } = setup(okAnswer("not json"));
  assertEquals(await processMessage(deps, message(config.maxAttempts)), "failed");
  assertEquals(store.failed, [MEAL]);
  assertEquals(store.deleted, [7]);
});

Deno.test("a 4th read marks the meal failed without a call", async () => {
  const { store, deps, requests } = setup(okAnswer(GOOD));
  assertEquals(await processMessage(deps, message(config.maxAttempts + 1)), "failed");
  assertEquals(requests.length, 0);
  assertEquals(store.failed, [MEAL]);
});

// Refusals and API errors -------------------------------------------------------
Deno.test("a refusal fails the meal at once and is still counted", async () => {
  const { store, deps } = setup(okAnswer("", {
    stop_reason: "refusal",
    stop_details: { type: "refusal", category: "general_harms", explanation: null },
  }));
  assertEquals(await processMessage(deps, message(1)), "failed");
  assertEquals(store.failed, [MEAL]);
  assertEquals(store.usage.length, 1);
});

Deno.test("a 400 from the API fails the meal at once", async () => {
  const { store, deps } = setup(apiError(400, "invalid_request_error"));
  assertEquals(await processMessage(deps, message(1)), "failed");
  assertEquals(store.failed, [MEAL]);
  assertEquals(store.usage, []);
});

Deno.test("a rate limit or overload is retried", async () => {
  for (const reply of [apiError(429, "rate_limit_error"), apiError(529, "overloaded_error")]) {
    const { store, deps } = setup(reply);
    assertEquals(await processMessage(deps, message(1)), "retry");
    assertEquals(store.failed, []);
    assertEquals(store.deleted, []);
  }
});

Deno.test("a rejected API key re-queues without using an attempt", async () => {
  const { store, deps } = setup(apiError(401, "authentication_error"));
  assertEquals(await processMessage(deps, message(config.maxAttempts)), "waiting");
  assertEquals(store.failed, []);
  assertEquals(store.requeued, [{ msgId: 7, notBefore: new Date(NOW.getTime() + 600_000) }]);
});

// Daily limit (S1) --------------------------------------------------------------
Deno.test("an owner at the daily limit is re-queued until SGT midnight", async () => {
  const { store, deps, requests } = setup(okAnswer(GOOD));
  store.parsesToday = config.dailyParseLimit;
  assertEquals(await processMessage(deps, message(2)), "deferred");
  assertEquals(requests.length, 0);
  // 12:00 SGT on 19 Nov -> 00:00 SGT on 20 Nov = 16:00 UTC on 19 Nov.
  assertEquals(store.requeued, [{ msgId: 7, notBefore: new Date("2026-11-19T16:00:00Z") }]);
  assertEquals(store.failed, []);
});

Deno.test("SGT day and midnight roll over at 16:00 UTC", () => {
  assertEquals(sgtDay(new Date("2026-11-19T15:59:59Z")), "2026-11-19");
  assertEquals(sgtDay(new Date("2026-11-19T16:00:00Z")), "2026-11-20");
  assertEquals(nextSgtMidnight(new Date("2026-11-19T15:59:59Z")).toISOString(), "2026-11-19T16:00:00.000Z");
  assertEquals(nextSgtMidnight(new Date("2026-11-19T16:00:00Z")).toISOString(), "2026-11-20T16:00:00.000Z");
});

// Messages that need no call ----------------------------------------------------
Deno.test("a meal that is no longer pending is skipped without a call", async () => {
  const { store, deps, requests } = setup(okAnswer(GOOD), pendingMeal({ parseStatus: "done" }));
  assertEquals(await processMessage(deps, message()), "skipped");
  assertEquals(requests.length, 0);
  assertEquals(store.deleted, [7]);
});

Deno.test("a deleted meal is skipped", async () => {
  const { store, deps } = setup(okAnswer(GOOD), null);
  assertEquals(await processMessage(deps, message()), "skipped");
  assertEquals(store.deleted, [7]);
});

Deno.test("a malformed message is dropped", async () => {
  const { store, deps, requests } = setup(okAnswer(GOOD));
  assertEquals(await processMessage(deps, message(1, { meal: "x" })), "dropped");
  assertEquals(requests.length, 0);
  assertEquals(store.deleted, [7]);
});

// Photos ------------------------------------------------------------------------
Deno.test("a photo in the owner's folder is sent as a JPEG image", async () => {
  const path = `${OWNER}/photo.jpg`;
  const { store, deps, requests } = setup(okAnswer(GOOD), pendingMeal({ photoPath: path }));
  await processMessage(deps, message());
  assertEquals(store.photosDownloaded, [path]);
  const content = (requests[0].messages as { content: { type: string; source?: unknown }[] }[])[0]
    .content;
  assertEquals(content[0], {
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: "/9j/" },
  });
});

Deno.test("a photo outside the owner's folder is never sent", async () => {
  const { store, deps, requests } = setup(
    okAnswer(GOOD),
    pendingMeal({ photoPath: `${OTHER}/photo.jpg` }),
  );
  await processMessage(deps, message());
  assertEquals(store.photosDownloaded, []);
  assert(JSON.stringify(requests[0].messages).includes("There is no photo."));
});

// Batch -------------------------------------------------------------------------
Deno.test("processBatch counts outcomes and survives a store error", async () => {
  const { store, deps } = setup(okAnswer(GOOD));
  store.queue = [message(1), { msgId: 8, readCt: 1, message: { meal_id: "bad" } }];
  const broken = { msgId: 9, readCt: 1, message: { meal_id: OTHER } };
  store.queue.push(broken);
  store.getMeal = (id: string) =>
    id === OTHER ? Promise.reject(new Error("db down")) : Promise.resolve(store.meals.get(id) ?? null);

  const counts = await processBatch(deps);
  assertEquals(counts.parsed, 1);
  assertEquals(counts.dropped, 1);
  assertEquals(counts.retry, 1);
});
