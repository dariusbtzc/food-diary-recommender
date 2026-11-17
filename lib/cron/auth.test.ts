import { describe, expect, it } from "vitest";

import { isAuthorizedCron } from "./auth";

const SECRET = "s3cret-value-for-tests";

describe("isAuthorizedCron", () => {
  it("accepts the exact Bearer header", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
  });

  it("rejects a wrong secret of the same length", () => {
    const wrong = SECRET.replace(/.$/, "X");
    expect(isAuthorizedCron(`Bearer ${wrong}`, SECRET)).toBe(false);
  });

  it("rejects a different length, a bare secret and another scheme", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
    expect(isAuthorizedCron(`Basic ${SECRET}`, SECRET)).toBe(false);
    expect(isAuthorizedCron(`bearer ${SECRET}`, SECRET)).toBe(false);
  });

  it("refuses everything when the secret is unset or empty", () => {
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron(null, undefined)).toBe(false);
  });

  it("rejects an oversized header", () => {
    expect(isAuthorizedCron(`Bearer ${"a".repeat(2000)}`, SECRET)).toBe(false);
  });
});
