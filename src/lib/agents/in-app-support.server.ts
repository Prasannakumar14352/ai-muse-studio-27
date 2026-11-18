// In-app support chat: the same support brain as the Telegram agent, but the
// conversation is private, so it may talk about the user's own account.
//
// Billing and anything it isn't sure of go to the Agent HQ approval inbox;
// when the admin approves, the reply lands back in the user's chat.

import { admin, agentJson, alertAdmins, getAgentSettings, logRun, siteUrl, withinBudget } from "@/lib/agents/core.server";
import { liveKb } from "@/lib/agents/support-kb";
import { accountContextForUser } from "@/lib/agents/support.server";

export const DAILY_LIMIT = 30;

type Triage = {
  category: "question" | "bug" | "billing" | "feature" | "chat";
  reply: string;
  confidence: number;
  needs_human: boolean;
  ticket_title: string;
  ticket_summary: string;
  priority: 1 | 2 | 3;
};

const SYSTEM = `You are the in-app support assistant for CreatorFlow AI, chatting privately with a signed-in user.

Rules:
- Reply in the SAME language and script the user wrote in (Telugu, Hindi, English, Tanglish…). Friendly and short (2-6 sentences), with concrete steps ("open Library → …"). Plain text; simple "-" bullets are fine.
- Only state facts from the KNOWLEDGE BASE or the ACCOUNT CONTEXT. If the answer isn't there, set needs_human true.
- This chat is private, so you MAY use the user's own account details (plan, credits, recent failures and refunds) to answer. Never mention internal IDs or other users.
- Use CURRENT PAGE to make the answer specific to where they are.
- NEVER promise refunds, credits, discounts or dates. Billing/refund/payment problems → category "billing", needs_human true; reply with a short holding message ("Thanks — I've passed this to the team; you'll get a reply right here in this chat.").
- A bug → category "bug": check ACCOUNT CONTEXT for the matching failure (and whether credits were refunded — failed generations are refunded automatically), give any workaround, and say it has been logged.
- A feature idea → category "feature": thank them, say it's been passed to the product team.
- Greetings / thanks → category "chat" with a short friendly reply.
- confidence = how sure you are the reply is correct and complete (0-1).

Return JSON: {"category","reply","confidence","needs_human","ticket_title" (≤ 70 chars, English),"ticket_summary" (2-4 sentences, English, include what the user tried and any matching error),"priority" (1 urgent / 2 normal / 3 low)}`;

export type ChatMsg = { id: string; role: "user" | "assistant" | "admin"; text: string; created_at: string; seen_by_user: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertMsg(db: any, row: Record<string, unknown>): Promise<ChatMsg> {
  const { data, error } = await db.from("support_chat_messages").insert(row).select("id,role,text,created_at,seen_by_user").single();
  if (error) throw new Error(error.message);
  return data as ChatMsg;
}

export async function handleInAppMessage(userId: string, email: string | null, rawText: string, page: string | null): Promise<ChatMsg[]> {
  const text = rawText.trim().slice(0, 2000);
  const db = await admin();

  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from("support_chat_messages").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("role", "user").gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    throw new Error(`You've reached today's limit of ${DAILY_LIMIT} support messages. For anything urgent, email prodxstoresupport@gmail.com.`);
  }

  const userMsg = await insertMsg(db, { user_id: userId, role: "user", text, page });
  const who = email ?? userId.slice(0, 8);
  const sourceRef = { user_id: userId, from: who, chat_message_id: userMsg.id, page };

  const escalate = async (category: string, title: string, body: string, draft: string, priority: number, holding: string) => {
    const { data: task } = await db.from("agent_tasks").insert({
      agent: "support", kind: category, title, body, status: "waiting_approval", priority,
      draft_reply: draft, source: "in_app", source_ref: sourceRef, user_id: userId,
    }).select("id").single();
    const reply = await insertMsg(db, { user_id: userId, role: "assistant", text: holding, category, task_id: task?.id ?? null, page });
    await alertAdmins(`📥 In-app chat needs your approval (${category})\n${who}: ${text.slice(0, 400)}${draft ? `\n\nDraft: ${draft.slice(0, 600)}` : ""}\n\nApprove in Agent HQ: ${siteUrl()}/admin/agents`, db).catch(() => {});
    return reply;
  };

  const s = await getAgentSettings(db);
  if (!(await withinBudget(db))) {
    const r = await escalate("question", `In-app: ${text.slice(0, 60)}`, text, "", 2,
      "Thanks — I've passed this to the team; you'll get a reply right here in this chat.");
    return [userMsg, r];
  }

  const [kb, acct, { data: history }] = await Promise.all([
    liveKb(db),
    accountContextForUser(db, userId),
    db.from("support_chat_messages").select("role,text").eq("user_id", userId).order("created_at", { ascending: false }).range(1, 10),
  ]);
  const thread = (history ?? []).reverse()
    .map((m: { role: string; text: string }) => `${m.role === "user" ? "User" : m.role === "admin" ? "Team" : "Assistant"}: ${m.text}`)
    .join("\n").slice(0, 3000);

  let triage: Triage;
  let cost = 0;
  try {
    const r = await agentJson<Triage>(SYSTEM,
      `KNOWLEDGE BASE:\n${kb}\n\nACCOUNT CONTEXT:\n${acct}\n\nCURRENT PAGE: ${page ?? "unknown"}\n\nEARLIER IN THIS CHAT:\n${thread || "(none)"}\n\nNEW MESSAGE:\n${text}`);
    triage = r.data; cost = r.costUsd;
  } catch (e) {
    await logRun({ agent: "support", trigger: "in_app", summary: `AI failed on: ${text.slice(0, 80)}`, ok: false, error: e instanceof Error ? e.message : String(e) }, db);
    const r = await escalate("question", `In-app: ${text.slice(0, 60)}`, text, "", 2,
      "Sorry — I couldn't answer that just now. I've passed it to the team and you'll get a reply right here.");
    return [userMsg, r];
  }

  const category = triage.category ?? "question";
  const confident = (triage.confidence ?? 0) >= 0.7 && !triage.needs_human;
  let reply: ChatMsg;
  let outcome = "replied";

  if (category === "billing" || !confident || !s.auto_reply) {
    outcome = "approval";
    reply = await escalate(category, triage.ticket_title || text.slice(0, 70),
      `${triage.ticket_summary}\n\nOriginal message:\n${text}`, triage.reply ?? "",
      category === "billing" ? 1 : (triage.priority ?? 2),
      category === "billing"
        ? "Thanks — I've passed this to the team; you'll get a reply right here in this chat."
        : "Good question — let me confirm with the team. You'll get a reply right here in this chat.");
  } else {
    let out = (triage.reply ?? "").trim() || "Happy to help!";
    let taskId: string | null = null;
    if (category === "bug" || category === "feature") {
      const { data: task } = await db.from("agent_tasks").insert({
        agent: "support", kind: category, title: triage.ticket_title || text.slice(0, 70),
        body: `${triage.ticket_summary}\n\nOriginal message:\n${text}`, status: "todo",
        priority: triage.priority ?? 2, source: "in_app", source_ref: sourceRef, user_id: userId,
      }).select("id").single();
      taskId = task?.id ?? null;
      if (taskId && category === "bug") out += `\n\nTicket #${String(taskId).slice(0, 6).toUpperCase()} — we'll update you here when it's fixed.`;
      if (category === "bug" && triage.priority === 1) {
        await alertAdmins(`🐞 Urgent bug from in-app chat\n${triage.ticket_title}\n${triage.ticket_summary}`, db).catch(() => {});
      }
    }
    reply = await insertMsg(db, { user_id: userId, role: "assistant", text: out, category, task_id: taskId, page });
  }

  await db.from("support_chat_messages").update({ category }).eq("id", userMsg.id);
  await logRun({
    agent: "support", trigger: "in_app",
    summary: `${category} → ${outcome} (in-app): ${text.slice(0, 80)}`,
    output: { triage }, cost_usd: cost,
  }, db);
  return [userMsg, reply];
}

/** Admin approved a drafted reply (or marked a bug fixed): post it into the user's chat. */
export async function postAdminReplyToChat(userId: string, taskId: string, text: string): Promise<void> {
  const db = await admin();
  await insertMsg(db, { user_id: userId, role: "admin", text, task_id: taskId, seen_by_user: false });
}
