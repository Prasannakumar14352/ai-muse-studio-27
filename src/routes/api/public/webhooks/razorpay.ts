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
        if (!secret) return new Response("Not configured", { status: 500 });

        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const body = await request.text();

        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: {
          event?: string;
          payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } };
        };
        try { payload = JSON.parse(body); } catch { return new Response("Bad JSON", { status: 400 }); }

        const event = payload.event ?? "";
        const payment = payload.payload?.payment?.entity;
        const orderId = payment?.order_id;
        const paymentId = payment?.id;

        if (!orderId || !paymentId) return new Response("ok"); // ignore other events

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row } = await supabaseAdmin
          .from("payments").select("*").eq("razorpay_order_id", orderId).maybeSingle();
        if (!row) return new Response("ok"); // not our order

        if (event === "payment.failed") {
          if (row.status === "pending") {
            await supabaseAdmin.from("payments")
              .update({ status: "failed", razorpay_payment_id: paymentId })
              .eq("id", row.id);
          }
          return new Response("ok");
        }

        // captured / order.paid → credit user (idempotent)
        if (row.status === "success") return new Response("ok");

        const { error: upErr } = await supabaseAdmin.from("payments")
          .update({ status: "success", razorpay_payment_id: paymentId })
          .eq("id", row.id)
          .eq("status", "pending");
        if (upErr) return new Response("update failed", { status: 500 });

        const { data: profile } = await supabaseAdmin
          .from("profiles").select("user_credits").eq("id", row.user_id).maybeSingle();
        const current = profile?.user_credits ?? 0;
        await supabaseAdmin.from("profiles")
          .update({ user_credits: current + row.credits })
          .eq("id", row.user_id);

        return new Response("ok");
      },
    },
  },
});
