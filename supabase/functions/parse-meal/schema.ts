import { z } from "npm:zod@4";
import { CUISINES } from "../_shared/cuisines.ts";

// Tags use the same format as constraint tags (lowercase, a-z0-9_).
export const TAG_PATTERN = /^[a-z][a-z0-9_]*$/;

const dishSchema = z.object({
  name: z.string().min(1).max(80),
  // The API enforces the enum, so the model can't invent a cuisine.
  cuisine: z.enum(CUISINES).nullable(),
  tags: z.array(z.string().regex(TAG_PATTERN).max(32)).max(5),
});

// What Haiku must return. Constraints the API can't enforce (min/max,
// lengths, patterns) are stripped from the request by zodOutputFormat and
// checked here, by safeParse, on every response.
export const mealParseSchema = z.object({
  // Only when stated in the note or clearly visible; otherwise null.
  place_name: z.string().min(1).max(120).nullable(),
  dishes: z.array(dishSchema).min(1).max(10),
  // The total for the table in SGD, only when the note states it.
  total_cost_sgd: z.number().min(0).max(10000).nullable(),
  confidence: z.number().min(0).max(1),
});

export type MealParse = z.infer<typeof mealParseSchema>;

// The pgmq message written by the enqueue trigger.
export const queueMessageSchema = z.object({ meal_id: z.uuid() });
