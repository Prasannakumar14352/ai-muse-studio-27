import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_PACKS } from "@/lib/constants";

/**
 * Currency handling:
 *  - Public site advertises prices in USD.
 *  - Razorpay orders are ALWAYS created in INR (paise); merchant account is INR-only.
 *  - Conversion rate is resolved server-side by `resolveUsdInrRate()` in
 *    `src/lib/fx-rate.server.ts` which prefers live → cache → stale-cache → manual
 *    fallback. We NEVER accept a browser-provided rate — the amount is always
 *    recomputed on the server before creating the Razorpay order.
 *  - Full audit persisted on every payments row (listed USD, rate, source, INR paise).
 */

type ResolvedRate = Awaited<ReturnType<typeof import("@/lib/fx-rate.server").resolveUsdInrRate>>;
async function resolveRate(): Promise<ResolvedRate> {
  const { resolveUsdInrRate } = await import("@/lib/fx-rate.server");
  return await resolveUsdInrRate();
}

function usdToInrPaise(priceUsd: number, rate: number): { inrRupees: number; inrPaise: number } {
  const rupees = Math.round(priceUsd * rate);
  return { inrRupees: rupees, inrPaise: rupees * 100 };
}

/** Back-compat shim used by the pricing modal + legacy admin page. */
export const getUsdInrRate = createServerFn({ method: "GET" }).handler(async () => {
  const r = await resolveRate();
  return {
    rate: r.rate,
    updatedAt: r.fetchedAt,
    source: r.source,
    status: r.status,
    provider: r.provider,
    warning: r.warning,
    nextRefreshAt: r.nextRefreshAt,
  };
});

/** Admin: legacy setter — updates the manual fallback rate. */
export const setUsdInrRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rate: number }) => {
    const r = Number(input?.rate);
    if (!Number.isFinite(r) || r <= 0 || r > 1000) throw new Error("Invalid rate");
    return { rate: r };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as { rpc: (fn: "has_role", a: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }> };
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "usd_to_inr_manual_fallback", value: { rate: data.rate }, updated_by: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true, rate: data.rate };
  });

/** Public config for the browser Razorpay checkout (key_id + branding only — safe to expose). */
export const getRazorpayConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveRazorpayBranding } = await import("@/lib/razorpay-settings.server");
  const branding = await resolveRazorpayBranding();
  if (!branding?.keyId || !branding.enabled) throw new Error("Razorpay not configured");
  return branding;
});

/** Create a Razorpay order for a credit pack. Always billed in INR. */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { packId: string; currency?: string }) => {
    if (!input || typeof input.packId !== "string") throw new Error("packId required");
    return { packId: input.packId };
  })
  .handler(async ({ data, context }) => {
    const pack = CREDIT_PACKS.find((p) => p.id === data.packId);
    if (!pack) throw new Error("Unknown pack");

    const { resolveRazorpayCredentials } = await import("@/lib/razorpay-settings.server");
    const creds = await resolveRazorpayCredentials();
    const keyId = creds.keyId;
    const keySecret = creds.keySecret;

    const resolved = await resolveRate();
    const rate = resolved.rate;
    const priceUsdCents = Math.round(pack.priceUSD * 100);
    const { inrRupees, inrPaise } = usdToInrPaise(pack.priceUSD, rate);

    const shortUid = context.userId.replace(/-/g, "").slice(0, 12);
    const receipt = `rcpt_${shortUid}_${Date.now().toString(36)}`.slice(0, 40);

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: inrPaise,
        currency: "INR",
        receipt,
        notes: {
          user_id: context.userId,
          pack_id: pack.id,
          credits: pack.credits,
          usd_price: pack.priceUSD,
          usd_to_inr_rate: rate,
        },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Razorpay pack order error:", res.status, err);
      throw new Error(`Failed to create order (${res.status})`);
    }
    const order = (await res.json()) as { id: string; amount: number; currency: string };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("payments").insert({
      user_id: context.userId,
      razorpay_order_id: order.id,
      pack_id: pack.id,
      credits: pack.credits,
      amount_cents: inrPaise,
      currency: "INR",
      status: "pending",
      receipt_number: receipt,
      price_usd_cents: priceUsdCents,
      conversion_rate: rate,
      exchange_rate_source: resolved.source,
      exchange_rate_fetched_at: resolved.fetchedAt,
      amount_inr_paise: inrPaise,
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
      inrRupees,
      inrPaise,
      rate,
      pack: { id: pack.id, label: pack.label, credits: pack.credits, priceUSD: pack.priceUSD },
    };
  });

/** Create a Razorpay order for a plan. Always billed in INR. */
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
    const { resolveRazorpayCredentials } = await import("@/lib/razorpay-settings.server");
    const creds = await resolveRazorpayCredentials();
    const keyId = creds.keyId;
    const keySecret = creds.keySecret;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("pricing_plans")
      .select("*")
      .eq("id", data.planId)
      .maybeSingle();
    if (planErr || !planRow) throw new Error("Unknown plan");
    const plan = planRow as unknown as Record<string, unknown>;
    if (plan.contact_sales) throw new Error("Contact sales for this plan");

    const priceUsd =
      data.billingCycle === "monthly"
        ? Number(plan.price_monthly_usd ?? 0)
        : data.billingCycle === "yearly"
          ? Number(plan.price_yearly_usd ?? 0)
          : Number(plan.price_lifetime_usd ?? 0);
    if (!priceUsd || priceUsd <= 0) throw new Error("Plan is not purchasable for this billing cycle");

    const monthlyCredits = Number(plan.monthly_credits ?? 0);
    const includedCredits = Number(plan.included_credits ?? 0);
    const credits =
      data.billingCycle === "lifetime"
        ? includedCredits || monthlyCredits
        : data.billingCycle === "yearly"
          ? monthlyCredits * 12
          : monthlyCredits;

    const resolved = await resolveRate();
    const rate = resolved.rate;
    const priceUsdCents = Math.round(priceUsd * 100);
    const { inrRupees, inrPaise } = usdToInrPaise(priceUsd, rate);

    const shortUid = context.userId.replace(/-/g, "").slice(0, 12);
    const receipt = `rcpt_${shortUid}_${Date.now().toString(36)}`.slice(0, 40);

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: inrPaise,
        currency: "INR",
        receipt,
        notes: {
          user_id: context.userId,
          plan_id: String(plan.id),
          plan_code: String(plan.code),
          billing_cycle: data.billingCycle,
          credits,
          usd_price: priceUsd,
          usd_to_inr_rate: rate,
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
      amount_cents: inrPaise,
      currency: "INR",
      status: "pending",
      receipt_number: receipt,
      price_usd_cents: priceUsdCents,
      conversion_rate: rate,
      exchange_rate_source: resolved.source,
      exchange_rate_fetched_at: resolved.fetchedAt,
      amount_inr_paise: inrPaise,
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
      inrRupees,
      inrPaise,
      rate,
      plan: {
        id: String(plan.id),
        code: String(plan.code),
        name: String(plan.name),
        credits,
        priceUsd,
        billingCycle: data.billingCycle,
      },
    };
  });

/** Verify Razorpay checkout signature + finalize the payment. */
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
    const { resolveRazorpayCredentials } = await import("@/lib/razorpay-settings.server");
    const creds = await resolveRazorpayCredentials();
    const keySecret = creds.keySecret;

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

    // Claim the payment: only the first of checkout/webhook to flip it fulfils it.
    const { data: claimed, error: upErr } = await supabaseAdmin
      .from("payments")
      .update({ status: "success", razorpay_payment_id: data.razorpay_payment_id })
      .eq("id", payment.id)
      .eq("status", "pending")
      .select("id");
    if (upErr) throw new Error("Could not update payment");
    if (!claimed || claimed.length === 0) {
      return { ok: true, alreadyCredited: true, credits: payment.credits };
    }

    // Activate the plan or add the credit pack (shared with the webhook).
    const { fulfillOrderPayment } = await import("./billing.server");
    const result = await fulfillOrderPayment(supabaseAdmin, payment as never);
    return { ok: true, ...result };
  });

/** List the current user's payments (for the invoices page). */
export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payments")
      .select("id, razorpay_order_id, razorpay_payment_id, pack_id, credits, amount_cents, currency, status, receipt_number, created_at, price_usd_cents, conversion_rate, amount_inr_paise")
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
      .select("id, plan_name, plan_type, lifetime_access, included_credits, status, started_at, expires_at, renews_at, monthly_credit_limit, monthly_credits_used, unlimited_usage, auto_renew, payment_issue, razorpay_subscription_id")
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
      .select("id, razorpay_order_id, pack_id, credits, amount_cents, currency, status, created_at, price_usd_cents, conversion_rate, amount_inr_paise")
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
