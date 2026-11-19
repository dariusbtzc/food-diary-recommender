// Golden set for the parse prompt: `npm run test:prompt`.
//
// Runs the worker's own prompt, schema and model call (model.ts) on every case
// in golden/cases.json against the real API and prints a match table. Needs
// ANTHROPIC_API_KEY (read by Deno from supabase/functions/.env). About USD 0.01
// a run. It writes nothing to the database, so it doesn't count toward the
// daily parse limit. index.ts never imports this file.
//
// A case passes when: (confidence >= threshold) equals expect_done, the place
// matches one of place_any_of (or is null when that list is empty), the dish
// count matches, and the cost matches (to the cent, or both null).
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { z } from "npm:zod@4";
import { config } from "./config.ts";
import { callModel, createAnthropicClient } from "./model.ts";
import { normalizePlaceName } from "./parse.ts";
import { PROMPT_VERSION } from "./prompt.ts";

const GOLDEN_DIR = new URL("./golden/", import.meta.url);

const caseSchema = z.object({
  id: z.string(),
  note: z.string().nullable(),
  photo: z.string().optional(),
  names: z.array(z.string()),
  place_any_of: z.array(z.string()),
  dish_count: z.number().int().min(1),
  cost: z.number().nullable(),
  expect_done: z.boolean(),
  todo: z.string().optional(),
});
type GoldenCase = z.infer<typeof caseSchema>;

interface Row {
  id: string;
  confidence: string;
  place: string;
  dishes: string;
  cost: string;
  pass: boolean;
  detail: string;
}

const mark = (ok: boolean) => (ok ? "ok" : "MISS");

async function runCase(client: ReturnType<typeof createAnthropicClient>, c: GoldenCase): Promise<Row> {
  const photoBase64 = c.photo
    ? encodeBase64(await Deno.readFile(new URL(c.photo, GOLDEN_DIR)))
    : null;
  const result = await callModel(client, { note: c.note, firstNames: c.names, photoBase64 });
  if (result.kind !== "ok") {
    const why = result.kind === "refused" ? `refused (${result.category})` : result.reason;
    return { id: c.id, confidence: "-", place: "-", dishes: "-", cost: "-", pass: false, detail: why };
  }
  const p = result.parse;
  const done = p.confidence >= config.doneThreshold;
  const placeOk = c.place_any_of.length === 0
    ? p.place_name === null
    : p.place_name !== null &&
      c.place_any_of.some((n) => normalizePlaceName(n) === normalizePlaceName(p.place_name!));
  const dishesOk = p.dishes.length === c.dish_count;
  const costOk = c.cost === null
    ? p.total_cost_sgd === null
    : p.total_cost_sgd !== null && Math.abs(p.total_cost_sgd - c.cost) < 0.005;
  const confidenceOk = done === c.expect_done;
  return {
    id: c.id,
    confidence: `${mark(confidenceOk)} ${p.confidence.toFixed(2)}`,
    place: `${mark(placeOk)} ${p.place_name ?? "null"}`,
    dishes: `${mark(dishesOk)} ${p.dishes.length}`,
    cost: `${mark(costOk)} ${p.total_cost_sgd ?? "null"}`,
    pass: confidenceOk && placeOk && dishesOk && costOk,
    detail: p.dishes.map((d) => `${d.name} (${d.cuisine ?? "-"})`).join("; "),
  };
}

async function main() {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set (expected in supabase/functions/.env)");
    Deno.exit(1);
  }
  const file = JSON.parse(await Deno.readTextFile(new URL("cases.json", GOLDEN_DIR)));
  const cases = z.array(caseSchema).parse(file.cases);
  const ready = cases.filter((c) => !c.todo);
  const skipped = cases.filter((c) => c.todo);

  const client = createAnthropicClient(apiKey);
  // One at a time: the first call writes the prompt cache, later ones read it.
  const rows: Row[] = [];
  for (const c of ready) {
    try {
      rows.push(await runCase(client, c));
    } catch (error) {
      rows.push({
        id: c.id, confidence: "-", place: "-", dishes: "-", cost: "-", pass: false,
        detail: `error: ${error}`,
      });
    }
  }

  console.log(`\nPrompt ${PROMPT_VERSION}, model ${config.model}\n`);
  console.table(rows.map(({ detail: _detail, ...r }) => ({ ...r, pass: r.pass ? "PASS" : "FAIL" })));
  for (const r of rows.filter((r) => !r.pass)) console.log(`FAIL ${r.id}: ${r.detail}`);

  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const pct = (n: number) => `${n}/${rows.length} (${Math.round((100 * n) / Math.max(rows.length, 1))}%)`;
  console.log(`
Cases run:          ${rows.length}
Pass (all four):    ${pct(count((r) => r.pass))}
Confidence as set:  ${pct(count((r) => r.confidence.startsWith("ok")))}
Place match:        ${pct(count((r) => r.place.startsWith("ok")))}
Dish count match:   ${pct(count((r) => r.dishes.startsWith("ok")))}
Cost match:         ${pct(count((r) => r.cost.startsWith("ok")))}
Skipped (todo):     ${skipped.length}${skipped.length ? ` - ${skipped.map((c) => c.id).join(", ")}` : ""}`);
}

if (import.meta.main) await main();
