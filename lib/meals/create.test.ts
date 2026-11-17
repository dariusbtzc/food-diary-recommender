import { describe, expect, it } from "vitest";

import { classifyCreateMealError, isOwnPhotoPath, toCreateMealArgs } from "./create";

const USER = "a0000000-0000-4000-8000-00000000000a";
const OTHER = "b0000000-0000-4000-8000-00000000000b";
const PHOTO = "c0000000-0000-4000-8000-000000000001.jpg";

describe("isOwnPhotoPath", () => {
  it("accepts a path in the caller's folder", () => {
    expect(isOwnPhotoPath(`${USER}/${PHOTO}`, USER)).toBe(true);
  });

  it("ignores case", () => {
    expect(isOwnPhotoPath(`${USER.toUpperCase()}/${PHOTO}`, USER)).toBe(true);
  });

  it("rejects another user's folder", () => {
    expect(isOwnPhotoPath(`${OTHER}/${PHOTO}`, USER)).toBe(false);
  });

  it("rejects a folder that only starts with the caller's id", () => {
    expect(isOwnPhotoPath(`${USER}x/${PHOTO}`, USER)).toBe(false);
  });
});

describe("toCreateMealArgs", () => {
  it("maps the validated meal to the RPC's parameters", () => {
    expect(
      toCreateMealArgs({
        raw_text: "laksa",
        photo_path: undefined,
        meal_type: "dinner",
        attendee_ids: [USER],
        ratings: [{ person_id: USER, score: 4 }],
      }),
    ).toEqual({
      p_attendee_ids: [USER],
      p_raw_text: "laksa",
      p_photo_path: undefined,
      p_meal_type: "dinner",
      p_ratings: [{ person_id: USER, score: 4 }],
    });
  });
});

describe("classifyCreateMealError", () => {
  it.each(["42501", "23503"])("maps %s to invalid_attendees", (code) => {
    expect(classifyCreateMealError(code)).toEqual({ status: 400, error: "invalid_attendees" });
  });

  it.each(["23514", "22023", "22P02"])("maps %s to invalid_input", (code) => {
    expect(classifyCreateMealError(code)).toEqual({ status: 400, error: "invalid_input" });
  });

  it.each([undefined, "08006", "XX000"])("maps %s to a 500", (code) => {
    expect(classifyCreateMealError(code)).toEqual({ status: 500, error: "create_failed" });
  });
});
