// Telegram support agent for the buyers' group.
//
// Every group message is classified (question / bug / billing / feature /
// chat). Questions it is confident about are answered in the group. Bugs and
// feature requests become Agent HQ tickets and get an acknowledgement.
// Billing, refunds and anything it is unsure of go to the admin's approval
// inbox (and a Telegram DM to the admin) — nothing about money is decided
// by the agent. Account details are only ever used privately.

import {
  admin, agentJson, alertAdmins, botToken, getAgentSettings, logRun, siteUrl, tg, tgSend, withinBudget,
} from "@/lib/agents/core.server";
import { liveKb } from "@/lib/agents/support-kb";

type TgUser = { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string };
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number; from?: TgUser };
};
export type TgUpdate = { update_id: number; message?: TgMessage; edited_message?: TgMessage };

type Triage = {
  category: "question" | "bug" | "billing" | "feature" | "chat";
  reply: string;
  confidence: number;
  needs_human: boolean;
  ticket_title: string;
  ticket_summary: string;
  priority: 1 | 2 | 3;
};

const SYSTEM = `You are the support agent for CreatorFlow AI, replying inside the buyers' Telegram group.

Classify the message and draft a reply. Rules:
- Reply in the SAME language and script the user wrote in (Telugu, Hindi, English, Tanglish…). Friendly, short (2-6 sentences), concrete steps. Plain text, no markdown headings.
- Only state facts from the KNOWLEDGE BASE or the ACCOUNT CONTEXT. If the answer isn't there, set needs_human true.
- NEVER put account details (credits, plan, payments, email) in the reply — the group is public. You may say "I've checked your account" and give the outcome in general words.
- NEVER promise refunds, credits, discounts or dates. Billing/refund/payment problems → category "billing", needs_human true; reply should be a short holding message ("Thanks, the team is checking this and will reply here soon.").
- A bug report → category "bug": acknowledge, give any workaround from the knowledge base, and say it has been logged for the team.
- A feature idea → category "feature": thank them, say it's been passed to the product team.
- Greetings, thanks, chit-chat between members, or messages not for support → category "chat", reply "".
- confidence = how sure you are the reply is correct and complete (0-1).

Return JSON: {"category","reply","confidence","needs_human","ticket_title" (≤ 70 chars, English),"ticket_summary" (2-4 sentences, English, include what the user tried),"priority" (1 urgent / 2 normal / 3 low)}`;

function displayName(u?: TgUser): string {
  if (!u) return "Someone";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || String(u.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function accountContext(db: any, telegramUserId: number): Promise<{ userId: string | null; text: string }> {
  const { data: link } = await db.from("telegram_links").select("user_id").eq("telegram_user_id", telegramUserId).maybeSingle();
  if (!link?.user_id) return { userId: null, text: "Not linked — no account details available. If account details are needed, ask them to link with /link (code from Settings → Telegram) or email support." };
  const uid = link.user_id as string;
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [{ data: profile }, { data: sub }, { data: ledger }, { data: pays }, { data: gens }] = await Promise.all([
    db.from("profiles").select("plan,user_credits,lifetime_credits,created_at").eq("id", uid).maybeSingle(),
    db.from("subscriptions").select("plan_name,plan_type,status,monthly_credit_limit,monthly_credits_used,renews_at,expires_at,auto_renew,payment_issue").eq("user_id", uid).maybeSingle(),
    db.from("credit_ledger").select("action,status,credits_charged,credits_refunded,error,created_at").eq("user_id", uid).gte("created_at", since).order("created_at", { ascending: false }).limit(15),
    db.from("payments").select("status,credits,amount_cents,currency,created_at,pack_id").eq("user_id", uid).gte("created_at", since).order("created_at", { ascending: false }).limit(5),
    db.from("model_generations").select("model_id,status,error,created_at").eq("user_id", uid).gte("created_at", since).order("created_at", { ascending: false }).limit(5),
  ]);
  return {
    userId: uid,
    text: JSON.stringify({ profile, subscription: sub, recent_credit_activity: ledger, recent_payments: pays, recent_model_studio: gens }).slice(0, 6000),
  };
}

export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.from || msg.from.is_bot) return;
  const text = (msg.text ?? msg.caption ?? "").trim();
  if (!text) return;

  const db = await admin();
  const s = await getAgentSettings(db);
  if (!s.telegram_enabled) return;
  const token = await botToken(s);
  if (!token) return;

  // ---- Private chat: /start, /link ----
  if (msg.chat.type === "private") {
    const link = text.match(/^\/link(?:@\w+)?\s+([A-Z0-9-]{6,12})$/i);
    if (link) {
      const code = link[1].toUpperCase();
      const { data: row } = await db.from("telegram_link_codes").select("user_id,expires_at").eq("code", code).maybeSingle();
      if (!row || new Date(row.expires_at).getTime() < Date.now()) {
        await tgSend(token, msg.chat.id, "That code has expired or is wrong. Get a new one in CreatorFlow → Settings → Telegram.");
        return;
      }
      await db.from("telegram_links").upsert({ telegram_user_id: msg.from.id, user_id: row.user_id, telegram_username: msg.from.username ?? null });
      await db.from("telegram_link_codes").delete().eq("code", code);
      await tgSend(token, msg.chat.id, "✅ Linked! The support agent can now check your account when you ask for help in the group (details stay private).");
      return;
    }
    if (/^\/start\b/.test(text)) {
      await tgSend(token, msg.chat.id, `Hi! I'm the CreatorFlow support assistant. Ask your question in the buyers' group, or here. To let me check your account, send /link followed by the code from CreatorFlow → Settings → Telegram.\n${siteUrl()}`);
      return;
    }
  } else {
    // ---- Group: only the configured group(s); the first group the bot sees is adopted. ----
    if (s.telegram_group_ids.length === 0) {
      await db.from("agent_settings").update({ telegram_group_ids: [msg.chat.id], updated_at: new Date().toISOString() }).eq("id", 1);
    } else if (!s.telegram_group_ids.map(Number).includes(Number(msg.chat.id))) {
      return;
    }
    if (text.startsWith("/")) return; // other bots' commands
  }

  // When an admin *replies to someone else's message* in the group they're
  // answering that person themselves, so the agent stays quiet. An admin's own
  // new question is still handled (that's how you test the bot), and plain
  // announcements are classified as "chat" and ignored by the triage step.
  const replyTo = (msg as { reply_to_message?: { from?: { id?: number; is_bot?: boolean } } }).reply_to_message;
  if (replyTo?.from?.id && replyTo.from.id !== msg.from.id && !replyTo.from.is_bot) {
    const { data: senderLink } = await db.from("telegram_links").select("user_id").eq("telegram_user_id", msg.from.id).maybeSingle();
    if (senderLink?.user_id) {
      const { data: p } = await db.from("profiles").select("is_admin").eq("id", senderLink.user_id).maybeSingle();
      if (p?.is_admin) return;
    }
  }

  // Record (dedupes Telegram's retries).
  const { data: row, error: insErr } = await db.from("telegram_messages").insert({
    chat_id: msg.chat.id, message_id: msg.message_id, from_id: msg.from.id,
    from_name: displayName(msg.from), text: text.slice(0, 4000), handled_by: "pending",
  }).select("id").single();
  if (insErr) return; // already seen
  const replyChat = msg.chat.id;

  // Out of budget → everything goes to the admin.
  if (!(await withinBudget(db))) {
    const { data: task } = await db.from("agent_tasks").insert({
      agent: "support", kind: "question", title: `Telegram: ${text.slice(0, 60)}`, body: text,
      status: "waiting_approval", source: "telegram",
      source_ref: { chat_id: replyChat, message_id: msg.message_id, from: displayName(msg.from), from_id: msg.from.id },
    }).select("id").single();
    await db.from("telegram_messages").update({ handled_by: "admin", task_id: task?.id ?? null }).eq("id", row.id);
    await alertAdmins(`⚠️ Agent budget reached — please answer in the group:\n\n${displayName(msg.from)}: ${text.slice(0, 500)}`, db);
    return;
  }

  const [kb, acct] = await Promise.all([liveKb(db), accountContext(db, msg.from.id)]);
  // Recent group context helps with follow-ups ("still not working").
  const { data: recent } = await db.from("telegram_messages")
    .select("from_name,text,reply_text").eq("chat_id", replyChat).order("created_at", { ascending: false }).range(1, 6);
  const thread = (recent ?? []).reverse().map((m: { from_name: string; text: string; reply_text: string | null }) =>
    `${m.from_name}: ${m.text}${m.reply_text ? `\nSupport: ${m.reply_text}` : ""}`).join("\n").slice(0, 2500);

  let triage: Triage;
  let cost = 0;
  try {
    const r = await agentJson<Triage>(SYSTEM,
      `KNOWLEDGE BASE:\n${kb}\n\nACCOUNT CONTEXT (private, never quote it):\n${acct.text}\n\nRECENT GROUP MESSAGES:\n${thread || "(none)"}\n\nNEW MESSAGE from ${displayName(msg.from)}:\n${text}`);
    triage = r.data; cost = r.costUsd;
  } catch (e) {
    await logRun({ agent: "support", trigger: "telegram", summary: `AI failed on: ${text.slice(0, 80)}`, ok: false, error: e instanceof Error ? e.message : String(e) }, db);
    await db.from("agent_tasks").insert({
      agent: "support", kind: "question", title: `Telegram: ${text.slice(0, 60)}`, body: text, status: "waiting_approval",
      source: "telegram", source_ref: { chat_id: replyChat, message_id: msg.message_id, from: displayName(msg.from), from_id: msg.from.id },
    });
    return;
  }

  const category = triage.category ?? "question";
  const confident = (triage.confidence ?? 0) >= 0.7 && !triage.needs_human;
  let handledBy = "agent";
  let taskId: string | null = null;
  let sentText: string | null = null;
  let sentId: number | null = null;

  const sourceRef = { chat_id: replyChat, message_id: msg.message_id, from: displayName(msg.from), from_id: msg.from.id };

  if (category === "chat" || !triage.reply?.trim()) {
    handledBy = "ignored";
  } else if (category === "billing" || !confident || !s.auto_reply) {
    // Needs the admin: draft goes to the approval inbox; a short holding reply in the group.
    const { data: task } = await db.from("agent_tasks").insert({
      agent: "support", kind: category === "billing" ? "billing" : category,
      title: triage.ticket_title || text.slice(0, 70), body: `${triage.ticket_summary}\n\nOriginal message:\n${text}`,
      status: "waiting_approval", priority: category === "billing" ? 1 : (triage.priority ?? 2),
      draft_reply: triage.reply, source: "telegram", source_ref: sourceRef, user_id: acct.userId,
    }).select("id").single();
    taskId = task?.id ?? null;
    handledBy = "admin";
    const holding = category === "billing"
      ? "Thanks — the team is checking this and will reply here shortly."
      : "Thanks for asking — let me confirm with the team and reply here shortly.";
    if (s.auto_reply) { sentText = holding; sentId = await tgSend(token, replyChat, holding, msg.message_id).catch(() => null); }
    await alertAdmins(`📥 Needs your approval (${category})\n${displayName(msg.from)}: ${text.slice(0, 400)}\n\nDraft: ${triage.reply.slice(0, 600)}\n\nApprove in Agent HQ: ${siteUrl()}/admin/agents`, db);
  } else {
    let reply = triage.reply.trim();
    if (category === "bug" || category === "feature") {
      const { data: task } = await db.from("agent_tasks").insert({
        agent: "support", kind: category, title: triage.ticket_title || text.slice(0, 70),
        body: `${triage.ticket_summary}\n\nOriginal message:\n${text}`, status: "todo",
        priority: triage.priority ?? 2, source: "telegram", source_ref: sourceRef, user_id: acct.userId,
      }).select("id").single();
      taskId = task?.id ?? null;
      if (taskId && category === "bug") reply += `\n\nTicket #${String(taskId).slice(0, 6).toUpperCase()}`;
      if (category === "bug" && triage.priority === 1) {
        await alertAdmins(`🐞 Urgent bug from the group\n${triage.ticket_title}\n${triage.ticket_summary}`, db);
      }
    }
    sentText = reply;
    sentId = await tgSend(token, replyChat, reply, msg.message_id).catch(() => null);
  }

  await db.from("telegram_messages").update({
    category, reply_text: sentText, reply_message_id: sentId, handled_by: handledBy, task_id: taskId,
  }).eq("id", row.id);
  await logRun({
    agent: "support", trigger: "telegram",
    summary: `${category}${handledBy === "admin" ? " → approval" : handledBy === "ignored" ? " (ignored)" : " → replied"}: ${text.slice(0, 80)}`,
    output: { triage, taskId }, cost_usd: cost,
  }, db);
}

/** Admin approved (and maybe edited) a drafted reply: post it in the thread. */
export async function sendApprovedReply(taskId: string, text: string): Promise<void> {
  const db = await admin();
  const s = await getAgentSettings(db);
  const token = await botToken(s);
  if (!token) throw new Error("Telegram bot isn't set up");
  const { data: task } = await db.from("agent_tasks").select("source_ref,kind").eq("id", taskId).single();
  const ref = (task?.source_ref ?? {}) as { chat_id?: number; message_id?: number };
  if (!ref.chat_id) throw new Error("This task didn't come from Telegram");
  const id = await tgSend(token, ref.chat_id, text, ref.message_id);
  await db.from("agent_tasks").update({
    status: task?.kind === "bug" || task?.kind === "feature" ? "todo" : "done",
    draft_reply: text, updated_at: new Date().toISOString(),
    resolved_at: task?.kind === "bug" || task?.kind === "feature" ? null : new Date().toISOString(),
  }).eq("id", taskId);
  await db.from("telegram_messages").update({ reply_text: text, reply_message_id: id, handled_by: "admin" })
    .eq("chat_id", ref.chat_id).eq("message_id", ref.message_id);
}

/** Point Telegram at our webhook and read the bot's username. */
export async function registerWebhook(token: string, secret: string): Promise<{ username: string }> {
  const me = await tg<{ username: string }>(token, "getMe", {});
  await tg(token, "setWebhook", {
    url: `${siteUrl()}/api/public/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  return { username: me.username };
}
