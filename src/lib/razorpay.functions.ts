import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_PACKS } from "@/lib/constants";

/** Approximate USD → INR conversion used when charging in INR via Razorpay.
 *  Kept as a constant so it's easy to update. Actual FX may vary slightly. */
export const INR_PER_USD = 84;

type Currency = "USD" | "INR";

/** Look at Razorpay's error body and decide whether it's an international-payments block. */
function isInternationalBlockedError(status: number, body: string): boolean {
  if (status !== 400 && status !== 401 && status !== 403) return false;
  const b = body.toLowerCase();
  return b.includes("international") || b.includes("currency is not supported") || b.includes("payment_currency_not_supported");
}

/** Create a Razorpay order (with optional currency + international-fallback to INR). */
async function createOrderWithFallback(opts: {
  keyId: string;
  keySecret: string;
  priceUSD: number;
  currency: Currency;
  receipt: string;
  notes: Record<string, string | number>;
}): Promise<{ order: { id: string; amount: number; currency: string }; currencyUsed: Currency; amountCharged: number; fellBack: boolean }> {
  const auth = Buffer.from(`${opts.keyId}:${opts.keySecret}`).toString("base64");

  async function post(currency: Currency) {
    const amount = currency === "INR"
      ? Math.round(opts.priceUSD * INR_PER_USD * 100)
      : Math.round(opts.priceUSD * 100);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount, currency, receipt: opts.receipt, notes: opts.notes }),
    });
    return { res, amount, currency };
  }

  // First attempt with requested currency
  let attempt = await post(opts.currency);
  if (attempt.res.ok) {
    const order = await attempt.res.json() as { id: string; amount: number; currency: string };
    return { order, currencyUsed: attempt.currency, amountCharged: attempt.amount, fellBack: false };
  }

  const errText = await attempt.res.text();
  console.error("Razorpay order error:", attempt.res.status, errText);

  // Auto-fallback: user asked USD but international is not enabled → retry INR
  if (opts.currency === "USD" && isInternationalBlockedError(attempt.res.status, errText)) {
    attempt = await post("INR");
    if (attempt.res.ok) {
      const order = await attempt.res.json() as { id: string; amount: number; currency: string };
      return { order, currencyUsed: "INR", amountCharged: attempt.amount, fellBack: true };
    }
    const errText2 = await attempt.res.text();
    console.error("Razorpay INR fallback error:", attempt.res.status, errText2);
    throw new Error(`Failed to create order (${attempt.res.status})`);
  }

  throw new Error(`Failed to create order (${attempt.res.status})`);
}



/** Public config for the browser Razorpay checkout (key_id only — safe to expose). */
export const getRazorpayConfig = createServerFn({ method: "GET" }).handler(async () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new Error("Razorpay not configured");
  return { keyId };
});

/** Create a Razorpay order for a credit pack + record a pending payment row. */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { packId: string; currency?: Currency }) => {
    if (!input || typeof input.packId !== "string") throw new Error("packId required");
    const currency: Currency = input.currency === "INR" ? "INR" : "USD";
    return { packId: input.packId, currency };
  })
  .handler(async ({ data, context }) => {
    const pack = CREDIT_PACKS.find((p) => p.id === data.packId);
    if (!pack) throw new Error("Unknown pack");

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay not configured");

    const shortUid = context.userId.replace(/-/g, "").slice(0, 12);
    const receipt = `rcpt_${shortUid}_${Date.now().toString(36)}`.slice(0, 40);

    const { order, currencyUsed, amountCharged, fellBack } = await createOrderWithFallback({
      keyId, keySecret,
      priceUSD: pack.priceUSD,
      currency: data.currency,
      receipt,
      notes: { user_id: context.userId, pack_id: pack.id, credits: pack.credits },
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("payments").insert({
      user_id: context.userId,
      razorpay_order_id: order.id,
      pack_id: pack.id,
      credits: pack.credits,
      amount_cents: amountCharged,
      currency: currencyUsed,
      status: "pending",
      receipt_number: receipt,
    });
    if (error) {
      console.error("payments insert error:", error);
      throw new Error("Could not record payment");
    }

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      fellBackToINR: fellBack,
      pack: { id: pack.id, label: pack.label, credits: pack.credits, priceUSD: pack.priceUSD },
    };
  });

/** Create a Razorpay order for a plan (INR only, billing cycle aware). */
export const createRazorpayPlanOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; billingCycle: "monthly" | "yearly" | "lifetime" }) => {
    if (!input || typeof input.planId !== "string") throw new Error("planId required");
    const cycle = input.billingCycle;
    if (cycle !== "monthly" && cycle !== "yearly" && cycle !== "lifetime") {
      throw new Error("Invalid billingCycle");
    }
    return { planId: input.planId, billingCycle: cycle };
  })
  .handler(async ({ data, context }) => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay not configured");

    // Look up the plan from the DB (admin-editable pricing)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("pricing_plans")
      .select("*")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr || !planRow) throw new Error("Unknown plan");
    const plan = planRow as unknown as Record<string, unknown>;
    if (plan.contact_sales) throw new Error("Contact sales for this plan");

    const priceInr =
      data.billingCycle === "monthly"
        ? Number(plan.price_monthly_inr ?? 0)
        : data.billingCycle === "yearly"
          ? Number(plan.price_yearly_inr ?? 0)
          : Number(plan.price_lifetime_inr ?? 0);
    if (!priceInr || priceInr <= 0) throw new Error("Plan is not purchasable for this billing cycle");

    // Credits granted at purchase.
    // Subscription monthly -> monthly_credits; yearly -> monthly_credits * 12; lifetime -> included_credits.
    const monthlyCredits = Number(plan.monthly_credits ?? 0);
    const includedCredits = Number(plan.included_credits ?? 0);
    const credits =
      data.billingCycle === "lifetime"
        ? includedCredits || monthlyCredits
        : data.billingCycle === "yearly"
          ? monthlyCredits * 12
          : monthlyCredits;

    const shortUid = context.userId.replace(/-/g, "").slice(0, 12);
    const receipt = `rcpt_${shortUid}_${Date.now().toString(36)}`.slice(0, 40);

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const amount = Math.round(priceInr * 100);
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt,
        notes: {
          user_id: context.userId,
          plan_id: String(plan.id),
          plan_code: String(plan.code),
          billing_cycle: data.billingCycle,
          credits,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Razorpay plan order error:", res.status, err);
      throw new Error(`Failed to create order (${res.status})`);
    }
    const order = (await res.json()) as { id: string; amount: number; currency: string };

    const { error } = await supabaseAdmin.from("payments").insert({
      user_id: context.userId,
      razorpay_order_id: order.id,
      pack_id: `plan_${String(plan.code)}_${data.billingCycle}`,
      credits,
      amount_cents: amount,
      currency: "INR",
      status: "pending",
      receipt_number: receipt,
    });
    if (error) {
      console.error("payments insert error:", error);
      throw new Error("Could not record payment");
    }

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      plan: {
        id: String(plan.id),
        code: String(plan.code),
        name: String(plan.name),
        credits,
        priceInr,
        billingCycle: data.billingCycle,
      },
    };
  });




/** Verify Razorpay checkout signature + finalize the payment (add credits, mark success). */
export const verifyRazorpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    if (!input?.razorpay_order_id || !input?.razorpay_payment_id || !input?.razorpay_signature) {
      throw new Error("Missing payment verification fields");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) throw new Error("Razorpay not configured");

    const { createHmac, timingSafeEqual } = await import("crypto");
    const expected = createHmac("sha256", keySecret)
      .update(`${data.razorpay_order_id}|${data.razorpay_payment_id}`)
      .digest("hex");
    const sig = Buffer.from(data.razorpay_signature);
    const exp = Buffer.from(expected);
    if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
      throw new Error("Invalid payment signature");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error: pErr } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("razorpay_order_id", data.razorpay_order_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (pErr || !payment) throw new Error("Payment not found");

    if (payment.status === "success") {
      return { ok: true, alreadyCredited: true, credits: payment.credits };
    }

    // Mark success (idempotent guard on status = 'pending')
    const { error: upErr } = await supabaseAdmin
      .from("payments")
      .update({ status: "success", razorpay_payment_id: data.razorpay_payment_id })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (upErr) throw new Error("Could not update payment");

    const packId = payment.pack_id ?? "";
    // Two formats supported:
    //   plan_<code>_<cycle>  → DB-backed plan
    //   plan_<oldConstantId> → legacy (pre-refactor) constant plan
    let dbPlan: Record<string, unknown> | null = null;
    let cycle: "monthly" | "yearly" | "lifetime" | null = null;
    if (packId.startsWith("plan_")) {
      const rest = packId.slice(5);
      const m = rest.match(/^(.+)_(monthly|yearly|lifetime)$/);
      if (m) {
        const code = m[1];
        cycle = m[2] as "monthly" | "yearly" | "lifetime";
        const { data: pr } = await supabaseAdmin.from("pricing_plans").select("*").eq("code", code).maybeSingle();
        dbPlan = (pr as Record<string, unknown> | null) ?? null;
      }
    }

    if (dbPlan && cycle === "lifetime") {
      const included = payment.credits;
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("lifetime_credits").eq("id", context.userId).maybeSingle();
      const currentLife = (profile as { lifetime_credits?: number } | null)?.lifetime_credits ?? 0;
      const { error: credErr } = await supabaseAdmin
        .from("profiles").update({ lifetime_credits: currentLife + included }).eq("id", context.userId);
      if (credErr) throw new Error("Could not credit lifetime account");
      await supabaseAdmin.from("subscriptions").update({ status: "canceled" })
        .eq("user_id", context.userId).eq("status", "active");
      await supabaseAdmin.from("subscriptions").insert({
        user_id: context.userId,
        plan_name: String(dbPlan.code),
        plan_type: "lifetime",
        lifetime_access: true,
        included_credits: included,
        monthly_credit_limit: Number(dbPlan.monthly_credits ?? 0),
        monthly_credits_used: 0,
        unlimited_usage: false,
        status: "active",
        started_at: new Date().toISOString(),
        expires_at: null,
        renews_at: null,
      });
      return { ok: true, credits: included, lifetime: true, planId: String(dbPlan.code) };
    }

    if (dbPlan && (cycle === "monthly" || cycle === "yearly")) {
      const monthlyLimit = Number(dbPlan.monthly_credits ?? 0);
      const now = new Date();
      const renew = new Date(now);
      if (cycle === "yearly") renew.setFullYear(renew.getFullYear() + 1);
      else renew.setMonth(renew.getMonth() + 1);
      await supabaseAdmin.from("subscriptions").update({ status: "canceled" })
        .eq("user_id", context.userId).eq("status", "active");
      await supabaseAdmin.from("subscriptions").insert({
        user_id: context.userId,
        plan_name: String(dbPlan.code),
        plan_type: cycle,
        lifetime_access: false,
        included_credits: 0,
        monthly_credit_limit: monthlyLimit,
        monthly_credits_used: 0,
        unlimited_usage: false,
        status: "active",
        started_at: now.toISOString(),
        renews_at: renew.toISOString(),
      });
      return { ok: true, credits: payment.credits, subscription: true, planId: String(dbPlan.code) };
    }


    // Otherwise: top-up credit pack → wallet balance.
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("user_credits").eq("id", context.userId).maybeSingle();
    const current = profile?.user_credits ?? 0;
    const { error: credErr } = await supabaseAdmin
      .from("profiles")
      .update({ user_credits: current + payment.credits })
      .eq("id", context.userId);
    if (credErr) throw new Error("Could not credit account");

    return { ok: true, credits: payment.credits, newBalance: current + payment.credits };
  });

/** List the current user's payments (for the invoices page). */
export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payments")
      .select("id, razorpay_order_id, razorpay_payment_id, pack_id, credits, amount_cents, currency, status, receipt_number, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { payments: data ?? [] };
  });

/** Get the current user's active subscription + credit balance for the Billing page. */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: sub } = await context.supabase
      .from("subscriptions")
      .select("id, plan_name, plan_type, lifetime_access, included_credits, status, started_at, expires_at, renews_at, monthly_credit_limit, monthly_credits_used, unlimited_usage")
      .eq("user_id", context.userId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("user_credits, lifetime_credits, is_admin")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: recent } = await context.supabase
      .from("payments")
      .select("id, razorpay_order_id, pack_id, credits, amount_cents, currency, status, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      subscription: sub ?? null,
      balance: profile?.user_credits ?? 0,
      lifetimeCredits: (profile as { lifetime_credits?: number } | null)?.lifetime_credits ?? 0,
      isAdmin: !!profile?.is_admin,
      recentPayments: recent ?? [],
    };
  });

