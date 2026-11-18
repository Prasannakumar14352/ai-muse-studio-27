// Server-only billing helpers shared by checkout verification, the Razorpay
// webhook and auto-debit (Razorpay Subscriptions).
//
// Every user has exactly ONE subscriptions row (created at signup as "free";
// unique on user_id). Activating a plan therefore UPDATES that row — it never
// inserts a second one.
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type Cycle = "monthly" | "yearly" | "lifetime";

/** Total charges Razorpay may make: effectively "until cancelled". */
export const AUTOPAY_TOTAL_COUNT: Record<"monthly" | "yearly", number> = { monthly: 120, yearly: 10 };

export async function loadPricingPlan(admin: Admin, code: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin.from("pricing_plans").select("*").eq("code", code).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** Credits granted when a plan is bought for a cycle (yearly = 12 months, used monthly). */
export function planCredits(plan: Record<string, unknown>, cycle: Cycle): number {
  const monthly = Number(plan.monthly_credits ?? 0);
  const included = Number(plan.included_credits ?? 0);
  if (cycle === "lifetime") return included || monthly;
  return cycle === "yearly" ? monthly * 12 : monthly;
}

function addPeriod(from: Date, cycle: "monthly" | "yearly"): Date {
  const d = new Date(from);
  if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/**
 * Put the user on a plan (monthly / yearly / lifetime). Idempotent per call
 * site; callers guard against double-processing the same payment.
 */
export async function activatePlan(admin: Admin, userId: string, opts: {
  plan: Record<string, unknown>;
  cycle: Cycle;
  razorpaySubscriptionId?: string | null;
  periodEnd?: Date | null;
}): Promise<{ credits: number }> {
  const { plan, cycle } = opts;
  const now = new Date();
  const credits = planCredits(plan, cycle);

  if (cycle === "lifetime") {
    const { data: profile } = await admin.from("profiles").select("lifetime_credits").eq("id", userId).maybeSingle();
    const current = (profile as { lifetime_credits?: number } | null)?.lifetime_credits ?? 0;
    const { error } = await admin.from("profiles").update({ lifetime_credits: current + credits } as never).eq("id", userId);
    if (error) throw new Error("Could not credit lifetime account");
  }

  const row = {
    user_id: userId,
    plan_name: String(plan.code),
    plan_type: cycle,
    lifetime_access: cycle === "lifetime",
    included_credits: cycle === "lifetime" ? credits : 0,
    monthly_credit_limit: Number(plan.monthly_credits ?? 0),
    monthly_credits_used: 0,
    unlimited_usage: false,
    status: "active",
    started_at: now.toISOString(),
    renews_at: cycle === "lifetime" ? null : (opts.periodEnd ?? addPeriod(now, cycle)).toISOString(),
    expires_at: null,
    last_credit_refill_at: null,
    razorpay_subscription_id: opts.razorpaySubscriptionId ?? null,
    auto_renew: !!opts.razorpaySubscriptionId,
    payment_issue: null,
  };
  const { error } = await admin.from("subscriptions").upsert(row as never, { onConflict: "user_id" });
  if (error) throw new Error(`Could not activate plan: ${error.message}`);
  return { credits };
}

/**
 * Fulfil a successful one-time order (credit pack or plan). Used by both the
 * checkout verification and the webhook, so a user who closes the tab after
 * paying still gets exactly what they bought.
 */
export async function fulfillOrderPayment(admin: Admin, payment: {
  user_id: string; pack_id: string | null; credits: number;
}): Promise<{ credits: number; planId?: string; lifetime?: boolean; subscription?: boolean; newBalance?: number }> {
  const packId = payment.pack_id ?? "";
  const m = packId.startsWith("plan_") ? packId.slice(5).match(/^(.+)_(monthly|yearly|lifetime)$/) : null;
  if (m) {
    const plan = await loadPricingPlan(admin, m[1]);
    if (plan) {
      const cycle = m[2] as Cycle;
      const { credits } = await activatePlan(admin, payment.user_id, { plan, cycle });
      return { credits, planId: String(plan.code), lifetime: cycle === "lifetime", subscription: cycle !== "lifetime" };
    }
  }
  // Credit pack → wallet balance.
  const { data: profile } = await admin.from("profiles").select("user_credits").eq("id", payment.user_id).maybeSingle();
  const current = (profile as { user_credits?: number } | null)?.user_credits ?? 0;
  const { error } = await admin.from("profiles").update({ user_credits: current + payment.credits } as never).eq("id", payment.user_id);
  if (error) throw new Error("Could not credit account");
  return { credits: payment.credits, newBalance: current + payment.credits };
}

// ───────────────────────── Razorpay API ─────────────────────────

export async function razorpayApi<T = Record<string, unknown>>(
  path: string, init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { resolveRazorpayCredentials } = await import("./razorpay-settings.server");
  const creds = await resolveRazorpayCredentials();
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
  if (!res.ok) {
    const desc = (j.error as { description?: string } | undefined)?.description ?? text.slice(0, 200);
    throw new Error(`Razorpay: ${desc || res.status}`);
  }
  return j as T;
}

export type AutopayPlan = { planCode: string; cycle: "monthly" | "yearly"; razorpayPlanId: string; amountPaise: number; name: string };

const PLAN_NAME_RE = /creatorflow\s+(starter|creator|pro)\s+(monthly|yearly)/i;

/**
 * Razorpay plans for auto-debit, found by name ("CreatorFlow Pro Monthly")
 * in the account the configured keys belong to. Cached per environment for
 * an hour in razorpay_plan_map.
 */
export async function listAutopayPlans(admin: Admin, opts: { refresh?: boolean } = {}): Promise<AutopayPlan[]> {
  const { resolveRazorpayCredentials } = await import("./razorpay-settings.server");
  const creds = await resolveRazorpayCredentials();
  const env = creds.environment;

  if (!opts.refresh) {
    const { data: cached } = await admin.from("razorpay_plan_map" as never)
      .select("plan_code, cycle, razorpay_plan_id, amount_paise, plan_name, updated_at").eq("environment", env);
    const rows = (cached ?? []) as Array<{ plan_code: string; cycle: "monthly" | "yearly"; razorpay_plan_id: string; amount_paise: number; plan_name: string | null; updated_at: string }>;
    const fresh = rows.length > 0 && rows.every((r) => Date.now() - new Date(r.updated_at).getTime() < 3600_000);
    if (fresh) return rows.map((r) => ({ planCode: r.plan_code, cycle: r.cycle, razorpayPlanId: r.razorpay_plan_id, amountPaise: r.amount_paise, name: r.plan_name ?? "" }));
  }

  const list = await razorpayApi<{ items?: Array<{ id: string; period: string; interval: number; item?: { name?: string; amount?: number; currency?: string; active?: boolean } }> }>("/plans?count=100");
  const found = new Map<string, AutopayPlan>();
  for (const p of list.items ?? []) {
    const name = p.item?.name ?? "";
    const m = name.match(PLAN_NAME_RE);
    if (!m || p.item?.currency !== "INR" || p.item?.active === false) continue;
    const cycle = m[2].toLowerCase() as "monthly" | "yearly";
    // Must actually bill every 1 month / 1 year.
    if (p.interval !== 1 || (cycle === "monthly" ? p.period !== "monthly" : p.period !== "yearly")) continue;
    const key = `${m[1].toLowerCase()}_${cycle}`;
    if (!found.has(key)) {
      found.set(key, { planCode: m[1].toLowerCase(), cycle, razorpayPlanId: p.id, amountPaise: Number(p.item?.amount ?? 0), name });
    }
  }
  const plans = [...found.values()];
  await admin.from("razorpay_plan_map" as never).delete().eq("environment", env);
  if (plans.length) {
    await admin.from("razorpay_plan_map" as never).insert(plans.map((p) => ({
      plan_code: p.planCode, cycle: p.cycle, environment: env, razorpay_plan_id: p.razorpayPlanId,
      amount_paise: p.amountPaise, plan_name: p.name, updated_at: new Date().toISOString(),
    })) as never);
  }
  return plans;
}

// ───────────────────────── Auto-debit charges ─────────────────────────

/** Record a successful auto-debit charge and activate / renew the plan. Shared with the webhook. */
export async function applyAutopayCharge(supabaseAdmin: Admin, args: {
  subscriptionId: string;
  paymentId: string;
  orderId?: string | null;
  currentEnd?: number | null; // unix seconds from Razorpay
}): Promise<{ credits: number; already: boolean }> {

  const { data: rs } = await supabaseAdmin.from("razorpay_subscriptions" as never)
    .select("*").eq("razorpay_subscription_id", args.subscriptionId).maybeSingle();
  const rsub = rs as { user_id: string; plan_code: string; cycle: "monthly" | "yearly"; amount_paise: number } | null;
  if (!rsub) throw new Error("Unknown subscription");
  const plan = await loadPricingPlan(supabaseAdmin, rsub.plan_code);
  if (!plan) throw new Error("Unknown plan");
  const credits = planCredits(plan, rsub.cycle);

  // One payment row per charge; the unique payment id makes this idempotent.
  const { error: payErr } = await supabaseAdmin.from("payments").insert({
    user_id: rsub.user_id,
    razorpay_order_id: args.orderId || `sub_${args.paymentId}`,
    razorpay_payment_id: args.paymentId,
    pack_id: `plan_${rsub.plan_code}_${rsub.cycle}`,
    credits,
    amount_cents: rsub.amount_paise,
    amount_inr_paise: rsub.amount_paise,
    currency: "INR",
    status: "success",
    receipt_number: `autopay_${args.paymentId}`.slice(0, 40),
    metadata: { autopay: true, razorpay_subscription_id: args.subscriptionId },
  } as never);
  if (payErr) {
    if (payErr.code === "23505") return { credits, already: true }; // already processed
    throw new Error(`Could not record payment: ${payErr.message}`);
  }

  const periodEnd = args.currentEnd ? new Date(args.currentEnd * 1000) : null;
  const { data: current } = await supabaseAdmin.from("subscriptions")
    .select("razorpay_subscription_id").eq("user_id", rsub.user_id).maybeSingle();
  if ((current as { razorpay_subscription_id?: string | null } | null)?.razorpay_subscription_id === args.subscriptionId) {
    // Renewal: fresh credits for the new period.
    await supabaseAdmin.from("subscriptions").update({
      status: "active",
      monthly_credits_used: 0,
      last_credit_refill_at: new Date().toISOString(),
      renews_at: periodEnd?.toISOString() ?? null,
      payment_issue: null,
    } as never).eq("user_id", rsub.user_id);
  } else {
    // First charge: switch the user onto this plan.
    await activatePlan(supabaseAdmin, rsub.user_id, { plan, cycle: rsub.cycle, razorpaySubscriptionId: args.subscriptionId, periodEnd });
  }
  await supabaseAdmin.from("razorpay_subscriptions" as never).update({
    status: "active", current_end: periodEnd?.toISOString() ?? null, updated_at: new Date().toISOString(),
  } as never).eq("razorpay_subscription_id", args.subscriptionId);
  return { credits, already: false };
}
