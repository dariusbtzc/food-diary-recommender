import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { config } from "./config.ts";
import type { Usage } from "./model.ts";

// Everything the worker reads and writes, behind one interface so parse.ts
// can be tested with an in-memory store. The worker runs as the service role
// (no RLS): every method that touches user data filters by owner_id.

export interface QueueMessage {
  msgId: number;
  readCt: number;
  message: unknown;
}

export interface Meal {
  id: string;
  ownerId: string;
  placeId: string | null;
  rawText: string | null;
  photoPath: string | null;
  parseStatus: string;
}

export interface Place {
  id: string;
  ownerId: string;
  name: string;
}

export interface SaveParseArgs {
  mealId: string;
  ownerId: string;
  items: { dish_name: string; cuisine: string | null; tags: string[] }[];
  placeId: string | null;
  totalCostSgd: number | null;
  confidence: number;
  status: "done" | "needs_review";
}

export interface Store {
  readQueue(qty: number, visibilityTimeoutSeconds: number): Promise<QueueMessage[]>;
  deleteMessage(msgId: number): Promise<void>;
  requeue(msgId: number, notBefore: Date): Promise<void>;
  getMeal(mealId: string): Promise<Meal | null>;
  countParsesOn(ownerId: string, sgtDay: string): Promise<number>;
  attendeeFirstNames(mealId: string, ownerId: string): Promise<string[]>;
  downloadPhoto(path: string): Promise<Uint8Array>;
  listPlaces(ownerId: string): Promise<Place[]>;
  recordUsage(ownerId: string, sgtDay: string, usage: Usage): Promise<void>;
  saveParse(args: SaveParseArgs): Promise<boolean>;
  markFailed(mealId: string, ownerId: string): Promise<void>;
}

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export function createSupabaseStore(db: SupabaseClient): Store {
  return {
    async readQueue(qty, vt) {
      const rows = check(
        await db.rpc("parse_queue_read", { p_qty: qty, p_vt_seconds: vt }),
        "parse_queue_read",
      ) as { msg_id: number; read_ct: number; message: unknown }[];
      return rows.map((r) => ({ msgId: r.msg_id, readCt: r.read_ct, message: r.message }));
    },

    async deleteMessage(msgId) {
      check(await db.rpc("parse_queue_delete", { p_msg_id: msgId }), "parse_queue_delete");
    },

    async requeue(msgId, notBefore) {
      check(
        await db.rpc("parse_queue_requeue", {
          p_msg_id: msgId,
          p_not_before: notBefore.toISOString(),
        }),
        "parse_queue_requeue",
      );
    },

    async getMeal(mealId) {
      const row = check(
        await db
          .from("meals")
          .select("id, owner_id, place_id, raw_text, photo_path, parse_status")
          .eq("id", mealId)
          .maybeSingle(),
        "select meal",
      );
      if (!row) return null;
      return {
        id: row.id,
        ownerId: row.owner_id,
        placeId: row.place_id,
        rawText: row.raw_text,
        photoPath: row.photo_path,
        parseStatus: row.parse_status,
      };
    },

    async countParsesOn(ownerId, sgtDay) {
      const result = await db
        .from("llm_usage")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", ownerId)
        .eq("day", sgtDay)
        .eq("purpose", "parse");
      if (result.error) throw new Error(`count llm_usage: ${result.error.message}`);
      return result.count ?? 0;
    },

    // First names only (brief: LLM data minimisation). The owner is "You".
    async attendeeFirstNames(mealId, ownerId) {
      const rows = check(
        await db
          .from("meal_attendees")
          .select("people!inner(name, is_self, owner_id)")
          .eq("meal_id", mealId)
          .eq("people.owner_id", ownerId),
        "select attendees",
      ) as unknown as { people: { name: string; is_self: boolean } }[];
      const people = rows.map((r) => r.people);
      const self = people.some((p) => p.is_self) ? ["You"] : [];
      const others = people
        .filter((p) => !p.is_self)
        .map((p) => p.name.trim().split(/\s+/)[0])
        .sort();
      return [...self, ...others];
    },

    async downloadPhoto(path) {
      const { data, error } = await db.storage.from(config.photoBucket).download(path);
      if (error || !data) throw new Error(`download photo: ${error?.message ?? "no data"}`);
      return new Uint8Array(await data.arrayBuffer());
    },

    async listPlaces(ownerId) {
      const rows = check(
        await db.from("places").select("id, owner_id, name").eq("owner_id", ownerId),
        "select places",
      );
      return (rows ?? []).map((r) => ({ id: r.id, ownerId: r.owner_id, name: r.name }));
    },

    async recordUsage(ownerId, sgtDay, usage) {
      check(
        await db.from("llm_usage").insert({
          owner_id: ownerId,
          day: sgtDay,
          purpose: "parse",
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
        }),
        "insert llm_usage",
      );
    },

    async saveParse(a) {
      return check(
        await db.rpc("save_meal_parse", {
          p_meal_id: a.mealId,
          p_owner_id: a.ownerId,
          p_items: a.items,
          p_place_id: a.placeId,
          p_total_cost_sgd: a.totalCostSgd,
          p_confidence: a.confidence,
          p_status: a.status,
        }),
        "save_meal_parse",
      ) as boolean;
    },

    // Only a pending meal is marked failed, so a hand edit is never undone.
    async markFailed(mealId, ownerId) {
      check(
        await db
          .from("meals")
          .update({ parse_status: "failed" })
          .eq("id", mealId)
          .eq("owner_id", ownerId)
          .eq("parse_status", "pending"),
        "mark failed",
      );
    },
  };
}
