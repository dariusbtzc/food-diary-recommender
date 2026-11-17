import { describe, expect, it } from "vitest";

import { activeTab } from "./tabs";

describe("activeTab", () => {
  it.each([
    ["/", "log"],
    ["/diary", "diary"],
    ["/diary/abc", "diary"],
    ["/recommend", "recommend"],
    ["/recommend/results", "recommend"],
    ["/people", "people"],
    ["/people/123", "people"],
  ])("%s → %s", (pathname, tab) => {
    expect(activeTab(pathname)).toBe(tab);
  });

  it.each(["/diaryx", "/peoples", "/login", "/settings"])(
    "%s has no active tab",
    (pathname) => {
      expect(activeTab(pathname)).toBeNull();
    },
  );
});
