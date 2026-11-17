import { describe, expect, it } from "vitest";

import { createMealSchema } from "../validation/meal";
import { buildMealPayload, canSave, saveErrorMessage } from "./payload";

const ME = "a1000000-0000-4000-8000-000000000001";
const JANE = "a1000000-0000-4000-8000-000000000002";
const MARK = "a1000000-0000-4000-8000-000000000003";
const PHOTO = "a0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-000000000001.jpg";

describe("canSave", () => {
  const base = { text: "", attendeeIds: [ME], ratings: {} };

  it("needs text or a photo", () => {
    expect(canSave(base, false)).toBe(false);
    expect(canSave({ ...base, text: "   " }, false)).toBe(false);
    expect(canSave({ ...base, text: "laksa" }, false)).toBe(true);
    expect(canSave(base, true)).toBe(true);
  });

  it("needs at least one attendee", () => {
    expect(canSave({ ...base, text: "laksa", attendeeIds: [] }, false)).toBe(false);
  });
});

describe("buildMealPayload", () => {
  it("trims text and leaves out empty parts", () => {
    expect(
      buildMealPayload({ text: "  laksa  ", attendeeIds: [ME], ratings: {} }, {}),
    ).toEqual({ raw_text: "laksa", attendee_ids: [ME] });
  });

  it("sends a photo-only meal without text", () => {
    expect(
      buildMealPayload({ text: " ", attendeeIds: [ME], ratings: {} }, { photoPath: PHOTO, mealType: "lunch" }),
    ).toEqual({ photo_path: PHOTO, meal_type: "lunch", attendee_ids: [ME] });
  });

  it("keeps ratings only for people still selected, in attendee order", () => {
    const payload = buildMealPayload(
      { text: "laksa", attendeeIds: [JANE, ME], ratings: { [ME]: 4, [JANE]: 5, [MARK]: 3 } },
      { mealType: "dinner" },
    );
    expect(payload.ratings).toEqual([
      { person_id: JANE, score: 5 },
      { person_id: ME, score: 4 },
    ]);
  });

  it("drops cleared ratings", () => {
    const payload = buildMealPayload(
      { text: "laksa", attendeeIds: [ME], ratings: { [ME]: undefined } },
      {},
    );
    expect(payload).not.toHaveProperty("ratings");
  });

  it("produces a body the API schema accepts", () => {
    const payload = buildMealPayload(
      { text: "laksa w/ Jane", attendeeIds: [ME, JANE], ratings: { [ME]: 4 } },
      { photoPath: PHOTO, mealType: "dinner" },
    );
    expect(createMealSchema.safeParse(payload).success).toBe(true);
  });
});

describe("saveErrorMessage", () => {
  it.each([
    [401, /signed out/],
    [400, /couldn't be saved/],
    [500, /Try again/],
  ])("explains a %d", (status, pattern) => {
    expect(saveErrorMessage(status)).toMatch(pattern);
  });
});
