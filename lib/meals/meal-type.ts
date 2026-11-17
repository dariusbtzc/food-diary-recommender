import type { MealType } from "../validation/meal";

// Meal type from the time of day in Singapore (bands approved 17 Nov; the
// brief and app-ui don't define them). Each band starts at the given minute
// after midnight and runs until the next band starts; supper wraps past midnight.
export const MEAL_TIME_ZONE = "Asia/Singapore";

export const MEAL_TYPE_BANDS: readonly { type: MealType; from: number }[] = [
  { type: "breakfast", from: 5 * 60 }, // 05:00
  { type: "lunch", from: 11 * 60 }, // 11:00
  { type: "snack", from: 15 * 60 }, // 15:00
  { type: "dinner", from: 17 * 60 + 30 }, // 17:30
  { type: "supper", from: 22 * 60 }, // 22:00, through 04:59
];

const timeParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: MEAL_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const headerDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: MEAL_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

function minutesInSingapore(date: Date): number {
  const parts = timeParts.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour * 60 + minute;
}

export function mealTypeAt(date: Date): MealType {
  const minutes = minutesInSingapore(date);
  // Before the first band (00:00–04:59) is still supper.
  let current: MealType = MEAL_TYPE_BANDS[MEAL_TYPE_BANDS.length - 1].type;
  for (const band of MEAL_TYPE_BANDS) {
    if (minutes >= band.from) current = band.type;
  }
  return current;
}

const LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  supper: "Supper",
  snack: "Snack",
};

// "Tue 27 Oct · Dinner", as in the Quick log header.
export function quickLogHeading(date: Date): string {
  const parts = headerDate.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${get("weekday")} ${get("day")} ${get("month")} · ${LABELS[mealTypeAt(date)]}`;
}
