// Scheduled agents, run once a day by pg_cron (08:10 IST):
//   QA health check  — every day: is the site up, is the AI money there, is
//                      anything failing more than usual?
//   Ops & finance    — every day: yesterday's signups, sales, credit use.
//   Product manager  — Mondays: reads the week's tickets, Telegram questions
//                      and failures, writes a ranked to-do list.
// Each one logs a run, files a report task, and DMs linked admins.

import {
  admin, agentJson, alertAdmins, getAgentSettings, logRun, siteUrl, withinBudget,
} from "@/lib/agents/core.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DAY = 864e5;

async function report(db: Db, agent: string, title: string, body: string, priority: 1 | 2 | 3, kind: "report" | "alert" = "report") {
  await db.from("agent_tasks").insert({
    agent, kind, title, body, status: kind === "alert" ? "todo" : "done", priority, source: "schedule",
    resolved_at: kind === "alert" ? null : new Date().toISOString(),
  });
}

// ---------------------------------------------------------------- QA

export async function runQaHealthCheck(trigger = "schedule"): Promise<{ ok: boolean; problems: string[] }> {
  const db = await admin();
  const problems: string[] = [];
  const notes: string[] = [];
  const since = new Date(Date.now() - DAY).toISOString();

  // 1. Site up?
  try {
    const r = await fetch(`${siteUrl()}/`, { method: "GET" });
    if (!r.ok) problems.push(`Website returned ${r.status}.`);
    else notes.push("Website is up.");
  } catch (e) {
    problems.push(`Website unreachable: ${e instanceof Error ? e.message : e}`);
  }

  // 2. OpenRouter credit (scripts, captions, agents).
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${orKey}` } });
      const j = (await r.json()) as { data?: { total_credits?: number; total_usage?: number } };
      const left = (j.data?.total_credits ?? 0) - (j.data?.total_usage ?? 0);
      if (r.ok) {
        if (left < 3) problems.push(`OpenRouter balance is low: $${left.toFixed(2)} left. Top up at openrouter.ai/settings/credits.`);
        else notes.push(`OpenRouter balance: $${left.toFixed(2)}.`);
      }
    } catch { notes.push("Couldn't read the OpenRouter balance."); }
  } else {
    problems.push("OPENROUTER_API_KEY is not set — all text AI is down.");
  }
  if (!process.env.FAL_KEY) problems.push("FAL_KEY is not set — images, voice and Model Studio are down.");

  // 3. Generation failures in the last 24 h (fal out of credit shows as 403).
  const { data: ledger } = await db.from("credit_ledger").select("action,status,error").gte("created_at", since).limit(5000);
  const rows = (ledger ?? []) as Array<{ action: string; status: string; error: string | null }>;
  const failed = rows.filter((r) => r.status === "refunded" || r.status === "failed");
  const balanceErrors = failed.filter((r) => /403|balance|exhaust|credit/i.test(r.error ?? ""));
  if (balanceErrors.length) problems.push(`${balanceErrors.length} generation(s) failed with a billing error — the fal.ai account may be out of credit (fal.ai/dashboard/billing).`);
  const rateLimited = failed.filter((r) => /429/.test(r.error ?? ""));
  if (rateLimited.length >= 5) problems.push(`${rateLimited.length} requests were rate-limited (429) by the AI provider in 24 h — mostly ${topAction(rateLimited)}.`);
  if (rows.length >= 10 && failed.length / rows.length > 0.2) {
    problems.push(`High failure rate: ${failed.length} of ${rows.length} generations failed in 24 h (most in ${topAction(failed)}).`);
  } else {
    notes.push(`${rows.length - failed.length} generations succeeded, ${failed.length} failed and were refunded in 24 h.`);
  }

  // 4. Publishing.
  const { data: posts } = await db.from("scheduled_posts").select("status,platform,last_error").gte("updated_at", since);
  const postFails = (posts ?? []).filter((p: { status: string }) => p.status === "failed");
  if (postFails.length) problems.push(`${postFails.length} scheduled post(s) failed to publish (${[...new Set(postFails.map((p: { platform: string }) => p.platform))].join(", ")}).`);

  // 5. Payments stuck in "pending" for over an hour (webhook not arriving?).
  const { data: pending } = await db.from("payments").select("id").eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 3600e3).toISOString()).gte("created_at", new Date(Date.now() - 2 * DAY).toISOString());
  if ((pending ?? []).length >= 3) problems.push(`${pending.length} payments are stuck in "pending" — check the Razorpay webhook (Admin → Webhooks).`);

  const ok = problems.length === 0;
  const body = [...problems.map((p) => `❗ ${p}`), ...notes.map((n) => `✓ ${n}`)].join("\n");
  await report(db, "qa", ok ? "Daily health check: all good" : `Daily health check: ${problems.length} problem(s)`, body, ok ? 3 : 1, ok ? "report" : "alert");
  await logRun({ agent: "qa", trigger, summary: ok ? "All checks passed" : problems.join(" | "), output: { problems, notes }, ok }, db);
  if (!ok) await alertAdmins(`🩺 CreatorFlow health check\n\n${body}`, db);
  return { ok, problems };
}

function topAction(rows: Array<{ action: string }>): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.action, (counts.get(r.action) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
}

// ---------------------------------------------------------------- Ops

export async function runOpsReport(trigger = "schedule"): Promise<string> {
  const db = await admin();
  const since = new Date(Date.now() - DAY).toISOString();
  const [{ count: users }, { data: pays }, { data: ledger }, { count: projects }] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("payments").select("status,amount_inr_paise,amount_cents,currency,pack_id").gte("created_at", since),
    db.from("credit_ledger").select("credits_charged,status,action").gte("created_at", since).limit(10000),
    db.from("projects").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const paid = (pays ?? []).filter((p: { status: string }) => ["paid", "captured", "success"].includes(p.status));
  const revenueInr = paid.reduce((s: number, p: { amount_inr_paise: number | null; amount_cents: number | null; currency: string }) =>
    s + (p.amount_inr_paise ?? (p.currency === "INR" ? p.amount_cents ?? 0 : 0)) / 100, 0);
  const charged = (ledger ?? []).filter((l: { status: string }) => l.status === "charged");
  const credits = charged.reduce((s: number, l: { credits_charged: number | null }) => s + (l.credits_charged ?? 0), 0);
  // ~$0.0054 provider cost per credit (see pricing notes).
  const providerCostUsd = credits * 0.0054;
  const agentSpend = await (await import("@/lib/agents/core.server")).spentThisMonthUsd(db);
  const s = await getAgentSettings(db);
  const body = [
    `New signups: ${users ?? 0}`,
    `New projects: ${projects ?? 0}`,
    `Payments: ${paid.length} paid · ₹${revenueInr.toLocaleString("en-IN")}`,
    `Credits used: ${credits} (≈ $${providerCostUsd.toFixed(2)} AI provider cost)`,
    `Agent AI spend this month: $${agentSpend.toFixed(2)} of $${s.monthly_budget_usd.toFixed(2)} budget`,
  ].join("\n");
  await report(db, "ops", `Daily numbers — ${new Date().toISOString().slice(0, 10)}`, body, 3);
  await logRun({ agent: "ops", trigger, summary: body.replace(/\n/g, " · "), output: { users, paid: paid.length, revenueInr, credits } }, db);
  await alertAdmins(`📊 CreatorFlow — last 24 h\n\n${body}`, db);
  return body;
}

// ---------------------------------------------------------------- Product manager

type PmReport = {
  summary: string;
  priorities: Array<{ title: string; why: string; owner: "engineering" | "marketing" | "support" | "ops"; priority: 1 | 2 | 3 }>;
};

export async function runProductManager(trigger = "schedule"): Promise<PmReport | null> {
  const db = await admin();
  if (!(await withinBudget(db))) {
    await logRun({ agent: "product_manager", trigger, summary: "Skipped — monthly agent budget reached", ok: false }, db);
    return null;
  }
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [{ data: tasks }, { data: msgs }, { data: ledger }, { count: signups }, { data: pays }] = await Promise.all([
    db.from("agent_tasks").select("agent,kind,title,status,priority").gte("created_at", since).neq("kind", "report").limit(200),
    db.from("telegram_messages").select("category,text").gte("created_at", since).neq("category", "chat").limit(200),
    db.from("credit_ledger").select("action,status,error").gte("created_at", since).limit(10000),
    db.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("payments").select("status").gte("created_at", since),
  ]);
  const failures = (ledger ?? []).filter((l: { status: string }) => l.status !== "charged" && l.status !== "reserved");
  const failByAction: Record<string, number> = {};
  for (const f of failures as Array<{ action: string; error: string | null }>) failByAction[`${f.action}: ${f.error ?? "?"}`] = (failByAction[`${f.action}: ${f.error ?? "?"}`] ?? 0) + 1;

  const input = JSON.stringify({
    open_and_recent_tickets: tasks, buyer_messages: (msgs ?? []).map((m: { category: string; text: string }) => `[${m.category}] ${m.text.slice(0, 200)}`),
    generation_failures: failByAction, signups_7d: signups, payments_7d: (pays ?? []).length,
  }).slice(0, 20000);

  const { data, costUsd } = await agentJson<PmReport>(
    `You are the product manager for CreatorFlow AI, a SaaS for creators (reels, carousels, images, publishing).
Read last week's signals and write the weekly plan. Group duplicate complaints; rank by user impact and how many buyers are affected; prefer fixing broken flows over new features.
Return JSON: {"summary": "3-5 sentence plain-English summary of the week", "priorities": [{"title","why","owner":"engineering|marketing|support|ops","priority":1|2|3}] (max 8)}`,
    input,
  );
  const body = `${data.summary}\n\nThis week's priorities:\n${data.priorities.map((p, i) => `${i + 1}. [${p.owner}] ${p.title} — ${p.why}`).join("\n")}`;
  await report(db, "product_manager", `Weekly product report — ${new Date().toISOString().slice(0, 10)}`, body, 2);
  for (const p of data.priorities.filter((p) => p.priority === 1).slice(0, 5)) {
    await db.from("agent_tasks").insert({ agent: "product_manager", kind: "feature", title: p.title, body: p.why, status: "todo", priority: 1, source: "schedule", source_ref: { owner: p.owner } });
  }
  await logRun({ agent: "product_manager", trigger, summary: data.summary.slice(0, 300), output: data, cost_usd: costUsd }, db);
  await alertAdmins(`🗂 Weekly product report\n\n${body}`.slice(0, 3800), db);
  return data;
}

/** Called by the daily cron. */
export async function runDailyAgents(): Promise<Record<string, unknown>> {
  const db = await admin();
  const s = await getAgentSettings(db);
  if (!s.scheduled_agents_enabled) return { skipped: true };
  const out: Record<string, unknown> = {};
  out.qa = await runQaHealthCheck().catch((e) => ({ error: String(e) }));
  out.ops = await runOpsReport().catch((e) => ({ error: String(e) }));
  // Mondays (IST) — the cron runs at 08:10 IST.
  const ist = new Date(Date.now() + 5.5 * 3600e3);
  if (ist.getUTCDay() === 1) out.pm = await runProductManager().catch((e) => ({ error: String(e) }));
  return out;
}
