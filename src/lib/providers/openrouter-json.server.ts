/**
 * One JSON-mode chat completion through aiChatFetch (OpenRouter). Server-only.
 *
 * This is ONLY the transport: no auth, no plan check, no credit charging, no
 * budget. Callers reserve spend first (Promo Studio: withSpend in
 * src/lib/promo-studio/budget.server.ts). Never import it from a route
 * component, a component, or an unguarded *.functions.ts module.
 *
 * Returns the parsed JSON as `unknown`: callers validate it with zod.
 */
import { aiChatFetch, aiKey, AI_NOT_CONFIGURED } from "@/lib/ai-provider";

export type OpenrouterJsonOptions = {
  model: string;
  system: string;
  user: string;
  /** Hard bound on completion tokens; it is what makes worst-case estimates safe. */
  maxTokens: number;
  temperature?: number;
  /** Default 25 s (design §6.1). */
  timeoutMs?: number;
  /** Reasoning control. Default turns Gemini thinking off: { max_tokens: 0 }. */
  reasoning?: Record<string, unknown>;
};

export type OpenrouterUsage = {
  /** Exact cost reported by OpenRouter (usage.include), or null when absent. */
  costUsd: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
};

export type OpenrouterJsonResult = {
  data: unknown;
  usage: OpenrouterUsage;
  requestId: string | null;
  model: string;
};

/**
 * Provider failure. `retryable` is true for network errors, timeouts, 429 and 5xx.
 * Carries usage when the provider billed the call (e.g. it answered with invalid JSON),
 * so the caller can still record the actual cost.
 */
export class OpenrouterError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly usage: OpenrouterUsage | null;
  readonly requestId: string | null;
  constructor(
    message: string,
    opts: { status?: number | null; retryable: boolean; usage?: OpenrouterUsage | null; requestId?: string | null },
  ) {
    super(message);
    this.name = "OpenrouterError";
    this.status = opts.status ?? null;
    this.retryable = opts.retryable;
    this.usage = opts.usage ?? null;
    this.requestId = opts.requestId ?? null;
  }
}

type ChatBody = {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function openrouterJson(opts: OpenrouterJsonOptions): Promise<OpenrouterJsonResult> {
  if (!aiKey()) throw new OpenrouterError(AI_NOT_CONFIGURED, { retryable: false });

  let res: Response;
  try {
    res = await aiChatFetch({
      method: "POST",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        response_format: { type: "json_object" },
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens,
        usage: { include: true },
        reasoning: opts.reasoning ?? { max_tokens: 0 },
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new OpenrouterError(`AI request failed: ${msg}`.slice(0, 300), { retryable: true });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenrouterError(`AI ${res.status}: ${text.slice(0, 200)}`, {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
    });
  }

  const body = (await res.json().catch(() => ({}))) as ChatBody;
  const u = body.usage ?? {};
  const usage: OpenrouterUsage = {
    costUsd: num(u.cost),
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    reasoningTokens: num(u.completion_tokens_details?.reasoning_tokens),
  };
  const requestId = typeof body.id === "string" ? body.id : null;
  const raw = body.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new OpenrouterError("AI returned invalid JSON", { status: res.status, retryable: false, usage, requestId });
  }
  return { data, usage, requestId, model: typeof body.model === "string" ? body.model : opts.model };
}
