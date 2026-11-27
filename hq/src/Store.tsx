// ProdXStore store management inside HQ: sales (Razorpay checkout at pay.prodxstore.com),
// the product catalogue shown on prodxstore.com, reviews, contact messages, newsletter and offer banner.
// All reads/writes use the admin's own session; RLS on the pxs_* tables lets only admins through.
import { useCallback, useEffect, useMemo, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { supabase } from "./supabase";
import { ago, count, rupees } from "./format";

export const CHECKOUT_BASE = "https://pay.prodxstore.com";
export const STORE_BASE = "https://prodxstore.com";

// ---------- types ----------
export type Tx = {
  id: string; invoice_no: string | null; order_id: string | null; product_name: string | null; kind: string;
  customer_name: string | null; email: string | null; phone: string | null; amount_paise: number; gateway: string;
  razorpay_order_id: string | null; razorpay_payment_id: string | null; method: string | null; status: string;
  fee_paise: number | null; paid_at: string | null; created_at: string;
};
type Order = {
  id: string; order_no: string; product_name: string; customer_name: string | null; email: string | null; phone: string | null;
  payment_plan: string; total_paise: number; paid_paise: number; status: string; created_at: string;
};
type Product = {
  id: string; slug: string; name: string; tagline: string | null; description: string | null; price_paise: number;
  mrp_paise: number | null; deposit_paise: number | null; currency: string; gst_note: string | null; offer_badge: string | null;
  offer_ends_at: string | null; features: string[]; thank_you_url: string | null; is_active: boolean; category: string;
  image: string | null; gallery: string[]; badge: string | null; featured: boolean; display_order: number; show_in_store: boolean;
  coming_soon: boolean; landing_url: string | null; external_checkout_url: string | null; billing_period: string;
};
type Review = {
  id: string; product_id: string; customer_name: string; customer_email: string | null; rating: number; body: string;
  status: string; is_featured: boolean; created_at: string;
};
type Message = { id: string; name: string; email: string; topic: string; message: string; resolved: boolean; created_at: string };
type Sub = { id: string; email: string; created_at: string };
type Offer = { enabled: boolean; label: string; text: string; link_url: string; link_label: string; countdown_minutes: number };

type Data = { tx: Tx[]; orders: Order[]; products: Product[]; reviews: Review[]; messages: Message[]; subs: Sub[]; offer: Offer };
const EMPTY_OFFER: Offer = { enabled: false, label: "", text: "", link_url: "", link_label: "", countdown_minutes: 60 };

const TABS = [
  ["sales", "Sales"], ["orders", "Orders"], ["products", "Products"], ["reviews", "Reviews"],
  ["messages", "Messages"], ["subscribers", "Subscribers"], ["offer", "Offer banner"],
] as const;
type Tab = (typeof TABS)[number][0];

// ---------- helpers ----------
const paise = (p: number | null | undefined, cur = "INR") =>
  new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format((p ?? 0) / 100);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const KIND: Record<string, string> = { deposit: "Deposit", balance: "Balance", imported: "Imported" };
const ref = (id: string) => `PX-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
function download(name: string, rows: unknown[][]) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" }));
  a.download = name;
  a.click();
}
async function copy(text: string, done: (m: string) => void) {
  try { await navigator.clipboard.writeText(text); done("Copied"); } catch { done(text); }
}

async function loadData(): Promise<Data> {
  const [tx, orders, products, reviews, messages, subs, offer] = await Promise.all([
    supabase.from("pxs_transactions").select("*").order("created_at", { ascending: false }).limit(2000),
    supabase.from("pxs_orders").select("*").order("created_at", { ascending: false }).limit(2000),
    supabase.from("pxs_products").select("*").order("display_order").order("created_at"),
    supabase.rpc("pxs_admin_reviews"),
    supabase.from("pxs_messages").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("pxs_subscribers").select("*").order("created_at", { ascending: false }).limit(5000),
    supabase.from("pxs_settings").select("value").eq("key", "offer_banner").maybeSingle(),
  ]);
  const err = tx.error || orders.error || products.error || reviews.error || messages.error || subs.error;
  if (err) throw new Error(err.message);
  return {
    tx: (tx.data ?? []) as Tx[], orders: (orders.data ?? []) as Order[], products: (products.data ?? []) as Product[],
    reviews: (reviews.data ?? []) as Review[], messages: (messages.data ?? []) as Message[], subs: (subs.data ?? []) as Sub[],
    offer: { ...EMPTY_OFFER, ...((offer.data?.value as Partial<Offer>) ?? {}) },
  };
}

/** Successful store sales in rupees: today and within the last `days` days. Used by the combined revenue strip. */
export async function storeRevenue(days: number): Promise<{ today: number; range: number; month: number }> {
  const since = new Date(Date.now() - Math.max(days, 31) * 86_400_000).toISOString();
  const { data } = await supabase.from("pxs_transactions").select("amount_paise, paid_at").eq("status", "success").gte("paid_at", since);
  const now = new Date();
  const ist = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = ist(now), month = today.slice(0, 7), cutoff = Date.now() - days * 86_400_000;
  let t = 0, r = 0, m = 0;
  for (const row of (data ?? []) as Array<{ amount_paise: number; paid_at: string }>) {
    const d = new Date(row.paid_at), v = row.amount_paise / 100;
    if (ist(d) === today) t += v;
    if (d.getTime() >= cutoff) r += v;
    if (ist(d).startsWith(month)) m += v;
  }
  return { today: t, range: r, month: m };
}

// ---------- shell ----------
export function Store({ days }: { days: number }) {
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get("tab") as Tab) || "sales");
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setD(await loadData()); setError(null); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2200); return () => clearTimeout(t); }, [toast]);

  const pick = (t: Tab) => {
    setTab(t);
    const u = new URL(location.href); u.searchParams.set("tab", t); history.replaceState(null, "", u);
  };

  if (error) return <div className="alert">Couldn't load the store: {error}</div>;
  if (!d) return <div className="center muted">Loading store…</div>;

  const pendingReviews = d.reviews.filter((r) => r.status === "pending").length;
  const openMsgs = d.messages.filter((m) => !m.resolved).length;
  const badge = (t: Tab) => (t === "reviews" && pendingReviews ? pendingReviews : t === "messages" && openMsgs ? openMsgs : 0);
  const ctx = { d, reload, say: setToast };

  return (
    <main className="grid">
      <StoreTiles d={d} days={days} />
      <nav className="subtabs" aria-label="Store sections">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? "on" : ""} aria-pressed={tab === k} onClick={() => pick(k)}>
            {label}{badge(k) ? <span className="badge warn">{badge(k)}</span> : null}
          </button>
        ))}
        <span className="grow" />
        <a className="muted small" href={STORE_BASE} target="_blank" rel="noreferrer">prodxstore.com ↗</a>
      </nav>
      {tab === "sales" && <Sales {...ctx} />}
      {tab === "orders" && <Orders {...ctx} />}
      {tab === "products" && <Products {...ctx} />}
      {tab === "reviews" && <Reviews {...ctx} />}
      {tab === "messages" && <Messages {...ctx} />}
      {tab === "subscribers" && <Subscribers {...ctx} />}
      {tab === "offer" && <OfferForm {...ctx} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
type Ctx = { d: Data; reload: () => Promise<void>; say: (m: string) => void };

function StoreTiles({ d, days }: { d: Data; days: number }) {
  const ok = d.tx.filter((t) => t.status === "success");
  const ist = (s: string) => new Date(s).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = ist(new Date().toISOString());
  const cutoff = Date.now() - days * 86_400_000;
  const sum = (a: Tx[]) => a.reduce((s, t) => s + t.amount_paise, 0) / 100;
  const pending = d.orders.filter((o) => o.status === "partially_paid").reduce((s, o) => s + o.total_paise - o.paid_paise, 0) / 100;
  const tiles = [
    { label: "Store sales today", v: rupees(sum(ok.filter((t) => t.paid_at && ist(t.paid_at) === today))) },
    { label: `Last ${days} days`, v: rupees(sum(ok.filter((t) => t.paid_at && new Date(t.paid_at).getTime() >= cutoff))) },
    { label: "All-time", v: rupees(sum(ok)) },
    { label: "Successful payments", v: count(ok.length) },
    { label: "Balances to collect", v: rupees(pending) },
  ];
  return (
    <section className="tiles">
      {tiles.map((t) => <div className="tile" key={t.label}><span className="muted small">{t.label}</span><span className="hero">{t.v}</span></div>)}
    </section>
  );
}

function Card({ title, sub, right, children }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header><div><h2>{title}</h2>{sub && <span className="muted small">{sub}</span>}</div>{right}</header>
      {children}
    </section>
  );
}

function Search({ q, setQ, placeholder = "Search…" }: { q: string; setQ: (v: string) => void; placeholder?: string }) {
  return <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search" />;
}
const has = (q: string, ...vals: Array<string | null | undefined>) =>
  !q || vals.some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase()));

function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

const pill = (status: string) => {
  const tone = ["success", "paid"].includes(status) ? "" : ["failed", "cancelled"].includes(status) ? "bad" : "warn";
  const label = status === "created" ? "pending" : status.replace("_", " ");
  return <span className={`badge ${tone}`}>{label}</span>;
};

// ---------- Sales ----------
function Sales({ d }: Ctx) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<Tx | null>(null);
  const rows = d.tx.filter((t) => (status === "all" || t.status === status) &&
    has(q, t.invoice_no, t.customer_name, t.email, t.phone, t.product_name, t.razorpay_payment_id));
  const exportCsv = () => download(`prodxstore-sales-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["invoice", "customer", "email", "phone", "product", "type", "method", "amount_inr", "fee_inr", "status", "razorpay_payment_id", "paid_at"],
    ...rows.map((t) => [t.invoice_no, t.customer_name, t.email, t.phone, t.product_name, t.kind, t.method, t.amount_paise / 100,
      t.fee_paise != null ? t.fee_paise / 100 : "", t.status, t.razorpay_payment_id, t.paid_at]),
  ]);
  return (
    <Card title="Sales" sub="Every payment through pay.prodxstore.com, plus other Razorpay payments" right={
      <div className="controls">
        <Search q={q} setQ={setQ} placeholder="Name, email, invoice, product…" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {["all", "success", "created", "failed", "refunded"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s === "created" ? "pending" : s}</option>)}
        </select>
        <button onClick={exportCsv}>Export CSV</button>
      </div>}>
      {rows.length ? (
        <div className="table-scroll"><table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Product</th><th>Gateway</th><th>Date</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>{rows.map((t) => (
            <tr key={t.id}>
              <td><button className="link" onClick={() => setOpen(t)}>{t.invoice_no ?? "view"}</button></td>
              <td>{t.customer_name ?? "—"}<div className="muted small">{t.email ?? t.phone ?? ""}</div></td>
              <td>{t.product_name}{KIND[t.kind] && <span className="badge warn">{KIND[t.kind]}</span>}</td>
              <td>{t.gateway}<div className="muted small">{t.method ?? ""}</div></td>
              <td>{when(t.paid_at ?? t.created_at)}</td>
              <td className="num">{paise(t.amount_paise)}</td>
              <td>{pill(t.status)}</td>
            </tr>))}
          </tbody></table></div>
      ) : <p className="muted">No sales yet.</p>}
      {open && <Modal onClose={() => setOpen(null)}>
        <h2>{open.invoice_no ?? "Payment"}</h2>
        <p className="muted small">{open.product_name}{KIND[open.kind] ? ` · ${KIND[open.kind]}` : ""}</p>
        <table className="compact"><tbody>
          {([["Amount", paise(open.amount_paise)], ["Status", open.status], ["Customer", open.customer_name], ["Email", open.email],
            ["Phone", open.phone], ["Method", open.method], ["Razorpay payment", open.razorpay_payment_id], ["Razorpay order", open.razorpay_order_id],
            ["Razorpay fee (incl. GST)", open.fee_paise != null ? paise(open.fee_paise) : null],
            ["Net to you", open.fee_paise != null ? paise(open.amount_paise - open.fee_paise) : null], ["Paid at", when(open.paid_at)]] as Array<[string, string | null]>)
            .filter(([, v]) => v).map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v}</td></tr>)}
        </tbody></table>
        <div className="actions">
          {open.razorpay_payment_id && <a className="btn" target="_blank" rel="noreferrer" href={`https://dashboard.razorpay.com/app/payments/${encodeURIComponent(open.razorpay_payment_id)}`}>Open in Razorpay ↗</a>}
          <button onClick={() => setOpen(null)}>Close</button>
        </div>
      </Modal>}
    </Card>
  );
}

// ---------- Orders ----------
function Orders({ d, say }: Ctx) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const rows = d.orders.filter((o) => (status === "all" || o.status === status) && has(q, o.order_no, o.customer_name, o.email, o.phone, o.product_name));
  return (
    <Card title="Orders" sub="Created when someone starts checkout. Deposit orders show the balance still to collect." right={
      <div className="controls">
        <Search q={q} setQ={setQ} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {["all", "paid", "partially_paid", "pending", "cancelled"].map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s.replace("_", " ")}</option>)}
        </select>
      </div>}>
      {rows.length ? (
        <div className="table-scroll"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Plan</th><th>Date</th><th className="num">Total</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((o) => {
            const bal = o.total_paise - o.paid_paise;
            return (
              <tr key={o.id}>
                <td><b>{o.order_no}</b></td>
                <td>{o.customer_name ?? "—"}<div className="muted small">{o.email} {o.phone}</div></td>
                <td>{o.product_name}</td><td>{o.payment_plan === "deposit" ? "Deposit" : "Full"}</td>
                <td>{when(o.created_at)}</td>
                <td className="num">{paise(o.total_paise)}</td><td className="num">{paise(o.paid_paise)}</td>
                <td className="num">{bal > 0 ? paise(bal) : "—"}</td>
                <td>{pill(o.status)}</td>
                <td>{o.status === "partially_paid" && <button onClick={() => void copy(`${CHECKOUT_BASE}/order/${o.id}`, say)}>Copy balance link</button>}</td>
              </tr>);
          })}</tbody></table></div>
      ) : <p className="muted">No orders yet.</p>}
    </Card>
  );
}

// ---------- Products ----------
function Products({ d, reload, say }: Ctx) {
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const buyLink = (p: Product) => p.external_checkout_url || `${CHECKOUT_BASE}/checkout/${p.slug}`;
  return (
    <Card title="Products" sub="Shown on prodxstore.com automatically. INR products sell through Razorpay checkout; others link to their own page."
      right={<button className="primary-sm" onClick={() => setEditing({ is_active: true, show_in_store: true, currency: "INR", features: [], gallery: [], category: "Creator Tools", billing_period: "one-time", gst_note: "incl. GST", display_order: d.products.length + 1 })}>+ New product</button>}>
      <div className="table-scroll"><table>
        <thead><tr><th /><th>Product</th><th>Category</th><th className="num">Price</th><th className="num">MRP</th><th className="num">Deposit</th><th>On store</th><th>Checkout</th><th /></tr></thead>
        <tbody>{d.products.map((p) => (
          <tr key={p.id}>
            <td>{p.image ? <img className="thumb" src={p.image} alt="" /> : <span className="thumb empty" />}</td>
            <td><b>{p.name}</b>{p.badge && <span className="badge warn">{p.badge}</span>}<div className="muted small">/checkout/{p.slug}</div></td>
            <td>{p.category}</td>
            <td className="num">{paise(p.price_paise, p.currency)}</td>
            <td className="num">{p.mrp_paise ? paise(p.mrp_paise, p.currency) : "—"}</td>
            <td className="num">{p.deposit_paise ? paise(p.deposit_paise, p.currency) : "—"}</td>
            <td>{!p.is_active ? <span className="badge bad">hidden</span> : p.coming_soon ? <span className="badge warn">coming soon</span> : p.show_in_store ? <span className="badge">live</span> : <span className="badge">not listed</span>}</td>
            <td className="muted small">{p.external_checkout_url ? "Own page" : p.currency === "INR" ? "Razorpay" : "—"}</td>
            <td className="row-actions">
              <button onClick={() => void copy(buyLink(p), say)}>Copy buy link</button>
              <a className="btn" href={`${STORE_BASE}/product/${p.slug}`} target="_blank" rel="noreferrer">View</a>
              <button onClick={() => setEditing(p)}>Edit</button>
            </td>
          </tr>))}
        </tbody></table></div>
      {editing && <ProductEditor p={editing} all={d.products} onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await reload(); say("Saved — live on prodxstore.com"); }} />}
    </Card>
  );
}

function ProductEditor({ p, all, onClose, onSaved }: { p: Partial<Product>; all: Product[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const r = (v: number | null | undefined) => (v ? String(v / 100) : "");
  const local = (iso: string | null | undefined) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const [f, setF] = useState({
    name: p.name ?? "", slug: p.slug ?? "", category: p.category ?? "", tagline: p.tagline ?? "", description: p.description ?? "",
    image: p.image ?? "", gallery: (p.gallery ?? []).join("\n"), price: r(p.price_paise), currency: p.currency ?? "INR",
    mrp: r(p.mrp_paise), deposit: r(p.deposit_paise), gst_note: p.gst_note ?? "", billing_period: p.billing_period ?? "one-time",
    badge: p.badge ?? "", display_order: String(p.display_order ?? 0), offer_badge: p.offer_badge ?? "", offer_ends_at: local(p.offer_ends_at),
    features: (p.features ?? []).join("\n"), landing_url: p.landing_url ?? "", external_checkout_url: p.external_checkout_url ?? "",
    thank_you_url: p.thank_you_url ?? "", is_active: p.is_active ?? true, show_in_store: p.show_in_store ?? true,
    featured: p.featured ?? false, coming_soon: p.coming_soon ?? false,
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cats = useMemo(() => [...new Set(["Creator Tools", "AI Software", "AI Prompts", "Marketing", "Kids Learning", ...all.map((x) => x.category)])], [all]);
  const set = (k: keyof typeof f) => (e: { target: { value: string; type?: string; checked?: boolean } }) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? !!e.target.checked : e.target.value }));

  const upload = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) return setErr("Image must be under 8 MB");
    setErr("Uploading…");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("pxs-product-images").upload(path, file, { contentType: file.type });
    if (error) return setErr(`Upload failed: ${error.message}`);
    setF((s) => ({ ...s, image: supabase.storage.from("pxs-product-images").getPublicUrl(path).data.publicUrl }));
    setErr(null);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const toPaise = (v: string) => (v.trim() === "" ? null : Math.round(parseFloat(v) * 100));
    const lines = (v: string) => v.split("\n").map((s) => s.trim()).filter(Boolean);
    const row = {
      name: f.name.trim(), slug: f.slug.trim().toLowerCase(), category: f.category.trim() || "Creator Tools",
      tagline: f.tagline || null, description: f.description || null, image: f.image || null, gallery: lines(f.gallery),
      price_paise: toPaise(f.price) ?? 0, currency: f.currency, mrp_paise: toPaise(f.mrp), deposit_paise: toPaise(f.deposit),
      gst_note: f.gst_note || null, billing_period: f.billing_period || "one-time", badge: f.badge || null,
      display_order: parseInt(f.display_order || "0", 10), offer_badge: f.offer_badge || null,
      offer_ends_at: f.offer_ends_at ? new Date(f.offer_ends_at).toISOString() : null, features: lines(f.features),
      landing_url: f.landing_url || null, external_checkout_url: f.external_checkout_url || null, thank_you_url: f.thank_you_url || null,
      is_active: f.is_active, show_in_store: f.show_in_store, featured: f.featured, coming_soon: f.coming_soon,
      updated_at: new Date().toISOString(),
    };
    if (!/^[a-z0-9-]+$/.test(row.slug)) return setErr("URL slug: lowercase letters, numbers and dashes only.");
    if (row.currency !== "INR" && !row.external_checkout_url) return setErr("Razorpay checkout sells INR only — add an external checkout URL for USD products.");
    if (row.deposit_paise && row.deposit_paise >= row.price_paise) return setErr("Deposit must be less than the price.");
    setBusy(true);
    const { error } = p.id ? await supabase.from("pxs_products").update(row).eq("id", p.id) : await supabase.from("pxs_products").insert(row);
    setBusy(false);
    if (error) return setErr(error.code === "23505" ? "That URL slug is already used by another product." : error.message);
    await onSaved();
  };

  const T = ({ label, k, ...rest }: { label: string; k: keyof typeof f } & InputHTMLAttributes<HTMLInputElement>) =>
    <label className="field"><span>{label}</span><input value={f[k] as string} onChange={set(k)} {...rest} /></label>;
  const C = ({ label, k }: { label: string; k: keyof typeof f }) =>
    <label className="check"><input type="checkbox" checked={f[k] as boolean} onChange={set(k)} /> {label}</label>;

  return (
    <Modal onClose={onClose}>
      <form onSubmit={save} className="form">
        <h2>{p.id ? "Edit product" : "New product"}</h2>
        <label className="field"><span>Name</span><input required value={f.name} onChange={(e) => {
          const name = e.target.value;
          setF((s) => ({ ...s, name, slug: p.id ? s.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) }));
        }} /></label>
        <div className="row2">
          {T({ label: "URL slug (link: /checkout/slug)", k: "slug", required: true })}
          <label className="field"><span>Category</span><input list="pxs-cats" value={f.category} onChange={set("category")} />
            <datalist id="pxs-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></label>
        </div>
        {T({ label: "Tagline (one line)", k: "tagline" })}
        <label className="field"><span>Description</span><textarea rows={3} value={f.description} onChange={set("description")} /></label>
        <label className="field"><span>Cover image</span>
          <div className="img-row">
            {f.image ? <img className="thumb lg" src={f.image} alt="" /> : <span className="thumb lg empty" />}
            <input value={f.image} onChange={set("image")} placeholder="Paste an image URL or upload" />
            <label className="btn">Upload<input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} /></label>
          </div></label>
        <label className="field"><span>Gallery images (one URL per line)</span><textarea rows={2} value={f.gallery} onChange={set("gallery")} /></label>
        <div className="row2">
          {T({ label: "Price", k: "price", type: "number", step: "0.01", min: "0", required: true })}
          <label className="field"><span>Currency</span><select value={f.currency} onChange={set("currency")}><option>INR</option><option>USD</option></select></label>
        </div>
        <div className="row2">
          {T({ label: "MRP (shown struck out)", k: "mrp", type: "number", step: "0.01" })}
          {T({ label: "Deposit (blank = no part payment)", k: "deposit", type: "number", step: "0.01" })}
        </div>
        <div className="row2">
          {T({ label: "Price note", k: "gst_note", placeholder: "incl. GST" })}
          {T({ label: "Billing", k: "billing_period", placeholder: "one-time / per month" })}
        </div>
        <div className="row2">
          {T({ label: "Card badge", k: "badge", placeholder: "Best Seller / Trending" })}
          {T({ label: "Sort order (smaller = first)", k: "display_order", type: "number" })}
        </div>
        <div className="row2">
          {T({ label: "Checkout offer badge", k: "offer_badge", placeholder: "Black Friday offer is live now" })}
          {T({ label: "Offer ends (countdown)", k: "offer_ends_at", type: "datetime-local" })}
        </div>
        <label className="field"><span>Features (one per line)</span><textarea rows={4} value={f.features} onChange={set("features")} /></label>
        {T({ label: "Landing page URL (optional)", k: "landing_url" })}
        {T({ label: "External checkout URL (blank = sell with Razorpay here)", k: "external_checkout_url" })}
        {T({ label: "After-payment redirect URL (download / thank-you page)", k: "thank_you_url" })}
        <div className="checks">{C({ label: "Live", k: "is_active" })}{C({ label: "Show on prodxstore.com", k: "show_in_store" })}{C({ label: "Featured", k: "featured" })}{C({ label: "Coming soon", k: "coming_soon" })}</div>
        {err && <p className={err === "Uploading…" ? "muted small" : "tone-bad small"}>{err}</p>}
        <div className="actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
      </form>
    </Modal>
  );
}

// ---------- Reviews ----------
function Reviews({ d, reload, say }: Ctx) {
  const [status, setStatus] = useState("all");
  const name = (id: string) => d.products.find((p) => p.id === id)?.name ?? "—";
  const rows = d.reviews.filter((r) => status === "all" || r.status === status);
  const patch = async (id: string, body: Partial<Review>) => {
    const { error } = await supabase.from("pxs_reviews").update(body).eq("id", id);
    if (error) return say(error.message);
    await reload(); say("Review updated");
  };
  return (
    <Card title="Reviews" sub="Customers leave these on product pages. Approve to publish; tick Home page to feature it."
      right={<select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
        {["all", "pending", "approved", "rejected", "hidden"].map((s) => <option key={s} value={s}>{s === "all" ? "All" : s}</option>)}</select>}>
      {rows.length ? (
        <div className="table-scroll"><table>
          <thead><tr><th>Customer</th><th>Product</th><th>Rating</th><th>Review</th><th>Date</th><th>Status</th><th>Home page</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td>{r.customer_name}<div className="muted small">{r.customer_email}</div></td>
              <td>{name(r.product_id)}</td>
              <td className="stars">{"★".repeat(r.rating)}<span className="muted">{"★".repeat(5 - r.rating)}</span></td>
              <td className="wrap">{r.body}</td><td>{ago(r.created_at)}</td>
              <td><select value={r.status} onChange={(e) => void patch(r.id, { status: e.target.value })} aria-label="Review status">
                {["pending", "approved", "rejected", "hidden"].map((s) => <option key={s}>{s}</option>)}</select></td>
              <td><input type="checkbox" checked={r.is_featured} onChange={(e) => void patch(r.id, { is_featured: e.target.checked })} aria-label="Feature on home page" /></td>
            </tr>))}
          </tbody></table></div>
      ) : <p className="muted">No reviews here.</p>}
    </Card>
  );
}

// ---------- Messages ----------
function Messages({ d, reload, say }: Ctx) {
  const [show, setShow] = useState<"open" | "all">("open");
  const rows = d.messages.filter((m) => show === "all" || !m.resolved);
  const toggle = async (m: Message) => {
    const { error } = await supabase.from("pxs_messages").update({ resolved: !m.resolved }).eq("id", m.id);
    if (error) return say(error.message);
    await reload();
  };
  return (
    <Card title="Contact messages" sub="From the contact form on prodxstore.com. Reply from your email."
      right={<div className="seg">{(["open", "all"] as const).map((s) => <button key={s} className={show === s ? "on" : ""} onClick={() => setShow(s)}>{s === "open" ? "Open" : "All"}</button>)}</div>}>
      {rows.length ? (
        <div className="table-scroll"><table>
          <thead><tr><th>Ref</th><th>From</th><th>Topic</th><th>Message</th><th>Received</th><th /></tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.id} className={m.resolved ? "dim" : ""}>
              <td>{ref(m.id)}</td>
              <td>{m.name}<div className="small"><a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic} (${ref(m.id)})`)}`}>{m.email}</a></div></td>
              <td>{m.topic}</td><td className="wrap">{m.message}</td><td>{ago(m.created_at)}</td>
              <td><button onClick={() => void toggle(m)}>{m.resolved ? "Reopen" : "Mark resolved"}</button></td>
            </tr>))}
          </tbody></table></div>
      ) : <p className="muted">{show === "open" ? "No open messages." : "No messages yet."}</p>}
    </Card>
  );
}

// ---------- Subscribers ----------
function Subscribers({ d, reload, say }: Ctx) {
  const [q, setQ] = useState("");
  const rows = d.subs.filter((s) => has(q, s.email));
  const remove = async (s: Sub) => {
    if (!confirm(`Remove ${s.email} from the newsletter list?`)) return;
    const { error } = await supabase.from("pxs_subscribers").delete().eq("id", s.id);
    if (error) return say(error.message);
    await reload(); say("Removed");
  };
  return (
    <Card title="Newsletter subscribers" sub={`${count(d.subs.length)} people`} right={
      <div className="controls"><Search q={q} setQ={setQ} placeholder="Search email…" />
        <button onClick={() => download("prodxstore-subscribers.csv", [["email", "subscribed_at"], ...d.subs.map((s) => [s.email, s.created_at])])}>Export CSV</button></div>}>
      {rows.length ? (
        <div className="table-scroll"><table className="compact">
          <thead><tr><th>Email</th><th>Joined</th><th /></tr></thead>
          <tbody>{rows.map((s) => <tr key={s.id}><td>{s.email}</td><td>{when(s.created_at)}</td><td className="num"><button onClick={() => void remove(s)}>Remove</button></td></tr>)}</tbody>
        </table></div>
      ) : <p className="muted">No subscribers yet.</p>}
    </Card>
  );
}

// ---------- Offer banner ----------
function OfferForm({ d, reload, say }: Ctx) {
  const [o, setO] = useState<Offer>(d.offer);
  const [err, setErr] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (o.link_url && !/^https:\/\//.test(o.link_url)) return setErr("The link must start with https://");
    const { error } = await supabase.from("pxs_settings").upsert({ key: "offer_banner", value: o, updated_at: new Date().toISOString() });
    if (error) return setErr(error.message);
    setErr(null); await reload(); say("Banner saved — live on prodxstore.com");
  };
  return (
    <Card title="Offer banner" sub="The thin bar at the top of prodxstore.com">
      <form className="form narrow" onSubmit={save}>
        <label className="check"><input type="checkbox" checked={o.enabled} onChange={(e) => setO({ ...o, enabled: e.target.checked })} /> Show the offer banner</label>
        <div className="row2">
          <label className="field"><span>Label</span><input maxLength={40} value={o.label} onChange={(e) => setO({ ...o, label: e.target.value })} /></label>
          <label className="field"><span>Countdown (minutes, 0 = none)</span><input type="number" min={0} max={1440} value={o.countdown_minutes} onChange={(e) => setO({ ...o, countdown_minutes: Number(e.target.value) })} /></label>
        </div>
        <label className="field"><span>Text</span><input maxLength={160} value={o.text} onChange={(e) => setO({ ...o, text: e.target.value })} /></label>
        <div className="row2">
          <label className="field"><span>Button link</span><input placeholder="https://" value={o.link_url} onChange={(e) => setO({ ...o, link_url: e.target.value })} /></label>
          <label className="field"><span>Button text</span><input maxLength={30} value={o.link_label} onChange={(e) => setO({ ...o, link_label: e.target.value })} /></label>
        </div>
        {err && <p className="tone-bad small">{err}</p>}
        <div className="actions"><button className="primary-sm">Save banner</button></div>
      </form>
    </Card>
  );
}
