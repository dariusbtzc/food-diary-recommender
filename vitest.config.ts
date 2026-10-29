import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    // supabase/functions is Deno; it never runs under Node's test runner.
    exclude: ["node_modules/**", ".next/**", "supabase/**"],
  },
});
