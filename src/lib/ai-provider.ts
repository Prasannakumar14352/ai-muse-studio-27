/**
 * Text-AI provider switch. The app was built against Lovable's AI gateway,
 * which only works on Lovable hosting. Every chat-completion call now goes
 * through aiChatFetch(), which picks a provider from the environment:
 *
 *   1. OPENROUTER_API_KEY  → https://openrouter.ai (OpenAI-compatible, same model ids)
 *   2. LOVABLE_API_KEY     → Lovable AI gateway (only when hosted on Lovable)
 *
 * Only reads process.env inside functions, so importing this from a
 * *.functions.ts module is safe for the client bundle.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const LOVABLE_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * Models swapped before sending. GPT-5.5 costs ~$5/$30 per 1M tokens, far
 * above what the 1–2 credits charged for those actions bring in, so it is
 * routed to Gemini Flash by default. Override with AI_MODEL_MAP, e.g.
 * AI_MODEL_MAP='{"openai/gpt-5.5":"openai/gpt-5.5"}' to keep GPT-5.5.
 */
const DEFAULT_MODEL_MAP: Record<string, string> = {
  "openai/gpt-5.5": "google/gemini-2.5-flash",
};

function modelMap(): Record<string, string> {
  try {
    const raw = process.env.AI_MODEL_MAP;
    return raw ? { ...DEFAULT_MODEL_MAP, ...(JSON.parse(raw) as Record<string, string>) } : DEFAULT_MODEL_MAP;
  } catch {
    return DEFAULT_MODEL_MAP;
  }
}

type Provider = { name: "openrouter" | "lovable"; url: string; key: string };

function provider(): Provider | null {
  const or = process.env.OPENROUTER_API_KEY;
  if (or) return { name: "openrouter", url: OPENROUTER_URL, key: or };
  const lv = process.env.LOVABLE_API_KEY;
  if (lv) return { name: "lovable", url: LOVABLE_URL, key: lv };
  return null;
}

/** The configured key, or undefined. Call sites use this for their "is AI configured" check. */
export function aiKey(): string | undefined {
  return provider()?.key;
}

export const AI_NOT_CONFIGURED = "AI is not configured: add OPENROUTER_API_KEY in your hosting settings.";

/**
 * Drop-in replacement for fetch("https://ai.gateway.lovable.dev/v1/chat/completions", init).
 * Sets the right URL and Authorization header and maps model ids.
 */
export async function aiChatFetch(init: RequestInit): Promise<Response> {
  const p = provider();
  if (!p) throw new Error(AI_NOT_CONFIGURED);

  let body = init.body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as { model?: string };
      const map = modelMap();
      if (parsed.model && map[parsed.model]) parsed.model = map[parsed.model];
      body = JSON.stringify(parsed);
    } catch {
      /* not JSON — send as is */
    }
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${p.key}`);
  headers.set("Content-Type", "application/json");
  if (p.name === "openrouter") {
    headers.set("HTTP-Referer", process.env.APP_URL || "https://creatorflowai.prodxstore.com");
    headers.set("X-Title", "CreatorFlow AI");
  }
  return fetch(p.url, { ...init, method: init.method ?? "POST", headers, body });
}
