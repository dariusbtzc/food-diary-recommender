import Anthropic from "npm:@anthropic-ai/sdk@1.10.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@1.10.0/helpers/zod";
import { config } from "./config.ts";
import { buildUserContent, SYSTEM_PROMPT } from "./prompt.ts";
import { type MealParse, mealParseSchema } from "./schema.ts";

// The JSON schema sent to the API. zodOutputFormat moves the constraints the
// API can't enforce (numeric ranges, lengths, patterns) into descriptions; the
// full Zod schema is applied to the answer below.
//
// messages.create, not messages.parse: parse throws on an invalid answer and
// the usage is lost with it, but every call has to be written to llm_usage.
const OUTPUT_FORMAT = {
  type: "json_schema" as const,
  schema: zodOutputFormat(mealParseSchema).schema,
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export type ModelResult =
  | { kind: "ok"; parse: MealParse; usage: Usage }
  // Retryable: cut off at max_tokens, not JSON, or not valid against the schema.
  | { kind: "invalid"; reason: string; usage: Usage }
  // Not retryable: the same request would be declined again.
  | { kind: "refused"; category: string | null; usage: Usage };

export interface ModelInput {
  note: string | null;
  firstNames: string[];
  photoBase64: string | null;
}

export function createAnthropicClient(apiKey: string): Anthropic {
  // A run has 150 s of wall clock; two SDK retries fit inside that.
  return new Anthropic({ apiKey, timeout: 40_000, maxRetries: 2 });
}

export async function callModel(client: Anthropic, input: ModelInput): Promise<ModelResult> {
  const response = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    thinking: { type: "disabled" },
    output_config: { effort: config.effort, format: OUTPUT_FORMAT },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: buildUserContent(input) }],
  });

  // llm_usage has one input column: record everything the call read,
  // including cache writes and reads.
  const usage: Usage = {
    inputTokens: response.usage.input_tokens +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
  };

  if (response.stop_reason === "refusal") {
    return { kind: "refused", category: response.stop_details?.category ?? null, usage };
  }
  if (response.stop_reason === "max_tokens") {
    return { kind: "invalid", reason: "stopped at max_tokens", usage };
  }

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "invalid", reason: "answer is not JSON", usage };
  }

  const result = mealParseSchema.safeParse(json);
  if (!result.success) {
    const where = result.error.issues.map((i) => i.path.join(".") || "(root)").join(", ");
    return { kind: "invalid", reason: `schema mismatch at ${where}`, usage };
  }
  return { kind: "ok", parse: result.data, usage };
}

// How a thrown API error is handled by the worker.
//   retry:  rate limit, overload, server or network error; the message
//           reappears after the visibility timeout and uses an attempt.
//   fail:   the request itself is bad (400, 404, 413, 422); retrying returns
//           the same error, so the meal is marked failed at once.
//   config: the key is missing, wrong or not allowed (401, 403); no meal is at
//           fault, so the message waits without using an attempt.
export type ErrorAction = "retry" | "fail" | "config";

export function classifyError(error: unknown): ErrorAction {
  if (error instanceof Anthropic.AuthenticationError) return "config";
  if (error instanceof Anthropic.PermissionDeniedError) return "config";
  if (error instanceof Anthropic.RateLimitError) return "retry";
  if (error instanceof Anthropic.APIConnectionError) return "retry";
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    if (status === 408 || status === 409 || status >= 500) return "retry";
    if (status >= 400) return "fail";
  }
  return "retry";
}
