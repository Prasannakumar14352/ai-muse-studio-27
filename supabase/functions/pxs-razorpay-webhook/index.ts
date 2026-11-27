// Razorpay webhook -> pxs_transactions. Backup path in case the buyer closes the tab
// before the checkout page verifies the payment. Also records payments made outside
// the checkout page (old payment links, etc.) so the dashboard shows everything.
// Secret needed in Supabase: RAZORPAY_WEBHOOK_SECRET
// Razorpay Dashboard > Webhooks: URL = https://<project>.supabase.co/functions/v1/pxs-razorpay-webhook
// Events: payment.captured, payment.failed, refund.processed
import { createClient } from "npm:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// CreatorFlow AI subscriptions/credit packs share this Razorpay account and are already counted by
// CreatorFlow's own payment records (shown in HQ). Skip them here so revenue is never counted twice.
function isCreatorFlowPayment(pay: any) {
  const n = pay?.notes && !Array.isArray(pay.notes) ? pay.notes : {};
  return Boolean(n.user_id || n.plan_id || n.plan_code || n.pack_id || n.credits || pay?.subscription_id);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET) return new Response("Webhook secret not configured", { status: 503 });

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!safeEqual(await hmacHex(WEBHOOK_SECRET, raw), sig)) return new Response("Bad signature", { status: 401 });

  const evt = JSON.parse(raw);
  const pay = evt?.payload?.payment?.entity;
  try {
    if ((evt.event === "payment.captured" || evt.event === "payment.failed") && pay) {
      const status = evt.event === "payment.captured" ? "success" : "failed";
      const fields = {
        razorpay_payment_id: pay.id, method: pay.method, fee_paise: pay.fee ?? null, tax_paise: pay.tax ?? null,
        paid_at: new Date(pay.created_at * 1000).toISOString(), raw: pay,
      };

      // Already recorded as success? Nothing to do (idempotent).
      const { data: done } = await db.from("pxs_transactions").select("id").eq("razorpay_payment_id", pay.id)
        .eq("status", "success").maybeSingle();
      if (done) return new Response("ok");

      // Payment started from our checkout page -> update that row
      const { data: tx } = pay.order_id
        ? await db.from("pxs_transactions").select("id, status").eq("razorpay_order_id", pay.order_id).maybeSingle()
        : { data: null };

      if (tx) {
        // Never downgrade a success to failed (UPI often fails once, then succeeds on retry)
        if (tx.status !== "success") {
          await db.from("pxs_transactions").update(
            status === "success" ? { ...fields, status } : { status: "failed", raw: pay },
          ).eq("id", tx.id);
        }
      } else if (status === "success" && !isCreatorFlowPayment(pay)) {
        // Payment made outside the checkout page (old link etc.)
        await db.from("pxs_transactions").upsert({
          ...fields, status, kind: "imported",
          product_name: pay.description || pay.notes?.product || "Razorpay payment",
          customer_name: pay.notes?.name ?? null,
          email: pay.email && pay.email !== "void@razorpay.com" ? pay.email : pay.notes?.email ?? null,
          phone: pay.contact ?? null, amount_paise: pay.amount, currency: pay.currency,
          razorpay_order_id: pay.order_id ?? null,
        }, { onConflict: "razorpay_payment_id" });
      }
    }

    if (evt.event === "refund.processed") {
      const refund = evt?.payload?.refund?.entity;
      if (refund?.payment_id) {
        await db.from("pxs_transactions").update({ status: "refunded" }).eq("razorpay_payment_id", refund.payment_id);
      }
    }
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 }); // Razorpay will retry
  }
  return new Response("ok");
});
