import type { CreateMealInput, MealType } from "../validation/meal";

// Quick log form state → POST /api/meals body. Pure, so it can be tested.

export interface QuickLogState {
  text: string;
  attendeeIds: string[];
  // Stars by person id. A person with no entry (or undefined) wasn't rated.
  ratings: Record<string, number | undefined>;
}

export function canSave(state: QuickLogState, hasPhoto: boolean): boolean {
  return (hasPhoto || state.text.trim() !== "") && state.attendeeIds.length > 0;
}

export function buildMealPayload(
  state: QuickLogState,
  options: { photoPath?: string; mealType?: MealType },
): CreateMealInput {
  const text = state.text.trim();
  // Only people still selected keep their rating, in attendee order.
  const ratings = state.attendeeIds.flatMap((personId) => {
    const score = state.ratings[personId];
    return score ? [{ person_id: personId, score }] : [];
  });

  return {
    ...(text ? { raw_text: text } : {}),
    ...(options.photoPath ? { photo_path: options.photoPath } : {}),
    ...(options.mealType ? { meal_type: options.mealType } : {}),
    attendee_ids: state.attendeeIds,
    ...(ratings.length > 0 ? { ratings } : {}),
  };
}

// User-facing message for a failed POST /api/meals.
export function saveErrorMessage(status: number): string {
  if (status === 401) return "You've been signed out. Sign in again to save.";
  if (status === 400) return "This meal couldn't be saved. Check the details and try again.";
  return "Couldn't save right now. Try again in a moment.";
}
