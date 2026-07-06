import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PLANS, type PlanDef } from "@/lib/constants";
import { getPlanGenerationEstimate, ASSET_META, type AssetKey } from "@/lib/credit-costs";
import { useAccess } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles, Crown, X, Loader2, Image as ImageIcon, Layers, Film, Video, ChevronDown, Calculator, Minus, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pricing")({ component: PricingPage });

function PricingPage() {
  const { data: access } = useAccess();
  const [modalPlan, setModalPlan] = useState<PlanDef | null>(null);
  const [estimatorPlan, setEstimatorPlan] = useState<PlanDef>(PLANS.find((p) => p.featured) ?? PLANS[0]);

  return (
    <div className="space-y-10 max-w-6xl mx-auto pb-12">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-4">
          <Sparkles className="w-3 h-3 text-[color:var(--neon-pink)]" /> Upgrade any time · Secure checkout
        </div>
        <h1 className="text-3xl md:text-5xl font-bold">Choose your <span className="gradient-text">plan</span></h1>
        <p className="text-muted-foreground mt-2">Cancel any time. Prices in USD.</p>
        {access?.isAdmin && (
          <div className="mt-4 inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-sm">
            <Crown className="w-4 h-4 text-amber-400" /> Admin — Unlimited access, no billing
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {PLANS.map((p) => {
          const isCurrent = access?.plan === p.id;
          const totalCredits = p.monthlyCredits + (p.signupCredits ?? 0);
          const estimate = getPlanGenerationEstimate(totalCredits);
          return (
            <div key={p.id}
              className={`glass rounded-2xl p-6 relative flex flex-col ${p.featured ? "border-[color:var(--neon-purple)]/60 shadow-[var(--shadow-glow)]" : ""}`}>
              {p.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white text-xs px-3 py-1 rounded-full font-medium">
                  Most popular
                </div>
              )}
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>


              {estimate && (
                <div className="mt-4 rounded-lg border border-border/60 bg-black/20 p-3 text-xs">

                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Up to (single-type only)</div>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    Each row is a separate "up to" — not a bundle. Mixed usage splits the same {totalCredits.toLocaleString()} credits.
                  </p>
                  <div className="space-y-1">
                    <EstRow icon={<ImageIcon className="w-3.5 h-3.5 text-[color:var(--neon-pink)]" />} label="AI images" value={estimate.images} />
                    <EstRow icon={<Layers className="w-3.5 h-3.5 text-[color:var(--neon-purple)]" />} label="Carousels" value={estimate.carousels} />
                    <EstRow icon={<Film className="w-3.5 h-3.5 text-[color:var(--neon-purple)]" />} label="Short reels" value={estimate.shortReels} />
                    <EstRow icon={<Video className="w-3.5 h-3.5 text-[color:var(--neon-purple)]" />} label="5-min long videos" value={estimate.longVideos} />
                  </div>
                </div>
              )}
              <ul className="mt-5 space-y-2.5 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-[color:var(--neon-purple)] mt-0.5 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={isCurrent || p.id === "free"}
                onClick={() => setModalPlan(p)}
                className={`mt-6 w-full rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${
                  p.featured ? "gradient-primary text-white" : "glass hover:bg-white/5"
                }`}>
                {isCurrent ? "Current plan" : p.cta}
              </button>
            </div>
          );
        })}
      </div>

      <CreditsEstimator plan={estimatorPlan} onChangePlan={setEstimatorPlan} />

      <PricingFAQ />

      <div className="text-center text-sm text-muted-foreground">
        Need custom / team pricing? <Link to="/dashboard" className="text-[color:var(--neon-purple)] hover:underline">Contact us</Link>
      </div>

      {modalPlan && <CheckoutModal plan={modalPlan} onClose={() => setModalPlan(null)} />}
    </div>
  );
}


function EstRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-muted-foreground">{icon} {label}</span>
      <strong className="text-foreground">up to ~{value.toLocaleString()}</strong>
    </div>
  );
}

/* ------------- Interactive Credits Estimator ------------- */

function CreditsEstimator({ plan, onChangePlan }: { plan: PlanDef; onChangePlan: (p: PlanDef) => void }) {
  const totalCredits = plan.monthlyCredits + (plan.signupCredits ?? 0);
  const [mix, setMix] = useState<Record<AssetKey, number>>({
    image: 0, carousel: 0, shortReel: 0, longVideo: 0,
  });

  const spent = useMemo(
    () => (Object.keys(mix) as AssetKey[]).reduce((s, k) => s + mix[k] * ASSET_CREDIT_COST[k], 0),
    [mix]
  );
  const remaining = totalCredits - spent;
  const pct = Math.min(100, Math.max(0, (spent / totalCredits) * 100));
  const overBudget = remaining < 0;

  function update(k: AssetKey, delta: number) {
    setMix((m) => ({ ...m, [k]: Math.max(0, m[k] + delta) }));
  }
  function reset() { setMix({ image: 0, carousel: 0, shortReel: 0, longVideo: 0 }); }

  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[color:var(--neon-purple)]" /> Credits estimator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Mix and match to see exactly what you can generate with a plan's monthly credits.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => { onChangePlan(p); reset(); }}
              className={`px-3 py-1.5 rounded-lg text-xs border ${
                plan.id === p.id ? "gradient-primary text-white border-transparent" : "glass border-border hover:bg-white/5"
              }`}>
              {p.name} · {(p.monthlyCredits + (p.signupCredits ?? 0)).toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid md:grid-cols-2 gap-4">
        {(Object.keys(ASSET_META) as AssetKey[]).map((k) => {
          const meta = ASSET_META[k];
          const count = mix[k];
          const rowSpend = count * meta.cost;
          return (
            <div key={k} className="rounded-xl border border-border/60 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="text-[11px] text-muted-foreground">{meta.cost} {meta.cost === 1 ? "credit" : "credits"} {meta.unit}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => update(k, -1)} disabled={count === 0}
                    className="w-8 h-8 rounded-lg glass border border-border flex items-center justify-center disabled:opacity-40">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="min-w-[3ch] text-center font-semibold">{count}</span>
                  <button onClick={() => update(k, 1)}
                    className="w-8 h-8 rounded-lg gradient-primary text-white flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Uses <strong className="text-foreground">{rowSpend.toLocaleString()}</strong> credits
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-border/60 bg-black/30 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Used</span>
          <span className={`font-semibold ${overBudget ? "text-rose-400" : ""}`}>
            {spent.toLocaleString()} / {totalCredits.toLocaleString()} credits
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
          <div className={`h-full ${overBudget ? "bg-rose-500" : "gradient-primary"}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={overBudget ? "text-rose-400" : "text-muted-foreground"}>
            {overBudget
              ? `Over budget by ${Math.abs(remaining).toLocaleString()} credits — upgrade or reduce a category.`
              : `${remaining.toLocaleString()} credits remaining this month`}
          </span>
          <button onClick={reset} className="text-muted-foreground hover:text-foreground underline underline-offset-2">
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------- FAQ ------------- */

const FAQ = [
  {
    q: "How do credits work across different generation types?",
    a: "Every plan gives you a single pool of monthly credits. Each generation deducts a fixed amount from that pool: 1 credit per AI image, ~5 per carousel (1 script + 1 per slide), ~9 per short reel (1 script + 1 per scene image), and ~38 for a 5-minute long video. Credits are consumed only when generation actually succeeds — failed runs are refunded automatically.",
  },
  {
    q: "Are the numbers on each plan card bundled together?",
    a: "No. The 'up to' rows on every card are single-type maximums, not a bundle. For example, a 1,000-credit plan can produce up to ~1,000 images OR ~200 carousels OR ~111 short reels OR ~26 five-minute videos — not all of those at the same time. Use the estimator above to plan a real mix.",
  },
  {
    q: "How does mixed usage affect my total output?",
    a: "Every asset draws from the same balance. If you generate 100 images (100 credits) and 10 short reels (~90 credits), you've used ~190 of your monthly credits and have the rest left for anything else. The estimator shows this live as you adjust the mix.",
  },
  {
    q: "What if I run out of credits mid-month?",
    a: "Generations will pause until your billing period renews or you top up. Paid plans can buy additional credits any time from Settings → Plans & credits.",
  },
  {
    q: "Do unused credits roll over?",
    a: "Monthly credits reset at the start of each billing period and do not roll over. Signup bonus credits (where included) are available immediately and stack with your first month.",
  },
  {
    q: "Do regenerations cost full price?",
    a: "No. Regenerating a single scene image or a single carousel slide only costs that asset (typically 1 credit) — not the whole project.",
  },
];

function PricingFAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="glass rounded-2xl p-6">
      <h2 className="text-xl font-semibold">Pricing FAQ</h2>
      <p className="text-sm text-muted-foreground mt-1">Everything you need to know about how credits are counted.</p>
      <div className="mt-4 divide-y divide-border/50">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="py-3">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-start justify-between gap-4 text-left">
                <span className="font-medium text-sm md:text-base">{item.q}</span>
                <ChevronDown className={`w-4 h-4 mt-1 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.a}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* Checkout placeholder — pretends to run payment and activates the plan locally. */
function CheckoutModal({ plan, onClose }: { plan: PlanDef; onClose: () => void }) {
  const { data: access } = useAccess();
  const qc = useQueryClient();
  const [processing, setProcessing] = useState(false);
  const totalCredits = plan.monthlyCredits + (plan.signupCredits ?? 0);
  const estimate = getPlanGenerationEstimate(totalCredits);

  async function simulatePayment() {
    if (!access) return;
    setProcessing(true);
    await new Promise((r) => setTimeout(r, 1400));

    await supabase.from("subscriptions").update({ status: "cancelled" })
      .eq("user_id", access.userId).eq("status", "active");

    const renews = new Date();
    renews.setMonth(renews.getMonth() + 1);
    const { error } = await supabase.from("subscriptions").insert({
      user_id: access.userId,
      plan_name: plan.id,
      status: "active",
      monthly_credit_limit: plan.monthlyCredits,
      monthly_credits_used: 0,
      unlimited_usage: false,
      renews_at: renews.toISOString(),
    } as any);
    setProcessing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("profiles").update({ plan: plan.id } as any).eq("id", access.userId);
    qc.invalidateQueries({ queryKey: ["access"] });
    toast.success(`${plan.name} plan activated!`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass rounded-2xl p-8 max-w-md w-full relative max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">$</div>
          <div>
            <div className="font-semibold">Checkout</div>
            <div className="text-xs text-muted-foreground">Secure payment (demo)</div>
          </div>
        </div>
        <div className="glass rounded-xl p-4 mb-3">
          <div className="flex justify-between text-sm mb-2"><span>Plan</span><span className="font-medium">{plan.name}</span></div>
          <div className="flex justify-between text-sm mb-2"><span>Monthly credits</span><span className="font-medium">{plan.monthlyCredits.toLocaleString()}</span></div>
          {plan.signupCredits ? (
            <div className="flex justify-between text-sm mb-2"><span>Signup bonus</span><span className="font-medium">+{plan.signupCredits.toLocaleString()}</span></div>
          ) : null}
          <div className="flex justify-between text-base pt-2 border-t border-border/40">
            <span className="font-semibold">Total</span><span className="font-bold gradient-text">{plan.price}</span>
          </div>
        </div>

        {estimate && (
          <div className="rounded-xl border border-border/60 bg-black/20 p-3 mb-3 text-xs">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">What you can generate</div>
            <p className="text-[10px] text-muted-foreground mb-2">
              Each row is an "up to" if you only made that type — not a bundle. Mixed usage splits the same {totalCredits.toLocaleString()} credits.
            </p>
            <div className="space-y-1">
              <EstRow icon={<ImageIcon className="w-3.5 h-3.5 text-[color:var(--neon-pink)]" />} label="AI images" value={estimate.images} />
              <EstRow icon={<Layers className="w-3.5 h-3.5 text-[color:var(--neon-purple)]" />} label="Carousels" value={estimate.carousels} />
              <EstRow icon={<Film className="w-3.5 h-3.5 text-[color:var(--neon-purple)]" />} label="Short reels" value={estimate.shortReels} />
              <EstRow icon={<Video className="w-3.5 h-3.5 text-[color:var(--neon-purple)]" />} label="5-min long videos" value={estimate.longVideos} />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mb-4">
          Demo checkout — clicking "Pay" activates the {plan.name} plan without charging you. Live payments can be wired later via Stripe or Paddle.
        </p>
        <button
          onClick={simulatePayment}
          disabled={processing}
          className="w-full rounded-lg gradient-primary text-white py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-60">
          {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : `Pay ${plan.price}`}
        </button>
      </div>
    </div>
  );
}
