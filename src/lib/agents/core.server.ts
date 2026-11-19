// Shared plumbing for CreatorFlow's own agents (Agent HQ): settings, the
// Telegram Bot API, the monthly AI budget, run logging and admin alerts.
// Server-only. Tables are service-role only (see 20261118200000_agent_hq.sql).

import { aiChatFetch, aiKey } from "@/lib/ai-provider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type AgentSettings = {
  telegram_enabled: boolean;
  telegram_bot_token_cipher: string | null;
  telegram_bot_token_iv: string | null;
  telegram_bot_username: string | null;
  telegram_webhook_secret: string | null;
  telegram_group_ids: number[];
  auto_reply: boolean;
  reply_in_group: boolean;
  monthly_budget_usd: number;
  scheduled_agents_enabled: boolean;
  buyers_group_invite_url: string | null;
};

export async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getAgentSettings(db?: Admin): Promise<AgentSettings> {
  const a = db ?? (await admin());
  const { data } = await a.from("agent_settings").select("*").eq("id", 1).maybeSingle();
  return {
    telegram_enabled: Boolean(data?.telegram_enabled),
    telegram_bot_token_cipher: data?.telegram_bot_token_cipher ?? null,
    telegram_bot_token_iv: data?.telegram_bot_token_iv ?? null,
    telegram_bot_username: data?.telegram_bot_username ?? null,
    telegram_webhook_secret: data?.telegram_webhook_secret ?? null,
    telegram_group_ids: ((data?.telegram_group_ids ?? []) as Array<number | string>).map(Number),
    auto_reply: data?.auto_reply ?? true,
    reply_in_group: data?.reply_in_group ?? true,
    monthly_budget_usd: Number(data?.monthly_budget_usd ?? 10),
    scheduled_agents_enabled: data?.scheduled_agents_enabled ?? true,
    buyers_group_invite_url: (data as { buyers_group_invite_url?: string | null } | null)?.buyers_group_invite_url ?? null,
  };
}

// ---------- Telegram ----------

export async function botToken(s: AgentSettings): Promise<string | null> {
  if (!s.telegram_bot_token_cipher || !s.telegram_bot_token_iv) return null;
  const { decryptSecret } = await import("@/lib/oauth-crypto.server");
  return decryptSecret(s.telegram_bot_token_cipher, s.telegram_bot_token_iv);
}

export async function tg<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? res.status}`);
  return j.result as T;
}

/** Send a message; long texts are split at Telegram's 4096-char limit. */
export async function tgSend(token: string, chatId: number, text: string, replyTo?: number): Promise<number | null> {
  let lastId: number | null = null;
  const parts = text.match(/[\s\S]{1,3900}(?=\s|$)|[\s\S]{1,3900}/g) ?? [text];
  for (let i = 0; i < parts.length; i++) {
    const r = await tg<{ message_id: number }>(token, "sendMessage", {
      chat_id: chatId,
      text: parts[i],
      ...(i === 0 && replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
      link_preview_options: { is_disabled: true },
    });
    lastId = r.message_id;
  }
  return lastId;
}

/** DM every admin who has linked their Telegram (approvals, alerts, reports). */
export async function alertAdmins(text: string, db?: Admin): Promise<number> {
  const a = db ?? (await admin());
  const s = await getAgentSettings(a);
  const token = await botToken(s);
  if (!token) return 0;
  const { data: admins } = await a.from("profiles").select("id").eq("is_admin", true);
  const ids = (admins ?? []).map((r: { id: string }) => r.id);
  if (!ids.length) return 0;
  const { data: links } = await a.from("telegram_links").select("telegram_user_id").in("user_id", ids);
  let sent = 0;
  for (const l of links ?? []) {
    try { await tgSend(token, Number(l.telegram_user_id), text); sent += 1; } catch { /* admin hasn't started the bot */ }
  }
  return sent;
}

// ---------- Budget + run log ----------

export async function spentThisMonthUsd(db?: Admin): Promise<number> {
  const a = db ?? (await admin());
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { data } = await a.from("agent_runs").select("cost_usd").gte("created_at", start.toISOString());
  return (data ?? []).reduce((s: number, r: { cost_usd: number | string }) => s + Number(r.cost_usd || 0), 0);
}

export async function withinBudget(db?: Admin): Promise<boolean> {
  const a = db ?? (await admin());
  const [s, spent] = await Promise.all([getAgentSettings(a), spentThisMonthUsd(a)]);
  return spent < s.monthly_budget_usd;
}

export async function logRun(entry: {
  agent: string; trigger: string; summary: string; output?: unknown; ok?: boolean; error?: string | null; cost_usd?: number;
}, db?: Admin): Promise<void> {
  const a = db ?? (await admin());
  await a.from("agent_runs").insert({
    agent: entry.agent,
    trigger: entry.trigger,
    summary: entry.summary.slice(0, 500),
    output: (entry.output ?? {}) as object,
    ok: entry.ok ?? true,
    error: entry.error ?? null,
    cost_usd: entry.cost_usd ?? 0,
  });
}

// ---------- LLM ----------

const AGENT_MODEL = process.env.AGENT_MODEL || "google/gemini-2.5-flash";

/** One JSON-mode chat call. Returns the parsed object and its cost in USD. */
export async function agentJson<T>(system: string, user: string): Promise<{ data: T; costUsd: number }> {
  if (!aiKey()) throw new Error("AI is not configured (OPENROUTER_API_KEY)");
  const res = await aiChatFetch({
    method: "POST",
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      usage: { include: true },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
  };
  const raw = j.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const data = JSON.parse(cleaned) as T;
  const u = j.usage ?? {};
  // OpenRouter reports the exact cost; otherwise estimate at Gemini Flash rates.
  const costUsd = typeof u.cost === "number"
    ? u.cost
    : ((u.prompt_tokens ?? 0) * 0.3 + (u.completion_tokens ?? 0) * 2.5) / 1_000_000;
  return { data, costUsd };
}

export function siteUrl(): string {
  return (process.env.APP_URL || "https://creatorflowai.prodxstore.com").replace(/\/+$/, "");
}
