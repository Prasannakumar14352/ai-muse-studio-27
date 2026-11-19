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

type Quote = import("@/lib/offers.server").OfferQuote;

/** Price an offer for this checkout; a bad code becomes a clear error for the buyer. */
async function quoteOrThrow(
  db: unknown,
  args: Parameters<typeof import("@/lib/offers.server").quoteOffer>[1],
): Promise<Quote | null> {
  const { quoteOffer, OfferError } = await import("@/lib/offers.server");
  try {
    return await quoteOffer(db, args);
  } catch (e) {
    if (e instanceof OfferError) throw new Error(e.message);
    // The offers table missing / unreadable must never block a normal purchase.
    if (args.code) throw new Error("Couldn't check that code right now. Try again, or pay without it.");
    console.error("offer lookup failed", e);
    return null;
  }
}

function offerMetadata(q: Quote | null): Record<string, unknown> {
  if (!q) return {};
  return {
    offer: {
      id: q.offerId, code: q.code, label: q.label,
      original_paise: q.originalPaise, discount_paise: q.discountPaise, bonus_credits: q.bonusCredits,
    },
  };
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
  .inputValidator((input: { packId: string; currency?: string; offerCode?: string }) => {
    if (!input || typeof input.packId !== "string") throw new Error("packId required");
    const offerCode = typeof input.offerCode === "string" ? input.offerCode.trim().slice(0, 40) : "";
    return { packId: input.packId, offerCode };
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
    const base = usdToInrPaise(pack.priceUSD, rate);

    const { supabaseAdmin: offerDb } = await import("@/integrations/supabase/client.server");
    const quote = await quoteOrThrow(offerDb, {
      code: data.offerCode, userId: context.userId, kind: "packs", amountPaise: base.inrPaise, credits: pack.credits,
    });
    const inrPaise = quote?.finalPaise ?? base.inrPaise;
    const inrRupees = Math.round(inrPaise / 100);
    const totalCredits = pack.credits + (quote?.bonusCredits ?? 0);

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
          credits: totalCredits,
          ...(quote ? { offer_code: quote.code, offer_discount_paise: quote.discountPaise } : {}),
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
      credits: totalCredits,
      amount_cents: inrPaise,
      currency: "INR",
      status: "pending",
      receipt_number: receipt,
      price_usd_cents: priceUsdCents,
      conversion_rate: rate,
      exchange_rate_source: resolved.source,
      exchange_rate_fetched_at: resolved.fetchedAt,
      amount_inr_paise: inrPaise,
      metadata: offerMetadata(quote),
    } as never);
    if (error) {
      console.error("payments insert error:", error);
      throw new Error("Could not record payment");
    }
    if (quote) {
      const { recordPendingRedemption } = await import("@/lib/offers.server");
      await recordPendingRedemption(supabaseAdmin, { quote, userId: context.userId, paymentRef: order.id, kind: "packs" });
    }

    return {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      inrRupees,
      inrPaise,
      rate,
      pack: { id: pack.id, label: pack.label, credits: totalCredits, priceUSD: pack.priceUSD },
      offer: quote ? { code: quote.code, label: quote.label, discountPaise: quote.discountPaise, bonusCredits: quote.bonusCredits } : null,
    };
  });

/** Create a Razorpay order for a plan. Always billed in INR. */
export const createRazorpayPlanOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; billingCycle: "monthly" | "yearly" | "lifetime"; offerCode?: string }) => {
    if (!input || typeof input.planId !== "string") throw new Error("planId required");
    const cycle = input.billingCycle;
    if (cycle !== "monthly" && cycle !== "yearly" && cycle !== "lifetime") {
      throw new Error("Invalid billingCycle");
    }
    const offerCode = typeof input.offerCode === "string" ? input.offerCode.trim().slice(0, 40) : "";
    return { planId: input.planId, billingCycle: cycle, offerCode };
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
    const base = usdToInrPaise(priceUsd, rate);
    const quote = await quoteOrThrow(supabaseAdmin, {
      code: data.offerCode, userId: context.userId, kind: data.billingCycle,
      planCode: String(plan.code), amountPaise: base.inrPaise, credits,
    });
    const inrPaise = quote?.finalPaise ?? base.inrPaise;
    const inrRupees = Math.round(inrPaise / 100);

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
          ...(quote ? { offer_code: quote.code, offer_discount_paise: quote.discountPaise, offer_bonus_credits: quote.bonusCredits } : {}),
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
      credits: credits + (quote?.bonusCredits ?? 0),
      amount_cents: inrPaise,
      currency: "INR",
      status: "pending",
      receipt_number: receipt,
      price_usd_cents: priceUsdCents,
      conversion_rate: rate,
      exchange_rate_source: resolved.source,
      exchange_rate_fetched_at: resolved.fetchedAt,
      amount_inr_paise: inrPaise,
      metadata: offerMetadata(quote),
    } as never);
    if (error) {
      console.error("payments insert error:", error);
      throw new Error("Could not record payment");
    }
    if (quote) {
      const { recordPendingRedemption } = await import("@/lib/offers.server");
      await recordPendingRedemption(supabaseAdmin, { quote, userId: context.userId, paymentRef: order.id, kind: data.billingCycle });
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
        credits: credits + (quote?.bonusCredits ?? 0),
        priceUsd,
        billingCycle: data.billingCycle,
      },
      offer: quote ? { code: quote.code, label: quote.label, discountPaise: quote.discountPaise, bonusCredits: quote.bonusCredits } : null,
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

/**
 * Price preview for the checkout UI: what this code (or an auto-applied
 * festival offer) does to this exact purchase. Display only — the real amount
 * is recomputed when the order / subscription is created.
 */
export const previewOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    code?: string;
    target: { kind: "pack"; packId: string } | { kind: "plan"; planId: string; cycle: "monthly" | "yearly" | "lifetime" } | { kind: "autopay"; planCode: string; cycle: "monthly" | "yearly" };
  }) => {
    if (!input?.target) throw new Error("target required");
    return { code: typeof input.code === "string" ? input.code.trim().slice(0, 40) : "", target: input.target };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t = data.target;
    let amountPaise = 0;
    let credits = 0;
    let planCode: string | null = null;
    let cycle: "monthly" | "yearly" | null = null;
    let kind: import("@/lib/offers.server").OfferKind = "packs";
    if (t.kind === "pack") {
      const pack = CREDIT_PACKS.find((p) => p.id === t.packId);
      if (!pack) throw new Error("Unknown pack");
      amountPaise = usdToInrPaise(pack.priceUSD, (await resolveRate()).rate).inrPaise;
      credits = pack.credits;
    } else if (t.kind === "plan") {
      const { data: row } = await supabaseAdmin.from("pricing_plans").select("*").eq("id", t.planId).maybeSingle();
      const plan = row as Record<string, unknown> | null;
      if (!plan) throw new Error("Unknown plan");
      const usd = t.cycle === "monthly" ? Number(plan.price_monthly_usd ?? 0) : t.cycle === "yearly" ? Number(plan.price_yearly_usd ?? 0) : Number(plan.price_lifetime_usd ?? 0);
      amountPaise = usdToInrPaise(usd, (await resolveRate()).rate).inrPaise;
      const mc = Number(plan.monthly_credits ?? 0);
      credits = t.cycle === "lifetime" ? (Number(plan.included_credits ?? 0) || mc) : t.cycle === "yearly" ? mc * 12 : mc;
      planCode = String(plan.code);
      kind = t.cycle;
    } else {
      const { listAutopayPlans, loadPricingPlan, planCredits } = await import("./billing.server");
      const rzp = (await listAutopayPlans(supabaseAdmin)).find((p) => p.planCode === t.planCode && p.cycle === t.cycle);
      const plan = await loadPricingPlan(supabaseAdmin, t.planCode);
      if (!rzp || !plan) throw new Error("Auto-renew isn't available for this plan");
      amountPaise = rzp.amountPaise;
      credits = planCredits(plan, t.cycle);
      planCode = t.planCode;
      cycle = t.cycle;
      kind = "autopay";
    }
    const { quoteOffer, OfferError } = await import("@/lib/offers.server");
    try {
      const q = await quoteOffer(supabaseAdmin, { code: data.code, userId: context.userId, kind, planCode, cycle, amountPaise, credits });
      return { ok: true as const, quote: q, error: null };
    } catch (e) {
      if (e instanceof OfferError) return { ok: false as const, quote: null, error: e.message };
      if (!data.code) return { ok: true as const, quote: null, error: null };
      return { ok: false as const, quote: null, error: "Couldn't check that code right now." };
    }
  });
