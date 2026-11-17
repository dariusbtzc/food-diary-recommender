import { describe, expect, it } from "vitest";

import { mealTypeAt, quickLogHeading } from "./meal-type";

// Singapore is UTC+8 with no DST, so SG hh:mm = UTC (hh-8):mm.
const sg = (hhmm: string) => new Date(`2026-10-27T${hhmm}:00+08:00`);

describe("mealTypeAt", () => {
  it.each([
    ["00:00", "supper"],
    ["04:59", "supper"],
    ["05:00", "breakfast"],
    ["10:59", "breakfast"],
    ["11:00", "lunch"],
    ["14:59", "lunch"],
    ["15:00", "snack"],
    ["17:29", "snack"],
    ["17:30", "dinner"],
    ["21:59", "dinner"],
    ["22:00", "supper"],
    ["23:59", "supper"],
  ])("%s in Singapore is %s", (time, type) => {
    expect(mealTypeAt(sg(time))).toBe(type);
  });

  it("uses Singapore time, not UTC", () => {
    // 12:00 UTC is 20:00 in Singapore.
    expect(mealTypeAt(new Date("2026-10-27T12:00:00Z"))).toBe("dinner");
  });
});

describe("quickLogHeading", () => {
  it("formats the date and meal type like the design", () => {
    expect(quickLogHeading(sg("19:40"))).toBe("Tue 27 Oct · Dinner");
  });

  it("uses the Singapore date after midnight UTC+8", () => {
    // 17:00 UTC on the 27th is 01:00 on the 28th in Singapore.
    expect(quickLogHeading(new Date("2026-10-27T17:00:00Z"))).toBe("Wed 28 Oct · Supper");
  });
});
