import type { CreateMeal } from "@/lib/validation/meal";

// Pure helpers for POST /api/meals, kept out of the route so they can be tested.

// A photo path must sit in the caller's own folder ({uid}/…), as issued by the
// upload-URL route. Storage RLS guards the object; this guards the meals row.
export function isOwnPhotoPath(path: string, userId: string): boolean {
  return path.toLowerCase().startsWith(`${userId.toLowerCase()}/`);
}

// Arguments for the create_meal() RPC (migration 20261117025425).
export function toCreateMealArgs(meal: CreateMeal) {
  return {
    p_attendee_ids: meal.attendee_ids,
    p_raw_text: meal.raw_text,
    p_photo_path: meal.photo_path,
    p_meal_type: meal.meal_type,
    p_ratings: meal.ratings,
  };
}

export type CreateMealFailure = { status: 400 | 500; error: string };

// Maps a Postgres error code from create_meal() to an HTTP response.
// 42501: RLS denied an attendee (another user's person).
// 23503: an attendee or rated person doesn't exist.
// 23514, 22023, 22P02: a check the schema should already have caught.
export function classifyCreateMealError(code: string | undefined): CreateMealFailure {
  switch (code) {
    case "42501":
    case "23503":
      return { status: 400, error: "invalid_attendees" };
    case "23514":
    case "22023":
    case "22P02":
      return { status: 400, error: "invalid_input" };
    default:
      return { status: 500, error: "create_failed" };
  }
}
