import type Anthropic from "npm:@anthropic-ai/sdk@1.10.0";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { config } from "./config.ts";
import { callModel, classifyError } from "./model.ts";
import type { MealParse } from "./schema.ts";
import { queueMessageSchema } from "./schema.ts";
import type { Meal, Place, QueueMessage, Store } from "./store.ts";

export interface Deps {
  store: Store;
  anthropic: Anthropic;
  now: () => Date;
}

export type Outcome =
  | "parsed" // saved as done or needs_review
  | "skipped" // meal gone, or no longer pending: message deleted, no call
  | "dropped" // malformed message: deleted
  | "deferred" // owner at the daily limit: re-queued until SGT midnight
  | "retry" // left in the queue; reappears after the visibility timeout
  | "waiting" // API key problem: re-queued without using an attempt
  | "failed"; // meal marked failed, message deleted

// How long a message waits when the API key is missing or rejected.
const CONFIG_ERROR_DELAY_MS = 10 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// The Singapore calendar date (YYYY-MM-DD) at `now`; llm_usage.day uses it.
export function sgtDay(now: Date): string {
  return new Date(now.getTime() + config.sgtOffsetHours * HOUR_MS).toISOString().slice(0, 10);
}

// The next midnight in Singapore after `now`.
export function nextSgtMidnight(now: Date): Date {
  const offset = config.sgtOffsetHours * HOUR_MS;
  const local = now.getTime() + offset;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS + DAY_MS - offset);
}

// Lowercase, without punctuation or repeated spaces, so "Tian Tian Chicken
// Rice" and "tian tian chicken rice." match.
export function normalizePlaceName(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Matches a parsed name to one of the owner's places. Places owned by anyone
// else are ignored even if the store returns them (S4).
export function matchPlace(placeName: string, ownerId: string, places: Place[]): Place | null {
  const wanted = normalizePlaceName(placeName);
  if (!wanted) return null;
  return places.find((p) => p.ownerId === ownerId && normalizePlaceName(p.name) === wanted) ??
    null;
}

export function statusFor(parse: MealParse, placeId: string | null): "done" | "needs_review" {
  return parse.confidence >= config.doneThreshold && placeId !== null ? "done" : "needs_review";
}

function log(event: Record<string, unknown>) {
  // Ids and outcomes only: never notes, names or dishes.
  console.log(JSON.stringify({ fn: "parse-meal", ...event }));
}

export async function processBatch(deps: Deps): Promise<Record<Outcome, number>> {
  const messages = await deps.store.readQueue(config.batchSize, config.visibilityTimeoutSeconds);
  const counts: Record<Outcome, number> = {
    parsed: 0,
    skipped: 0,
    dropped: 0,
    deferred: 0,
    retry: 0,
    waiting: 0,
    failed: 0,
  };
  // In parallel, so a batch takes about one model call, well inside the
  // visibility timeout.
  const results = await Promise.allSettled(messages.map((m) => processMessage(deps, m)));
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      counts[r.value]++;
    } else {
      // Unexpected (database or storage error): the message reappears after
      // the visibility timeout; a 4th read marks the meal failed.
      counts.retry++;
      log({ msg_id: messages[i].msgId, outcome: "retry", error: String(r.reason) });
    }
  });
  return counts;
}

export async function processMessage(deps: Deps, msg: QueueMessage): Promise<Outcome> {
  const { store } = deps;

  const parsedMessage = queueMessageSchema.safeParse(msg.message);
  if (!parsedMessage.success) {
    await store.deleteMessage(msg.msgId);
    log({ msg_id: msg.msgId, outcome: "dropped" });
    return "dropped";
  }

  const meal = await store.getMeal(parsedMessage.data.meal_id);
  if (!meal || meal.parseStatus !== "pending") {
    await store.deleteMessage(msg.msgId);
    log({ msg_id: msg.msgId, meal_id: parsedMessage.data.meal_id, outcome: "skipped" });
    return "skipped";
  }

  // Reached only if earlier runs died before recording an outcome.
  if (msg.readCt > config.maxAttempts) {
    return await fail(deps, msg, meal, "too many reads");
  }

  const now = deps.now();
  const day = sgtDay(now);
  if ((await store.countParsesOn(meal.ownerId, day)) >= config.dailyParseLimit) {
    await store.requeue(msg.msgId, nextSgtMidnight(now));
    log({ msg_id: msg.msgId, meal_id: meal.id, outcome: "deferred" });
    return "deferred";
  }

  const firstNames = await store.attendeeFirstNames(meal.id, meal.ownerId);
  const photoBase64 = await loadPhoto(store, meal);

  let result;
  try {
    result = await callModel(deps.anthropic, { note: meal.rawText, firstNames, photoBase64 });
  } catch (error) {
    const action = classifyError(error);
    if (action === "config") {
      await store.requeue(msg.msgId, new Date(now.getTime() + CONFIG_ERROR_DELAY_MS));
      log({ msg_id: msg.msgId, meal_id: meal.id, outcome: "waiting", error: String(error) });
      return "waiting";
    }
    if (action === "fail") return await fail(deps, msg, meal, String(error));
    return await retryOrFail(deps, msg, meal, String(error));
  }

  // Tokens were spent whatever the answer, so every call counts.
  await store.recordUsage(meal.ownerId, day, result.usage);

  if (result.kind === "refused") {
    return await fail(deps, msg, meal, `refused (${result.category ?? "no category"})`);
  }
  if (result.kind === "invalid") {
    return await retryOrFail(deps, msg, meal, result.reason);
  }

  const parse = result.parse;
  let placeId = meal.placeId; // M4's "We went here" pre-fill is kept.
  if (!placeId && parse.place_name) {
    placeId = matchPlace(parse.place_name, meal.ownerId, await store.listPlaces(meal.ownerId))
      ?.id ?? null;
  }
  const status = statusFor(parse, placeId);

  const saved = await store.saveParse({
    mealId: meal.id,
    ownerId: meal.ownerId,
    items: parse.dishes.map((d) => ({
      dish_name: d.name.trim(),
      cuisine: d.cuisine,
      tags: [...new Set(d.tags)],
    })),
    placeId,
    totalCostSgd: parse.total_cost_sgd === null
      ? null
      : Math.round(parse.total_cost_sgd * 100) / 100,
    confidence: parse.confidence,
    status,
  });
  await store.deleteMessage(msg.msgId);
  log({
    msg_id: msg.msgId,
    meal_id: meal.id,
    outcome: saved ? "parsed" : "skipped",
    status,
    confidence: parse.confidence,
    place_found: placeId !== null,
  });
  return saved ? "parsed" : "skipped";
}

// A photo outside the owner's folder is never sent (photos live at
// {owner_id}/{uuid}.jpg).
async function loadPhoto(store: Store, meal: Meal): Promise<string | null> {
  if (!meal.photoPath) return null;
  if (!meal.photoPath.startsWith(`${meal.ownerId}/`)) {
    log({ meal_id: meal.id, warning: "photo path outside the owner's folder; not sent" });
    return null;
  }
  return encodeBase64(await store.downloadPhoto(meal.photoPath));
}

async function retryOrFail(deps: Deps, msg: QueueMessage, meal: Meal, reason: string) {
  if (msg.readCt >= config.maxAttempts) return await fail(deps, msg, meal, reason);
  log({ msg_id: msg.msgId, meal_id: meal.id, outcome: "retry", attempt: msg.readCt, reason });
  return "retry" as const;
}

async function fail(deps: Deps, msg: QueueMessage, meal: Meal, reason: string) {
  await deps.store.markFailed(meal.id, meal.ownerId);
  await deps.store.deleteMessage(msg.msgId);
  log({ msg_id: msg.msgId, meal_id: meal.id, outcome: "failed", attempt: msg.readCt, reason });
  return "failed" as const;
}
