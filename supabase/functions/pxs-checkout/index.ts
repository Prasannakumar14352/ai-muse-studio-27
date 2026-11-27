// ProdXStore checkout API (public). Creates Razorpay orders, verifies payments.
// Secrets needed in Supabase: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clean = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f-]{36}$/i;

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
async function rzp(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${KEY_ID}:${KEY_SECRET}`) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description ?? "Razorpay error");
  return data;
}

async function startPayment(order: any, amount: number, kind: string, product: any) {
  const rOrder = await rzp("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount, currency: "INR", receipt: `${order.order_no}-${kind}`.slice(0, 40),
      notes: { source: "prodxstore", order_no: order.order_no, kind, product: order.product_name },
    }),
  });
  const { error } = await db.from("pxs_transactions").insert({
    order_id: order.id, product_id: order.product_id, product_name: order.product_name, kind,
    customer_name: order.customer_name, email: order.email, phone: order.phone,
    amount_paise: amount, razorpay_order_id: rOrder.id, status: "created",
  });
  if (error) throw error;
  return {
    key_id: KEY_ID, razorpay_order_id: rOrder.id, amount, currency: "INR",
    order_id: order.id, order_no: order.order_no, kind,
    product_name: order.product_name,
    prefill: { name: order.customer_name, email: order.email, contact: order.phone },
    thank_you_url: product?.thank_you_url ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!KEY_ID || !KEY_SECRET) return json({ error: "Payments are not configured yet" }, 503);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  try {
    // 1) New purchase: full price or deposit
    if (body.action === "create") {
      const slug = clean(body.slug, 80);
      const plan = body.plan === "deposit" ? "deposit" : "full";
      const name = clean(body.name, 80), email = clean(body.email, 120).toLowerCase(), phone = clean(body.phone, 20);
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || !/^\+?[0-9 ]{10,15}$/.test(phone))
        return json({ error: "Please enter a valid name, email and phone number" }, 400);

      const { data: product } = await db.from("pxs_products").select("*")
        .eq("slug", slug).eq("is_active", true).maybeSingle();
      if (!product) return json({ error: "Product not found" }, 404);
      if (product.coming_soon) return json({ error: "This product is coming soon" }, 400);
      if (product.external_checkout_url || product.currency !== "INR")
        return json({ error: "This product is not sold through this checkout" }, 400);
      if (plan === "deposit" && !product.deposit_paise) return json({ error: "Part payment is not available for this product" }, 400);

      const { data: order, error } = await db.from("pxs_orders").insert({
        product_id: product.id, product_name: product.name, customer_name: name, email, phone,
        payment_plan: plan, total_paise: product.price_paise,
      }).select().single();
      if (error) throw error;
      const amount = plan === "deposit" ? product.deposit_paise : product.price_paise;
      return json(await startPayment(order, amount, plan, product));
    }

    // 2) Look up an order (for the "pay balance" page)
    if (body.action === "order") {
      if (!UUID.test(body.order_id ?? "")) return json({ error: "Invalid order" }, 400);
      const { data: o } = await db.from("pxs_orders")
        .select("order_no, product_name, customer_name, total_paise, paid_paise, status, payment_plan")
        .eq("id", body.order_id).maybeSingle();
      if (!o) return json({ error: "Order not found" }, 404);
      return json({ ...o, balance_paise: Math.max(o.total_paise - o.paid_paise, 0) });
    }

    // 3) Pay the remaining balance of a deposit order
    if (body.action === "balance") {
      if (!UUID.test(body.order_id ?? "")) return json({ error: "Invalid order" }, 400);
      const { data: order } = await db.from("pxs_orders").select("*").eq("id", body.order_id).maybeSingle();
      if (!order) return json({ error: "Order not found" }, 404);
      const balance = order.total_paise - order.paid_paise;
      if (order.status !== "partially_paid" || balance <= 0) return json({ error: "Nothing left to pay on this order" }, 400);
      const { data: product } = await db.from("pxs_products").select("thank_you_url").eq("id", order.product_id).maybeSingle();
      return json(await startPayment(order, balance, "balance", product));
    }

    // 4) Verify the payment signature returned by Razorpay Checkout
    if (body.action === "verify") {
      const oid = clean(body.razorpay_order_id, 40), pid = clean(body.razorpay_payment_id, 40), sig = clean(body.razorpay_signature, 128);
      const expected = await hmacHex(KEY_SECRET, `${oid}|${pid}`);
      if (!oid || !pid || !safeEqual(expected, sig)) return json({ error: "Payment could not be verified" }, 400);

      let pay: any = null;
      try { pay = await rzp(`/payments/${pid}`); } catch { /* details are optional */ }
      const { data: tx, error } = await db.from("pxs_transactions").update({
        status: "success", razorpay_payment_id: pid, method: pay?.method ?? null,
        fee_paise: pay?.fee ?? null, tax_paise: pay?.tax ?? null,
        paid_at: pay?.created_at ? new Date(pay.created_at * 1000).toISOString() : new Date().toISOString(),
        raw: pay,
      }).eq("razorpay_order_id", oid).neq("status", "success").select().maybeSingle();
      if (error) throw error;

      const { data: final } = await db.from("pxs_transactions")
        .select("invoice_no, order_id, product_id, amount_paise, kind").eq("razorpay_order_id", oid).maybeSingle();
      const { data: order } = await db.from("pxs_orders").select("status, total_paise, paid_paise, order_no").eq("id", final?.order_id).maybeSingle();
      const { data: product } = await db.from("pxs_products").select("thank_you_url").eq("id", final?.product_id).maybeSingle();
      return json({
        ok: true, invoice_no: final?.invoice_no, order_no: order?.order_no, order_id: final?.order_id,
        order_status: order?.status, balance_paise: order ? Math.max(order.total_paise - order.paid_paise, 0) : 0,
        thank_you_url: order?.status === "paid" ? product?.thank_you_url ?? null : null,
        already_recorded: !tx,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
