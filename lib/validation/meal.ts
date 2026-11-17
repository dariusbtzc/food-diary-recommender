import { z } from "zod";

import { PHOTO_EXTENSION } from "../photos/constants";

// Values from the meals schema (task 3) and limits agreed in task 8.
export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "supper", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MAX_RAW_TEXT_LENGTH = 1000;
export const MAX_ATTENDEES = 20;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// The shape POST /api/meals/photo-upload-url issues: {uid}/{uuid}.jpg. The route
// also checks that the folder is the caller's own id.
const PHOTO_PATH = new RegExp(`^${UUID}/${UUID}\\.${PHOTO_EXTENSION}$`, "i");

const ratingSchema = z.object({
  person_id: z.uuid(),
  score: z.int().min(1).max(5),
});

// Strict: unknown keys (e.g. owner_id, parse_status, source) are rejected, not ignored.
export const createMealSchema = z
  .strictObject({
    // Blank text counts as no text.
    raw_text: z
      .string()
      .trim()
      .max(MAX_RAW_TEXT_LENGTH)
      .optional()
      .transform((text) => (text ? text : undefined)),
    photo_path: z.string().regex(PHOTO_PATH, "Invalid photo path.").optional(),
    meal_type: z.enum(MEAL_TYPES).optional(),
    attendee_ids: z
      .array(z.uuid())
      .min(1)
      .max(MAX_ATTENDEES)
      .refine((ids) => new Set(ids).size === ids.length, "Attendees must be unique."),
    ratings: z.array(ratingSchema).max(MAX_ATTENDEES).default([]),
  })
  .superRefine((meal, ctx) => {
    if (!meal.raw_text && !meal.photo_path) {
      ctx.addIssue({ code: "custom", message: "Add a photo or a note.", path: ["raw_text"] });
    }
    const attendees = new Set(meal.attendee_ids);
    const rated = new Set<string>();
    meal.ratings.forEach((rating, i) => {
      if (!attendees.has(rating.person_id)) {
        ctx.addIssue({
          code: "custom",
          message: "Only attendees can be rated.",
          path: ["ratings", i, "person_id"],
        });
      }
      if (rated.has(rating.person_id)) {
        ctx.addIssue({
          code: "custom",
          message: "One rating per person.",
          path: ["ratings", i, "person_id"],
        });
      }
      rated.add(rating.person_id);
    });
  });

export type CreateMealInput = z.input<typeof createMealSchema>;
export type CreateMeal = z.output<typeof createMealSchema>;
