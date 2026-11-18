// Auto-debit (Razorpay Subscriptions) for monthly / yearly plans.
//
// Flow: createAutopaySubscription → Razorpay checkout with subscription_id
// (user approves UPI AutoPay / card mandate and pays the first charge) →
// verifyAutopaySubscription activates the plan. Renewals, failures and
// cancellations arrive on the webhook (/api/public/webhooks/razorpay).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Which plans can be bought with auto-renew, and their INR price. Public. */
export const getAutopayOptions = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listAutopayPlans } = await import("./billing.server");
    const plans = await listAutopayPlans(supabaseAdmin);
    return plans.map((p) => ({ planCode: p.planCode, cycle: p.cycle, amountPaise: p.amountPaise }));
  } catch {
    return []; // Razorpay not configured yet → one-time payments only.
  }
});

/** Admin: re-read plans from Razorpay now (after creating/renaming plans). */
export const refreshAutopayPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Forbidden");
    const { listAutopayPlans } = await import("./billing.server");
    const plans = await listAutopayPlans(supabaseAdmin, { refresh: true });
    return plans;
  });

export const createAutopaySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    planCode: z.string().min(1),
    cycle: z.enum(["monthly", "yearly"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listAutopayPlans, loadPricingPlan, razorpayApi, AUTOPAY_TOTAL_COUNT, planCredits } = await import("./billing.server");
    const { resolveRazorpayCredentials } = await import("./razorpay-settings.server");

    const plan = await loadPricingPlan(supabaseAdmin, data.planCode);
    if (!plan || !plan.active) throw new Error("Unknown plan");
    const rzpPlan = (await listAutopayPlans(supabaseAdmin)).find((p) => p.planCode === data.planCode && p.cycle === data.cycle);
    if (!rzpPlan) throw new Error("Auto-renew isn't available for this plan yet. Please pay once instead.");

    const creds = await resolveRazorpayCredentials();
    const sub = await razorpayApi<{ id: string; status: string }>("/subscriptions", {
      method: "POST",
      body: {
        plan_id: rzpPlan.razorpayPlanId,
        total_count: AUTOPAY_TOTAL_COUNT[data.cycle],
        quantity: 1,
        customer_notify: 1,
        notes: { user_id: context.userId, plan_code: data.planCode, cycle: data.cycle },
      },
    });
    const { error } = await supabaseAdmin.from("razorpay_subscriptions" as never).insert({
      user_id: context.userId,
      plan_code: data.planCode,
      cycle: data.cycle,
      razorpay_subscription_id: sub.id,
      razorpay_plan_id: rzpPlan.razorpayPlanId,
      amount_paise: rzpPlan.amountPaise,
      status: sub.status ?? "created",
      environment: creds.environment,
    } as never);
    if (error) throw new Error("Could not start subscription");

    return {
      subscriptionId: sub.id,
      keyId: creds.keyId,
      amountPaise: rzpPlan.amountPaise,
      planName: String(plan.name),
      credits: planCredits(plan, data.cycle),
    };
  });

export const verifyAutopaySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    razorpay_payment_id: z.string().min(1),
    razorpay_subscription_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { resolveRazorpayCredentials } = await import("./razorpay-settings.server");
    const creds = await resolveRazorpayCredentials();
    const { createHmac, timingSafeEqual } = await import("crypto");
    const expected = createHmac("sha256", creds.keySecret)
      .update(`${data.razorpay_payment_id}|${data.razorpay_subscription_id}`).digest("hex");
    const a = Buffer.from(data.razorpay_signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Invalid payment signature");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rs } = await supabaseAdmin.from("razorpay_subscriptions" as never)
      .select("user_id").eq("razorpay_subscription_id", data.razorpay_subscription_id).maybeSingle();
    if (!rs || (rs as { user_id: string }).user_id !== context.userId) throw new Error("Subscription not found");

    // Current period end, so Billing shows the right next charge date.
    const { razorpayApi } = await import("./billing.server");
    let currentEnd: number | null = null;
    let orderId: string | null = null;
    try {
      const sub = await razorpayApi<{ current_end?: number | null }>(`/subscriptions/${data.razorpay_subscription_id}`);
      currentEnd = sub.current_end ?? null;
      const pay = await razorpayApi<{ order_id?: string | null }>(`/payments/${data.razorpay_payment_id}`);
      orderId = pay.order_id ?? null;
    } catch { /* fall back to +1 period */ }

    const { applyAutopayCharge } = await import("./billing.server");
    const r = await applyAutopayCharge(supabaseAdmin, {
      subscriptionId: data.razorpay_subscription_id, paymentId: data.razorpay_payment_id, orderId, currentEnd,
    });
    return { ok: true, credits: r.credits };
  });

/** Stop auto-renew. The plan stays active until the end of the paid period. */
export const cancelAutopay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin.from("subscriptions")
      .select("razorpay_subscription_id, renews_at, auto_renew").eq("user_id", context.userId).maybeSingle();
    const s = sub as { razorpay_subscription_id: string | null; renews_at: string | null; auto_renew: boolean } | null;
    if (!s?.razorpay_subscription_id || !s.auto_renew) throw new Error("Auto-renew isn't active on your plan");

    const { razorpayApi } = await import("./billing.server");
    await razorpayApi(`/subscriptions/${s.razorpay_subscription_id}/cancel`, {
      method: "POST", body: { cancel_at_cycle_end: 1 },
    });
    await supabaseAdmin.from("subscriptions").update({
      auto_renew: false,
      expires_at: s.renews_at, // plan ends when the paid period ends
    } as never).eq("user_id", context.userId);
    await supabaseAdmin.from("razorpay_subscriptions" as never).update({
      status: "cancel_scheduled", updated_at: new Date().toISOString(),
    } as never).eq("razorpay_subscription_id", s.razorpay_subscription_id);
    return { ok: true, endsAt: s.renews_at };
  });
