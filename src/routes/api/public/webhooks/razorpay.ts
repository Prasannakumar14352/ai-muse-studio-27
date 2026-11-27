import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Razorpay webhook — backup path in case the browser-side verify never fires
 * (user closes tab after paying, network flake, etc.). Idempotent.
 *
 * Configure in Razorpay Dashboard → Webhooks:
 *   URL: https://<your-domain>/api/public/webhooks/razorpay
 *   Events: payment.captured, payment.failed, order.paid, and for auto-debit
 *     subscription.activated, subscription.charged, subscription.pending,
 *     subscription.halted, subscription.cancelled, subscription.completed
 *   Secret: same value as the webhook secret in Admin → Payment Settings
 */
export const Route = createFileRoute("/api/public/webhooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let secret: string | null = null;
        try {
          const { resolveRazorpayCredentials } = await import("@/lib/razorpay-settings.server");
          secret = (await resolveRazorpayCredentials()).webhookSecret;
        } catch {
          secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? null;
        }
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const body = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const eventId = request.headers.get("x-razorpay-event-id");

        async function log(fields: {
          status: number;
          verified: boolean;
          event?: string | null;
          orderId?: string | null;
          paymentId?: string | null;
          error?: string | null;
        }) {
          try {
            await supabaseAdmin.from("razorpay_webhook_events").insert({
              event_type: fields.event ?? null,
              razorpay_order_id: fields.orderId ?? null,
              razorpay_payment_id: fields.paymentId ?? null,
              signature_verified: fields.verified,
              http_status: fields.status,
              error_message: fields.error ?? null,
              headers: eventId ? { "x-razorpay-event-id": eventId } : {},
            });
          } catch (e) {
            console.error("webhook log failed:", e);
          }
        }

        if (!secret) {
          await log({ status: 500, verified: false, error: "RAZORPAY_WEBHOOK_SECRET not configured" });
          return new Response("Not configured", { status: 500 });
        }

        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          await log({ status: 401, verified: false, error: "Invalid signature" });
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: {
          event?: string;
          payload?: {
            payment?: { entity?: { id?: string; order_id?: string; status?: string; amount?: number; currency?: string } };
            subscription?: { entity?: { id?: string; status?: string; current_end?: number | null } };
          };
        };
        try { payload = JSON.parse(body); } catch {
          await log({ status: 400, verified: true, error: "Bad JSON" });
          return new Response("Bad JSON", { status: 400 });
        }

        const event = payload.event ?? "";

        // ── Auto-debit (Razorpay Subscriptions) ──
        if (event.startsWith("subscription.")) {
          const sub = payload.payload?.subscription?.entity;
          const pay = payload.payload?.payment?.entity;
          const subId = sub?.id ?? null;
          if (!subId) {
            await log({ status: 200, verified: true, event, error: "Ignored (no subscription id)" });
            return new Response("ok");
          }
          try {
            const result = await handleSubscriptionEvent(supabaseAdmin, event, {
              subscriptionId: subId,
              status: sub?.status ?? null,
              currentEnd: sub?.current_end ?? null,
              paymentId: pay?.id ?? null,
              orderId: pay?.order_id ?? null,
            });
            await log({ status: 200, verified: true, event, orderId: pay?.order_id ?? null, paymentId: pay?.id ?? null, error: result });
            return new Response("ok");
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            await log({ status: 500, verified: true, event, error: msg });
            return new Response("error", { status: 500 }); // Razorpay retries
          }
        }

        if (!["payment.captured", "payment.failed", "order.paid"].includes(event)) {
          return new Response("ok");
        }
        const payment = payload.payload?.payment?.entity;
        const orderId = payment?.order_id ?? null;
        const paymentId = payment?.id ?? null;

        if (!orderId || !paymentId) {
          await log({ status: 200, verified: true, event, orderId, paymentId, error: "Ignored (no order/payment id)" });
          return new Response("ok");
        }

        const { data: row, error: lookupError } = await supabaseAdmin
          .from("payments").select("*").eq("razorpay_order_id", orderId).maybeSingle();
        if (lookupError) {
          await log({ status: 503, verified: true, event, orderId, paymentId, error: "Payment lookup failed" });
          return new Response("Retry payment lookup", { status: 503 });
        }
        if (!row) {
          await log({ status: 200, verified: true, event, orderId, paymentId, error: "Order not found in payments" });
          return new Response("ok");
        }

        if (event === "payment.failed") {
          if (row.status === "pending") {
            const { error } = await supabaseAdmin.from("payments")
              .update({ status: "failed", razorpay_payment_id: paymentId })
              .eq("id", row.id).eq("status", "pending");
            if (error) return new Response("Retry payment status update", { status: 503 });
          }
          await log({ status: 200, verified: true, event, orderId, paymentId });
          return new Response("ok");
        }

        if (payment?.status !== "captured" || payment.amount !== (row.amount_inr_paise ?? row.amount_cents)
            || payment.currency !== row.currency) {
          await log({ status: 422, verified: true, event, orderId, paymentId, error: "Captured amount or currency did not match the order" });
          return new Response("Payment details do not match", { status: 422 });
        }

        if (row.status === "success") {
          await log({ status: 200, verified: true, event, orderId, paymentId, error: "Already credited (idempotent)" });
          return new Response("ok");
        }

        // Claim it: only the first of checkout/webhook to flip it fulfils it.
        const { data: claimed, error: upErr } = await supabaseAdmin.from("payments")
          .update({ status: "success", razorpay_payment_id: paymentId })
          .eq("id", row.id)
          .in("status", ["pending", "failed"])
          .select("id");
        if (upErr) {
          await log({ status: 500, verified: true, event, orderId, paymentId, error: `update failed: ${upErr.message}` });
          return new Response("update failed", { status: 500 });
        }
        if (!claimed || claimed.length === 0) {
          await log({ status: 200, verified: true, event, orderId, paymentId, error: "Already credited (idempotent)" });
          return new Response("ok");
        }

        // Plan → activate it; credit pack → add credits (same as checkout).
        const { fulfillOrderPayment } = await import("@/lib/billing.server");
        await fulfillOrderPayment(supabaseAdmin, row as never);

        await log({ status: 200, verified: true, event, orderId, paymentId });
        return new Response("ok");
      },
    },
  },
});

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Auto-debit lifecycle. Returns a short note for the webhook log. */
async function handleSubscriptionEvent(admin: Admin, event: string, e: {
  subscriptionId: string; status: string | null; currentEnd: number | null;
  paymentId: string | null; orderId: string | null;
}): Promise<string> {
  const { data: rs } = await admin.from("razorpay_subscriptions" as never)
    .select("user_id").eq("razorpay_subscription_id", e.subscriptionId).maybeSingle();
  const userId = (rs as { user_id?: string } | null)?.user_id;
  if (!userId) return "Ignored (subscription not created by this app)";
  const now = new Date().toISOString();
  const setRs = (status: string) => admin.from("razorpay_subscriptions" as never)
    .update({ status, current_end: e.currentEnd ? new Date(e.currentEnd * 1000).toISOString() : null, updated_at: now } as never)
    .eq("razorpay_subscription_id", e.subscriptionId);
  const isCurrent = async () => {
    const { data } = await admin.from("subscriptions").select("razorpay_subscription_id").eq("user_id", userId).maybeSingle();
    return (data as { razorpay_subscription_id?: string | null } | null)?.razorpay_subscription_id === e.subscriptionId;
  };

  switch (event) {
    case "subscription.charged": {
      if (!e.paymentId) return "Ignored (no payment)";
      const { applyAutopayCharge } = await import("@/lib/billing.server");
      const r = await applyAutopayCharge(admin, { subscriptionId: e.subscriptionId, paymentId: e.paymentId, orderId: e.orderId, currentEnd: e.currentEnd });
      return r.already ? "Charge already applied" : `Charge applied (+${r.credits} credits)`;
    }
    case "subscription.pending": {
      // A renewal failed; Razorpay keeps retrying.
      await setRs("pending");
      if (await isCurrent()) {
        await admin.from("subscriptions").update({ payment_issue: "retrying" } as never).eq("user_id", userId);
      }
      return "Renewal failed — retrying";
    }
    case "subscription.halted": {
      // All retries failed: back to Free; Billing shows why.
      await setRs("halted");
      if (await isCurrent()) {
        await admin.from("subscriptions").update({
          plan_name: "free", plan_type: "free", monthly_credit_limit: 0, monthly_credits_used: 0,
          renews_at: null, expires_at: null, auto_renew: false, razorpay_subscription_id: null,
          payment_issue: "halted", started_at: now,
        } as never).eq("user_id", userId);
      }
      return "Halted — user moved to Free";
    }
    case "subscription.cancelled":
    case "subscription.completed": {
      await setRs(event === "subscription.cancelled" ? "cancelled" : "completed");
      if (await isCurrent()) {
        const { data } = await admin.from("subscriptions").select("renews_at").eq("user_id", userId).maybeSingle();
        const endsAt = (data as { renews_at?: string | null } | null)?.renews_at
          ?? (e.currentEnd ? new Date(e.currentEnd * 1000).toISOString() : now);
        // Keep the plan until the paid period ends; the daily job then moves it to Free.
        await admin.from("subscriptions").update({ auto_renew: false, expires_at: endsAt } as never).eq("user_id", userId);
      }
      return "Auto-renew ended";
    }
    default:
      await setRs(e.status ?? event.replace("subscription.", ""));
      return "Status updated";
  }
}
