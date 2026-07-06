import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_PACKS, PLANS } from "@/lib/constants";


/** Public config for the browser Razorpay checkout (key_id only — safe to expose). */
export const getRazorpayConfig = createServerFn({ method: "GET" }).handler(async () => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new Error("Razorpay not configured");
  return { keyId };
});

/** Create a Razorpay order for a credit pack + record a pending payment row. */
export const createRazorpayOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { packId: string }) => {
    if (!input || typeof input.packId !== "string") throw new Error("packId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const pack = CREDIT_PACKS.find((p) => p.id === data.packId);
    if (!pack) throw new Error("Unknown pack");

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay not configured");

    const amountCents = Math.round(pack.priceUSD * 100);
    const shortUid = context.userId.replace(/-/g, "").slice(0, 12);
    const receipt = `rcpt_${shortUid}_${Date.now().toString(36)}`.slice(0, 40);

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: "USD",
        receipt,
        notes: { user_id: context.userId, pack_id: pack.id, credits: pack.credits },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Razorpay order error:", res.status, errText);
      throw new Error(`Failed to create order (${res.status})`);
    }
    const order = await res.json() as { id: string; amount: number; currency: string };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("payments").insert({
      user_id: context.userId,
      razorpay_order_id: order.id,
      pack_id: pack.id,
      credits: pack.credits,
      amount_cents: amountCents,
      currency: "USD",
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
      pack: { id: pack.id, label: pack.label, credits: pack.credits, priceUSD: pack.priceUSD },
    };
  });

/** Create a Razorpay order for a subscription plan (charged as one-time credit purchase). */
export const createRazorpayPlanOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => {
    if (!input || typeof input.planId !== "string") throw new Error("planId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const plan = PLANS.find((p) => p.id === data.planId);
    if (!plan) throw new Error("Unknown plan");
    if (plan.contactSales) throw new Error("Contact sales for this plan");
    const priceNum = Number(plan.price.replace(/[^0-9.]/g, ""));
    if (!priceNum || priceNum <= 0) throw new Error("Plan is not purchasable");

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error("Razorpay not configured");

    const credits = plan.monthlyCredits + (plan.signupCredits ?? 0);
    const amountCents = Math.round(priceNum * 100);
    const shortUid = context.userId.replace(/-/g, "").slice(0, 12);
    const receipt = `rcpt_${shortUid}_${Date.now().toString(36)}`.slice(0, 40);

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount: amountCents,
        currency: "USD",
        receipt,
        notes: { user_id: context.userId, plan_id: plan.id, credits },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("Razorpay plan order error:", res.status, errText);
      throw new Error(`Failed to create order (${res.status})`);
    }
    const order = await res.json() as { id: string; amount: number; currency: string };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("payments").insert({
      user_id: context.userId,
      razorpay_order_id: order.id,
      pack_id: `plan_${plan.id}`,
      credits,
      amount_cents: amountCents,
      currency: "USD",
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
      plan: { id: plan.id, name: plan.name, credits, priceUSD: priceNum },
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

    // Mark success + add credits atomically-ish (best-effort)
    const { error: upErr } = await supabaseAdmin
      .from("payments")
      .update({ status: "success", razorpay_payment_id: data.razorpay_payment_id })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (upErr) throw new Error("Could not update payment");

    // Add credits to profile
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
