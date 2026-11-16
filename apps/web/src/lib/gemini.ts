// Gemini Interactions API through Cloudflare AI Gateway, called with the Workers AI binding.
// Binding calls are pre-authenticated and use the Google key stored in the gateway (BYOK), so no token or key lives here.
// GEMINI_API_KEY is only a fallback for local development without the binding.
export interface GeminiEnv {
  AI?: Ai;
  AI_GATEWAY_ID: string;
  GEMINI_MODEL: string;
  GEMINI_API_KEY?: string;
}

export type ContentItem = { type: "text"; text: string } | { type: "document"; data: string; mime_type: string };

export interface GeminiResult<T> {
  data: T;
  raw: unknown;
  input_tokens: number | null;
  output_tokens: number | null;
}

export function geminiConfigured(env: GeminiEnv): boolean {
  return Boolean(env.AI || env.GEMINI_API_KEY);
}

export class GeminiParseError extends Error {
  constructor(message: string, public input_tokens: number, public output_tokens: number) {
    super(message);
  }
}

export async function generateJson<T>(env: GeminiEnv, opts: { system: string; input: ContentItem[]; schema: Record<string, unknown>; thinking?: "low" | "medium" | "high" }): Promise<GeminiResult<T>> {
  const body = {
    model: env.GEMINI_MODEL,
    input: opts.input,
    system_instruction: opts.system,
    generation_config: { thinking_level: opts.thinking ?? "medium", temperature: 0.2 },
    response_format: { type: "text", mime_type: "application/json", schema: opts.schema },
    store: false,
  };
  let res: Response;
  if (env.AI) {
    res = await env.AI.gateway(env.AI_GATEWAY_ID).run({
      provider: "google-ai-studio",
      endpoint: "v1beta/interactions",
      headers: { "content-type": "application/json" },
      query: body,
    });
  } else if (env.GEMINI_API_KEY) {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
  } else {
    throw new Error("No model access: AI binding missing and GEMINI_API_KEY not set");
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${text.slice(0, 500)}`);
  const raw = JSON.parse(text) as {
    status?: string;
    steps?: { type: string; content?: { type: string; text?: string }[] }[];
    usage?: Record<string, number>;
  };
  const outputs = (raw.steps ?? []).filter((s) => s.type === "model_output");
  const outText = (outputs.at(-1)?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  if (!outText) throw new Error(`Gemini returned no text (status ${raw.status ?? "unknown"}): ${text.slice(0, 300)}`);
  const usage = raw.usage ?? {};
  // Interactions API usage fields: total_input_tokens, total_output_tokens, total_thought_tokens (billed as output).
  // When the response carries no usage, estimate at 4 characters per token so the budget never undercounts.
  const inputTokens = usage.total_input_tokens ?? usage.input_tokens ?? Math.ceil(JSON.stringify(body).length / 4);
  const outputTokens = usage.total_output_tokens !== undefined ? usage.total_output_tokens + (usage.total_thought_tokens ?? 0) : (usage.output_tokens ?? Math.ceil(outText.length / 4));
  let data: T;
  try {
    data = JSON.parse(outText) as T;
  } catch {
    // Usage is still owed for an unparseable answer; the caller records it from the error.
    throw new GeminiParseError(`Gemini returned invalid JSON: ${outText.slice(0, 200)}`, inputTokens, outputTokens);
  }
  return { data, raw, input_tokens: inputTokens, output_tokens: outputTokens };
}
