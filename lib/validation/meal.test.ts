import { describe, expect, it } from "vitest";

import { createMealSchema, MAX_ATTENDEES, MAX_RAW_TEXT_LENGTH } from "./meal";

const ME = "a1000000-0000-4000-8000-000000000001";
const JANE = "a1000000-0000-4000-8000-000000000002";
const PHOTO = "a0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-000000000001.jpg";

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `a1000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("createMealSchema", () => {
  it("accepts a text-only meal and defaults ratings to none", () => {
    const meal = createMealSchema.parse({ raw_text: "  laksa w/ Jane  ", attendee_ids: [ME, JANE] });
    expect(meal).toEqual({ raw_text: "laksa w/ Jane", attendee_ids: [ME, JANE], ratings: [] });
  });

  it("accepts a photo-only meal", () => {
    expect(createMealSchema.safeParse({ photo_path: PHOTO, attendee_ids: [ME] }).success).toBe(true);
  });

  it("accepts text, photo, meal type and ratings together", () => {
    const result = createMealSchema.safeParse({
      raw_text: "laksa",
      photo_path: PHOTO,
      meal_type: "dinner",
      attendee_ids: [ME, JANE],
      ratings: [
        { person_id: ME, score: 4 },
        { person_id: JANE, score: 5 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("treats blank text as missing", () => {
    expect(createMealSchema.safeParse({ raw_text: "   ", attendee_ids: [ME] }).success).toBe(false);
    expect(createMealSchema.parse({ raw_text: " ", photo_path: PHOTO, attendee_ids: [ME] }).raw_text)
      .toBeUndefined();
  });

  it("needs text or a photo", () => {
    expect(createMealSchema.safeParse({ attendee_ids: [ME] }).success).toBe(false);
  });

  it(`caps text at ${MAX_RAW_TEXT_LENGTH} characters`, () => {
    const ok = "a".repeat(MAX_RAW_TEXT_LENGTH);
    expect(createMealSchema.safeParse({ raw_text: ok, attendee_ids: [ME] }).success).toBe(true);
    expect(createMealSchema.safeParse({ raw_text: `${ok}a`, attendee_ids: [ME] }).success).toBe(false);
  });

  it.each([
    "not-a-path",
    "c0000000-0000-4000-8000-000000000001.jpg",
    "a0000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-000000000001.png",
    "a0000000-0000-4000-8000-00000000000a/../c0000000-0000-4000-8000-000000000001.jpg",
  ])("rejects photo path %j", (photo_path) => {
    expect(createMealSchema.safeParse({ photo_path, attendee_ids: [ME] }).success).toBe(false);
  });

  it(`needs 1 to ${MAX_ATTENDEES} unique attendees`, () => {
    const base = { raw_text: "laksa" };
    expect(createMealSchema.safeParse({ ...base, attendee_ids: [] }).success).toBe(false);
    expect(createMealSchema.safeParse({ ...base, attendee_ids: ids(MAX_ATTENDEES) }).success).toBe(true);
    expect(createMealSchema.safeParse({ ...base, attendee_ids: ids(MAX_ATTENDEES + 1) }).success).toBe(false);
    expect(createMealSchema.safeParse({ ...base, attendee_ids: [ME, ME] }).success).toBe(false);
    expect(createMealSchema.safeParse({ ...base, attendee_ids: ["not-a-uuid"] }).success).toBe(false);
  });

  it.each([0, 6, 3.5])("rejects a score of %d", (score) => {
    const result = createMealSchema.safeParse({
      raw_text: "laksa",
      attendee_ids: [ME],
      ratings: [{ person_id: ME, score }],
    });
    expect(result.success).toBe(false);
  });

  it("only lets attendees be rated, once each", () => {
    const base = { raw_text: "laksa", attendee_ids: [ME] };
    expect(createMealSchema.safeParse({ ...base, ratings: [{ person_id: JANE, score: 4 }] }).success).toBe(false);
    expect(
      createMealSchema.safeParse({
        ...base,
        ratings: [
          { person_id: ME, score: 4 },
          { person_id: ME, score: 5 },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown meal type", () => {
    expect(createMealSchema.safeParse({ raw_text: "x", attendee_ids: [ME], meal_type: "brunch" }).success).toBe(false);
  });

  it.each(["owner_id", "parse_status", "source", "eaten_at"])("rejects the server-owned field %s", (key) => {
    expect(createMealSchema.safeParse({ raw_text: "x", attendee_ids: [ME], [key]: "x" }).success).toBe(false);
  });
});
