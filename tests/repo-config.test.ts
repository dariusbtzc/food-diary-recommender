import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

describe("security", () => {
  const migrationsDir = "supabase/migrations";
  const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  // Strip comments so commented-out SQL can't satisfy or trip the check.
  const sqlOf = (file: string) =>
    readFileSync(`${migrationsDir}/${file}`, "utf8")
      .replace(/--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .toLowerCase();

  const tableName = (raw: string) => raw.replace(/"/g, "").replace(/^public\./, "");

  it.each(migrations)("%s enables RLS on every table it creates", (file) => {
    const sql = sqlOf(file);
    const created = [
      ...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/g),
    ].map((m) => tableName(m[1]));
    const secured = new Set(
      [
        ...sql.matchAll(/alter\s+table\s+(?:only\s+)?([\w."]+)\s+enable\s+row\s+level\s+security/g),
      ].map((m) => tableName(m[1])),
    );

    expect(created.filter((t) => !secured.has(t))).toEqual([]);
  });
});

describe("PWA", () => {
  const manifest = readJson("public/manifest.webmanifest");

  it("has the manifest fields needed to install", () => {
    expect(manifest).toMatchObject({
      name: expect.any(String),
      short_name: expect.any(String),
      start_url: "/",
      display: "standalone",
    });
  });

  it("lists 192 and 512 px icons, plus a maskable one, that exist in public/", () => {
    const icons: { src: string; sizes: string; purpose?: string }[] = manifest.icons;
    const sizes = icons.map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) expect(existsSync(`public${icon.src}`)).toBe(true);
  });

  it("serves the service worker from the site root", () => {
    expect(existsSync("public/sw.js")).toBe(true);
  });

  it("keeps the manifest and service worker out of the auth proxy", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toContain("manifest.webmanifest");
    expect(proxy).toContain("sw.js");
  });
});
