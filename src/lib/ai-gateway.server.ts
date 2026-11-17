// Small helper for calling Lovable AI Gateway with JSON output.
// Kept server-only. Do NOT import from client-safe modules at module scope.

import { aiChatFetch, aiKey, AI_NOT_CONFIGURED } from "@/lib/ai-provider";
export type GatewayMessage = { role: "system" | "user" | "assistant"; content: string };

export async function gatewayChatJson<T = unknown>(opts: {
  messages: GatewayMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const key = aiKey();
  if (!key) throw new Error(AI_NOT_CONFIGURED);
  const res = await aiChatFetch({
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-2.5-flash",
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4000,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 400)}`);
  }
  const body = await res.json();
  const raw = body?.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as T;
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("AI Gateway returned non-JSON response");
  }
}

export async function gatewayChatText(opts: {
  messages: GatewayMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const key = aiKey();
  if (!key) throw new Error(AI_NOT_CONFIGURED);
  const res = await aiChatFetch({
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-2.5-flash",
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2000,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 400)}`);
  }
  const body = await res.json();
  return String(body?.choices?.[0]?.message?.content ?? "");
}
