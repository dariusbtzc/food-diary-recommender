import { describe, expect, it } from "vitest";

import { magicLinkSchema } from "./auth";

describe("magicLinkSchema", () => {
  it("trims and lower-cases the email", () => {
    const parsed = magicLinkSchema.parse({ email: "  Me@Example.TEST " });
    expect(parsed.email).toBe("me@example.test");
  });

  it("keeps an optional next path", () => {
    expect(magicLinkSchema.parse({ email: "me@example.test", next: "/diary" }).next).toBe(
      "/diary",
    );
  });

  it.each(["", "not-an-email", "a@", `${"a".repeat(250)}@example.test`])(
    "rejects %j",
    (email) => {
      expect(magicLinkSchema.safeParse({ email }).success).toBe(false);
    },
  );
});
