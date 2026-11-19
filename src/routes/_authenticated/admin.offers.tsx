import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { useAccess } from "@/lib/access";
import { listOffers, saveOffer, setOfferActive, deleteOffer, type AdminOffer } from "@/lib/offers.functions";
import { listPricingPlans } from "@/lib/pricing.functions";

export const Route = createFileRoute("/_authenticated/admin/offers")({
  head: () => ({ meta: [{ title: "Offers & codes — CreatorFlow AI" }] }),
  component: OffersPage,
});

const KINDS = [
  { id: "packs", label: "Credit packs" },
  { id: "monthly", label: "Monthly (pay once)" },
  { id: "yearly", label: "Yearly (pay once)" },
  { id: "lifetime", label: "Lifetime" },
  { id: "autopay", label: "Auto-renew plans" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

type Form = {
  id?: string;
  code: string; title: string;
  discountType: "percent" | "flat_inr" | "bonus_credits"; discountValue: string;
  appliesTo: Kind[]; planCodes: string[];
  recurring: "first" | "cycles" | "forever"; recurringCycles: string;
  razorpayOfferId: string;
  startsAt: string; endsAt: string;
  maxRedemptions: string; perUserLimit: string; minAmountInr: string;
  active: boolean; showBanner: boolean; bannerText: string; autoApply: boolean;
};

const EMPTY: Form = {
  code: "", title: "", discountType: "percent", discountValue: "20",
  appliesTo: ["packs", "monthly", "yearly", "lifetime", "autopay"], planCodes: [],
  recurring: "first", recurringCycles: "3", razorpayOfferId: "",
  startsAt: "", endsAt: "", maxRedemptions: "", perUserLimit: "1", minAmountInr: "0",
  active: true, showBanner: false, bannerText: "", autoApply: false,
};

/** ISO → <input type="datetime-local"> in the admin's time zone. */
function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16);
}
const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

function status(o: AdminOffer): { text: string; cls: string } {
  const now = Date.now();
  if (!o.active) return { text: "Off", cls: "bg-white/10 text-muted-foreground" };
  if (o.starts_at && new Date(o.starts_at).getTime() > now) return { text: "Scheduled", cls: "bg-sky-500/15 text-sky-300" };
  if (o.ends_at && new Date(o.ends_at).getTime() <= now) return { text: "Ended", cls: "bg-white/10 text-muted-foreground" };
  if (o.max_redemptions && o.redeemed >= o.max_redemptions) return { text: "Used up", cls: "bg-amber-500/15 text-amber-300" };
  return { text: "Live", cls: "bg-emerald-500/15 text-emerald-300" };
}

function describe(o: AdminOffer): string {
  const v = Number(o.discount_value);
  const what = o.discount_type === "percent" ? `${v}% off` : o.discount_type === "flat_inr" ? `₹${v} off` : `+${v}% bonus credits`;
  const on = o.applies_to.map((k) => KINDS.find((x) => x.id === k)?.label ?? k).join(", ");
  const plans = o.plan_codes.length ? ` · plans: ${o.plan_codes.join(", ")}` : "";
  let auto = "";
  if (o.applies_to.includes("autopay") && o.discount_type !== "bonus_credits") {
    auto = o.razorpay_offer_id
      ? ` · auto-renew: ${o.recurring === "forever" ? "every renewal" : o.recurring === "cycles" ? `first ${o.recurring_cycles} renewals` : "first payment"} (Razorpay ${o.razorpay_offer_id})`
      : " · auto-renew: as bonus credits (no Razorpay offer ID)";
  }
  return `${what} on ${on}${plans}${auto}`;
}

function OffersPage() {
  const { data: access, isLoading } = useAccess();
  const listFn = useServerFn(listOffers);
  const q = useQuery({ queryKey: ["admin-offers"], queryFn: () => listFn(), enabled: Boolean(access?.isAdmin) });
  const [editing, setEditing] = useState<Form | null>(null);

  if (isLoading) return <div className="p-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!access?.isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Tag className="w-7 h-7 text-[color:var(--brand-orange)]" /> Offers &amp; codes</h1>
          <p className="text-muted-foreground mt-1 text-sm">Festival discounts and promo codes. Prices are always recalculated on the server at checkout.</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="rounded-lg gradient-primary text-white px-4 py-2 text-sm inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New offer
        </button>
      </div>

      {q.data?.needsMigration && (
        <div className="glass rounded-2xl p-4 border border-amber-500/40 text-sm">The offers tables aren't in the database yet — apply the offers migration first.</div>
      )}
      {q.isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {q.data && !q.data.offers.length && !q.data.needsMigration && (
        <div className="glass rounded-2xl p-8 border border-border text-center text-sm text-muted-foreground">
          No offers yet. Create one for your next festival — e.g. <b>DIWALI30</b> for 30% off.
        </div>
      )}
      <div className="space-y-3">
        {(q.data?.offers ?? []).map((o) => <OfferRowCard key={o.id} o={o} onEdit={() => setEditing(fromOffer(o))} />)}
      </div>

      {editing && <OfferEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function fromOffer(o: AdminOffer): Form {
  return {
    id: o.id, code: o.code, title: o.title, discountType: o.discount_type, discountValue: String(o.discount_value),
    appliesTo: o.applies_to as Kind[], planCodes: o.plan_codes, recurring: o.recurring,
    recurringCycles: String(o.recurring_cycles ?? 3), razorpayOfferId: o.razorpay_offer_id ?? "",
    startsAt: toLocal(o.starts_at), endsAt: toLocal(o.ends_at),
    maxRedemptions: o.max_redemptions ? String(o.max_redemptions) : "", perUserLimit: String(o.per_user_limit),
    minAmountInr: String(o.min_amount_inr), active: o.active, showBanner: o.show_banner,
    bannerText: o.banner_text ?? "", autoApply: o.auto_apply,
  };
}

function OfferRowCard({ o, onEdit }: { o: AdminOffer; onEdit: () => void }) {
  const qc = useQueryClient();
  const toggle = useServerFn(setOfferActive);
  const del = useServerFn(deleteOffer);
  const [busy, setBusy] = useState(false);
  const st = status(o);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-offers"] });
  return (
    <div className="glass rounded-2xl p-4 border border-border">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={async () => { await navigator.clipboard.writeText(o.code); toast.success("Code copied"); }}
              className="font-mono font-bold text-lg tracking-wide inline-flex items-center gap-1.5 hover:text-[color:var(--brand-orange)]">
              {o.code} <Copy className="w-3.5 h-3.5 opacity-60" />
            </button>
            <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.text}</span>
            {o.auto_apply && <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300">auto-applies</span>}
            {o.show_banner && <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300">banner</span>}
          </div>
          {o.title && <div className="text-sm mt-0.5">{o.title}</div>}
          <div className="text-xs text-muted-foreground mt-1">{describe(o)}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {o.starts_at ? `From ${new Date(o.starts_at).toLocaleString()}` : "Starts now"} · {o.ends_at ? `until ${new Date(o.ends_at).toLocaleString()}` : "no end date"}
            {o.max_redemptions ? ` · max ${o.max_redemptions} uses` : ""} · {o.per_user_limit}× per user{o.min_amount_inr ? ` · min ₹${o.min_amount_inr}` : ""}
          </div>
        </div>
        <div className="text-right text-xs">
          <div><span className="text-lg font-bold">{o.redeemed}</span> used{o.max_redemptions ? ` / ${o.max_redemptions}` : ""}</div>
          <div className="text-muted-foreground">{inr(o.revenuePaise)} revenue · {inr(o.discountGivenPaise)} discount{o.bonusGiven ? ` · +${o.bonusGiven.toLocaleString()} credits` : ""}</div>
          {o.pending > 0 && <div className="text-muted-foreground">{o.pending} checkout{o.pending === 1 ? "" : "s"} not completed</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <button onClick={onEdit} className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Edit</button>
        <button disabled={busy} onClick={async () => {
          setBusy(true);
          try { await toggle({ data: { id: o.id, active: !o.active } }); toast.success(o.active ? "Offer switched off" : "Offer switched on"); refresh(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
        }} className="rounded-lg glass border border-border px-3 py-1.5 text-sm">{o.active ? "Switch off" : "Switch on"}</button>
        {o.redeemed + o.pending === 0 && (
          <button disabled={busy} onClick={async () => {
            setBusy(true);
            try { await del({ data: { id: o.id } }); toast.success("Offer deleted"); refresh(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
          }} className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5 text-rose-300"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
        )}
      </div>
    </div>
  );
}

function OfferEditor({ initial, onClose }: { initial: Form; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveOffer);
  const plansFn = useServerFn(listPricingPlans);
  const plansQ = useQuery({ queryKey: ["pricing-plans-public"], queryFn: () => plansFn() });
  const plans = ((plansQ.data ?? []) as Array<{ code: string; name: string; planType?: string }>).filter((p) => p.planType !== "free" && p.code !== "free");
  const [f, setF] = useState<Form>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const showAutopay = f.appliesTo.includes("autopay") && f.discountType !== "bonus_credits";

  async function submit() {
    setBusy(true);
    try {
      await save({ data: {
        id: f.id, code: f.code.trim(), title: f.title.trim(),
        discountType: f.discountType, discountValue: Number(f.discountValue),
        appliesTo: f.appliesTo, planCodes: f.planCodes,
        recurring: f.recurring, recurringCycles: f.recurring === "cycles" ? num(f.recurringCycles) : null,
        razorpayOfferId: f.razorpayOfferId.trim() || null,
        startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null,
        endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : null,
        maxRedemptions: num(f.maxRedemptions), perUserLimit: Number(f.perUserLimit || 1),
        minAmountInr: Number(f.minAmountInr || 0), active: f.active,
        showBanner: f.showBanner, bannerText: f.bannerText.trim() || null, autoApply: f.autoApply,
      } });
      toast.success(f.id ? "Offer updated" : "Offer created");
      await qc.invalidateQueries({ queryKey: ["admin-offers"] });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't save";
      // zod errors arrive as JSON — show the first message.
      try { const j = JSON.parse(msg) as Array<{ message: string }>; toast.error(j[0]?.message ?? msg); } catch { toast.error(msg); }
    } finally { setBusy(false); }
  }

  const input = "w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/60";
  const label = "text-xs text-muted-foreground block mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-2xl p-6 max-w-2xl w-full relative max-h-[92vh] overflow-y-auto space-y-5" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Close" onClick={onClose} className="absolute top-4 right-4 p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
        <h2 className="text-xl font-semibold">{f.id ? `Edit ${f.code}` : "New offer"}</h2>

        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Code</label>
            <input value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="DIWALI30" className={`${input} font-mono`} /></div>
          <div><label className={label}>Name (shown to buyers)</label>
            <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Diwali offer" className={input} /></div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Type</label>
            <select value={f.discountType} onChange={(e) => set("discountType", e.target.value as Form["discountType"])} className={input}>
              <option value="percent">% off the price</option>
              <option value="flat_inr">₹ off the price</option>
              <option value="bonus_credits">Bonus credits (price unchanged)</option>
            </select></div>
          <div><label className={label}>{f.discountType === "percent" ? "Percent off (1-90)" : f.discountType === "flat_inr" ? "Rupees off" : "Extra credits, % of the credits bought"}</label>
            <input type="number" min={1} value={f.discountValue} onChange={(e) => set("discountValue", e.target.value)} className={input} /></div>
        </div>

        <div>
          <label className={label}>Applies to</label>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => {
              const on = f.appliesTo.includes(k.id);
              return (
                <button key={k.id} type="button" onClick={() => set("appliesTo", on ? f.appliesTo.filter((x) => x !== k.id) : [...f.appliesTo, k.id])}
                  className={`px-3 py-1.5 rounded-full text-xs border ${on ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{k.label}</button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={label}>Only these plans (leave empty for every plan; credit packs ignore this)</label>
          <div className="flex flex-wrap gap-2">
            {plans.map((p) => {
              const on = f.planCodes.includes(p.code);
              return (
                <button key={p.code} type="button" onClick={() => set("planCodes", on ? f.planCodes.filter((x) => x !== p.code) : [...f.planCodes, p.code])}
                  className={`px-3 py-1.5 rounded-full text-xs border ${on ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{p.name}</button>
              );
            })}
            {!plans.length && <span className="text-xs text-muted-foreground">Loading plans…</span>}
          </div>
        </div>

        {showAutopay && (
          <div className="rounded-xl border border-white/10 p-4 space-y-3">
            <div className="text-sm font-semibold">Auto-renew plans</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={label}>Discount lasts</label>
                <select value={f.recurring} onChange={(e) => set("recurring", e.target.value as Form["recurring"])} className={input}>
                  <option value="first">First payment only</option>
                  <option value="cycles">First N payments</option>
                  <option value="forever">Every payment while subscribed</option>
                </select></div>
              {f.recurring === "cycles" && (
                <div><label className={label}>Number of payments</label>
                  <input type="number" min={1} max={36} value={f.recurringCycles} onChange={(e) => set("recurringCycles", e.target.value)} className={input} /></div>
              )}
            </div>
            <div><label className={label}>Razorpay offer ID (optional)</label>
              <input value={f.razorpayOfferId} onChange={(e) => set("razorpayOfferId", e.target.value.trim())} placeholder="offer_XXXXXXXXXXXXXX" className={`${input} font-mono`} /></div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Razorpay applies discounts to subscriptions only through an offer you create in the Razorpay Dashboard → Offers → <i>Offers on Subscriptions</i>.
              Create one with the same discount and the same duration as above, then paste its ID here. Without an ID, auto-renew buyers get the same value as bonus credits on their first month.
              Razorpay offers can be limited to UPI or cards — choose both if you can.
            </p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Starts (your time)</label>
            <input type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={input} /></div>
          <div><label className={label}>Ends (your time)</label>
            <input type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={input} /></div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className={label}>Total uses (empty = unlimited)</label>
            <input type="number" min={1} value={f.maxRedemptions} onChange={(e) => set("maxRedemptions", e.target.value)} className={input} /></div>
          <div><label className={label}>Uses per person</label>
            <input type="number" min={1} value={f.perUserLimit} onChange={(e) => set("perUserLimit", e.target.value)} className={input} /></div>
          <div><label className={label}>Minimum order (₹)</label>
            <input type="number" min={0} value={f.minAmountInr} onChange={(e) => set("minAmountInr", e.target.value)} className={input} /></div>
        </div>

        <div className="space-y-2">
          <Check label="Active" value={f.active} onChange={(v) => set("active", v)} />
          <Check label="Apply automatically at checkout (no code needed)" value={f.autoApply} onChange={(v) => set("autoApply", v)} />
          <Check label="Show a banner on the home and pricing pages while it's live" value={f.showBanner} onChange={(v) => set("showBanner", v)} />
          {f.showBanner && (
            <input value={f.bannerText} onChange={(e) => set("bannerText", e.target.value)} maxLength={160}
              placeholder="🪔 Diwali offer — 30% off every plan" className={input} />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg glass border border-border px-4 py-2 text-sm">Cancel</button>
          <button disabled={busy || !f.code.trim() || !f.appliesTo.length} onClick={submit}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {f.id ? "Save changes" : "Create offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-orange-500" />
      {label}
    </label>
  );
}
