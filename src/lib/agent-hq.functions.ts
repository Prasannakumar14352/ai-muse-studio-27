// Server functions for the admin-only Agent HQ page, plus the user-facing
// "link my Telegram" code.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const getAgentHq = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const core = await import("@/lib/agents/core.server");
    const db = await core.admin();
    const s = await core.getAgentSettings(db);
    const [spent, tasks, messages, runs, adminLink] = await Promise.all([
      core.spentThisMonthUsd(db),
      db.from("agent_tasks").select("*").order("created_at", { ascending: false }).limit(200),
      db.from("telegram_messages").select("*").order("created_at", { ascending: false }).limit(100),
      db.from("agent_runs").select("id,agent,trigger,summary,ok,error,cost_usd,created_at").order("created_at", { ascending: false }).limit(100),
      db.from("telegram_links").select("telegram_user_id").eq("user_id", (context as unknown as Ctx).userId).maybeSingle(),
    ]);
    return {
      settings: {
        telegramEnabled: s.telegram_enabled,
        hasBotToken: Boolean(s.telegram_bot_token_cipher),
        botUsername: s.telegram_bot_username,
        groupIds: s.telegram_group_ids,
        autoReply: s.auto_reply,
        monthlyBudgetUsd: s.monthly_budget_usd,
        scheduledAgentsEnabled: s.scheduled_agents_enabled,
        adminTelegramLinked: Boolean(adminLink.data),
      },
      spentUsd: spent,
      tasks: (tasks.data ?? []) as AgentTask[],
      messages: (messages.data ?? []) as TelegramMsg[],
      runs: (runs.data ?? []) as AgentRun[],
    };
  });

export type AgentTask = {
  id: string; agent: string; kind: string; title: string; body: string; status: string; priority: number;
  draft_reply: string | null; source: string | null; source_ref: Record<string, string | number | boolean | null>; created_at: string; resolved_at: string | null;
};
export type TelegramMsg = {
  id: string; chat_id: number; message_id: number; from_name: string | null; text: string; category: string | null;
  reply_text: string | null; handled_by: string | null; task_id: string | null; created_at: string;
};
export type AgentRun = { id: string; agent: string; trigger: string; summary: string; ok: boolean; error: string | null; cost_usd: number; created_at: string };

export const saveAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    botToken: z.string().trim().optional(),
    telegramEnabled: z.boolean().optional(),
    autoReply: z.boolean().optional(),
    monthlyBudgetUsd: z.number().min(0).max(1000).optional(),
    scheduledAgentsEnabled: z.boolean().optional(),
    resetGroup: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const core = await import("@/lib/agents/core.server");
    const db = await core.admin();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let username: string | null = null;
    if (data.botToken) {
      if (!/^\d+:[\w-]{30,}$/.test(data.botToken)) throw new Error("That doesn't look like a bot token from @BotFather (it looks like 123456:ABC…).");
      const { encryptSecret, randomToken } = await import("@/lib/oauth-crypto.server");
      const { registerWebhook } = await import("@/lib/agents/support.server");
      const secret = randomToken(24).replace(/[^A-Za-z0-9_-]/g, "");
      const reg = await registerWebhook(data.botToken, secret);
      username = reg.username;
      const enc = await encryptSecret(data.botToken);
      Object.assign(patch, {
        telegram_bot_token_cipher: enc.cipher, telegram_bot_token_iv: enc.iv,
        telegram_bot_username: reg.username, telegram_webhook_secret: secret, telegram_enabled: true,
      });
    }
    if (data.telegramEnabled !== undefined) patch.telegram_enabled = data.telegramEnabled;
    if (data.autoReply !== undefined) patch.auto_reply = data.autoReply;
    if (data.monthlyBudgetUsd !== undefined) patch.monthly_budget_usd = data.monthlyBudgetUsd;
    if (data.scheduledAgentsEnabled !== undefined) patch.scheduled_agents_enabled = data.scheduledAgentsEnabled;
    if (data.resetGroup) patch.telegram_group_ids = [];
    const { error } = await db.from("agent_settings").update(patch).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true, botUsername: username };
  });

export const updateAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["todo", "in_progress", "waiting_approval", "done", "rejected"]).optional(),
    draftReply: z.string().max(4000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const core = await import("@/lib/agents/core.server");
    const db = await core.admin();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status) {
      patch.status = data.status;
      patch.resolved_at = data.status === "done" || data.status === "rejected" ? new Date().toISOString() : null;
    }
    if (data.draftReply !== undefined) patch.draft_reply = data.draftReply;
    const { error } = await db.from("agent_tasks").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Post a (possibly edited) reply to the Telegram thread the task came from. */
export const sendTaskReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), text: z.string().trim().min(1).max(4000), markDone: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { sendApprovedReply } = await import("@/lib/agents/support.server");
    await sendApprovedReply(data.id, data.text);
    if (data.markDone) {
      const core = await import("@/lib/agents/core.server");
      const db = await core.admin();
      await db.from("agent_tasks").update({ status: "done", resolved_at: new Date().toISOString() }).eq("id", data.id);
    }
    return { ok: true };
  });

export const runAgentNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent: z.enum(["qa", "ops", "product_manager"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const s = await import("@/lib/agents/scheduled.server");
    if (data.agent === "qa") return { result: await s.runQaHealthCheck("manual") };
    if (data.agent === "ops") return { result: await s.runOpsReport("manual") };
    return { result: await s.runProductManager("manual") };
  });

/** Any signed-in user: a one-time code to link their Telegram (/link CODE to the bot). */
export const createTelegramLinkCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const core = await import("@/lib/agents/core.server");
    const db = await core.admin();
    const userId = (context as unknown as Ctx).userId;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    await db.from("telegram_link_codes").delete().eq("user_id", userId);
    const { error } = await db.from("telegram_link_codes").insert({ code, user_id: userId });
    if (error) throw new Error(error.message);
    const s = await core.getAgentSettings(db);
    const { data: link } = await db.from("telegram_links").select("telegram_username").eq("user_id", userId).maybeSingle();
    return { code, botUsername: s.telegram_bot_username, linkedAs: link?.telegram_username ?? (link ? "linked" : null) };
  });
