import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Razorpay webhook — backup path in case the browser-side verify never fires
 * (user closes tab after paying, network flake, etc.). Idempotent.
 *
 * Configure in Razorpay Dashboard → Webhooks:
 *   URL: https://<your-domain>/api/public/webhooks/razorpay
 *   Events: payment.captured, payment.failed, order.paid
 *   Secret: same value stored as RAZORPAY_WEBHOOK_SECRET
 */
export const Route = createFileRoute("/api/public/webhooks/razorpay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const body = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const headersObj: Record<string, string> = {};
        request.headers.forEach((v, k) => {
          if (!/authorization|cookie/i.test(k)) headersObj[k] = v;
        });

        async function log(fields: {
          status: number;
          verified: boolean;
          event?: string | null;
          orderId?: string | null;
          paymentId?: string | null;
          error?: string | null;
          payload?: unknown;
        }) {
          try {
            await supabaseAdmin.from("razorpay_webhook_events").insert({
              event_type: fields.event ?? null,
              razorpay_order_id: fields.orderId ?? null,
              razorpay_payment_id: fields.paymentId ?? null,
              signature_verified: fields.verified,
              http_status: fields.status,
              error_message: fields.error ?? null,
              raw_payload: fields.payload ?? null,
              headers: headersObj,
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
          payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } };
        };
        try { payload = JSON.parse(body); } catch {
          await log({ status: 400, verified: true, error: "Bad JSON" });
          return new Response("Bad JSON", { status: 400 });
        }

        const event = payload.event ?? "";
        const payment = payload.payload?.payment?.entity;
        const orderId = payment?.order_id ?? null;
        const paymentId = payment?.id ?? null;

        if (!orderId || !paymentId) {
          await log({ status: 200, verified: true, event, orderId, paymentId, payload, error: "Ignored (no order/payment id)" });
          return new Response("ok");
        }

        const { data: row } = await supabaseAdmin
          .from("payments").select("*").eq("razorpay_order_id", orderId).maybeSingle();
        if (!row) {
          await log({ status: 200, verified: true, event, orderId, paymentId, payload, error: "Order not found in payments" });
          return new Response("ok");
        }

        if (event === "payment.failed") {
          if (row.status === "pending") {
            await supabaseAdmin.from("payments")
              .update({ status: "failed", razorpay_payment_id: paymentId })
              .eq("id", row.id);
          }
          await log({ status: 200, verified: true, event, orderId, paymentId, payload });
          return new Response("ok");
        }

        if (row.status === "success") {
          await log({ status: 200, verified: true, event, orderId, paymentId, payload, error: "Already credited (idempotent)" });
          return new Response("ok");
        }

        const { error: upErr } = await supabaseAdmin.from("payments")
          .update({ status: "success", razorpay_payment_id: paymentId })
          .eq("id", row.id)
          .eq("status", "pending");
        if (upErr) {
          await log({ status: 500, verified: true, event, orderId, paymentId, payload, error: `update failed: ${upErr.message}` });
          return new Response("update failed", { status: 500 });
        }

        const { data: profile } = await supabaseAdmin
          .from("profiles").select("user_credits").eq("id", row.user_id).maybeSingle();
        const current = profile?.user_credits ?? 0;
        await supabaseAdmin.from("profiles")
          .update({ user_credits: current + row.credits })
          .eq("id", row.user_id);

        await log({ status: 200, verified: true, event, orderId, paymentId, payload });
        return new Response("ok");
      },
    },
  },
});
