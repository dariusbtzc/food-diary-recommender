import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards for the repo rules in CLAUDE.md that live in config, not code.

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isGitIgnored(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", path]);
    return true;
  } catch {
    return false;
  }
}

describe("runtime boundary", () => {
  it("keeps the Deno functions out of the Next.js type-check", () => {
    expect(readJson("tsconfig.json").exclude).toContain("supabase");
  });
});

describe("secrets", () => {
  it("ignores env files but commits .env.example", () => {
    expect(isGitIgnored(".env")).toBe(true);
    expect(isGitIgnored(".env.local")).toBe(true);
    expect(isGitIgnored("supabase/functions/.env")).toBe(true);
    expect(isGitIgnored(".env.example")).toBe(false);
  });

  it("never exposes a secret through a NEXT_PUBLIC_ variable", () => {
    const publicNames = readFileSync(".env.example", "utf8")
      .split("\n")
      .map((line) => line.split("=")[0].trim())
      .filter((name) => name.startsWith("NEXT_PUBLIC_"));

    expect(publicNames).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  });

  it("denies Claude Code reads of env files", () => {
    const deny: string[] = readJson(".claude/settings.json").permissions.deny;
    expect(deny).toEqual(
      expect.arrayContaining([
        "Read(./.env)",
        "Read(./.env.local)",
        "Read(./.env.*.local)",
        "Read(./supabase/**/.env)",
      ]),
    );
    expect(deny).not.toContain("Read(./.env*)");
  });
});
