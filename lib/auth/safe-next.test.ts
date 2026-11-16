import { describe, expect, it } from "vitest";

import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/diary", "/diary"],
    ["/people?tab=all", "/people?tab=all"],
    ["/diary#today", "/diary#today"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "diary",
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example",
    "/\tevil",
    "/%0a/evil",
    "javascript:alert(1)",
  ])("falls back to / for %j", (input) => {
    const result = safeNextPath(input);
    expect(result.startsWith("/")).toBe(true);
    expect(result.startsWith("//")).toBe(false);
    expect(new URL(result, "http://app.test").origin).toBe("http://app.test");
  });

  it("rejects protocol-relative and absolute URLs outright", () => {
    expect(safeNextPath("//evil.example/x")).toBe("/");
    expect(safeNextPath("https://evil.example/x")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });

  it("does not send the user back into the auth flow", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/auth/callback?code=x")).toBe("/");
  });
});
