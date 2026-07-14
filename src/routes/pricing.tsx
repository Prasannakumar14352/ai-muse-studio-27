import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PLANS, type PlanDef, CREDIT_PACKS, type CreditPack } from "@/lib/constants";
import { getPlanGenerationEstimate, ASSET_META, type AssetKey } from "@/lib/credit-costs";
import { useAccess } from "@/lib/access";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createRazorpayOrder, verifyRazorpayPayment, createRazorpayPlanOrder } from "@/lib/razorpay.functions";
import { toast } from "sonner";
import { Check, Sparkles, Crown, X, Image as ImageIcon, Layers, Film, Video, ChevronDown, Calculator, Minus, Plus, Zap, Loader2, Info, ArrowRight } from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — CreatorVault AI" },
      { name: "description", content: "Simple credit-based pricing for CreatorVault AI. Start free — 5 credits monthly. Upgrade for more videos, carousels, images and thumbnails." },
      { property: "og:title", content: "Pricing — CreatorVault AI" },
      { property: "og:description", content: "Simple credit-based pricing for CreatorVault AI. Start free." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Pricing — CreatorVault AI" },
      { name: "twitter:description", content: "Simple credit-based pricing for CreatorVault AI." },
    ],
  }),
  component: PricingPage,
});


function PricingPage() {
  const { data: access } = useAccess();
  const navigate = useNavigate();
  const [modalPlan, setModalPlan] = useState<PlanDef | null>(null);
  const [billingMode, setBillingMode] = useState<"monthly" | "lifetime">("monthly");
  const monthlyPlans = useMemo(() => PLANS.filter((p) => p.planType === "free" || p.planType === "monthly" || p.planType === "enterprise"), []);
  const lifetimePlans = useMemo(() => PLANS.filter((p) => p.planType === "lifetime"), []);
  const visiblePlans = billingMode === "lifetime" ? lifetimePlans : monthlyPlans;
  const [estimatorPlan, setEstimatorPlan] = useState<PlanDef>(PLANS.find((p) => p.featured && p.planType === "monthly") ?? PLANS[0]);

  const handleSelect = (p: PlanDef) => {
    if (!access?.email) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    setModalPlan(p);
  };

  return (
    <PublicShell>
      <div className="space-y-14 max-w-7xl mx-auto pb-16 px-4 sm:px-6 pt-10">

      {/* Header */}
      <div className="text-center max-w-3xl mx-auto pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-4">
          <Sparkles className="w-3 h-3 text-[color:var(--neon-pink)]" /> Monthly or Lifetime · Secure checkout
        </div>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
          Choose your <span className="gradient-text">plan</span>
        </h1>
        <p className="text-muted-foreground mt-3 text-base md:text-lg">
          Pay monthly for the latest AI features — or pay once and own it for life. All prices in USD.
        </p>
        {access?.isAdmin && (
          <div className="mt-4 inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-sm">
            <Crown className="w-4 h-4 text-amber-400" /> Admin — Unlimited access, no billing
          </div>
        )}

        {/* Monthly / Lifetime tabs */}
        <div className="mt-6 inline-flex items-center gap-1 rounded-full glass p-1 border border-border/60">
          {([
            { id: "monthly", label: "Monthly" },
            { id: "lifetime", label: "Lifetime · Pay once" },
          ] as const).map((t) => {
            const active = billingMode === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setBillingMode(t.id)}
                aria-pressed={active}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  active ? "gradient-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                }`}>
                {t.label}
              </button>
            );
          })}
        </div>
        {billingMode === "lifetime" && (
          <p className="mt-3 text-xs text-muted-foreground">
            One payment. No recurring charges. Credits are added once at purchase — top up any time.
          </p>
        )}
      </div>

      {/* Pricing cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mx-auto w-full">
        {visiblePlans.map((p) => (
          <PricingCard
            key={p.id}
            plan={p}
            isCurrent={access?.plan === p.id}
            onSelect={() => handleSelect(p)}
          />
        ))}
      </div>

      {/* Full comparison table */}
      <ComparisonSection plans={visiblePlans} mode={billingMode} />

      <CreditPacksSection />

      <CreditsEstimator plan={estimatorPlan} onChangePlan={setEstimatorPlan} />

      <PricingFAQ />

      <div className="text-center text-sm text-muted-foreground">
        Need custom / team pricing? <Link to="/contact" className="text-[color:var(--brand-orange)] hover:underline">Contact us</Link>
      </div>

      {modalPlan && <CheckoutModal plan={modalPlan} onClose={() => setModalPlan(null)} />}
      </div>
    </PublicShell>
  );
}

/* ------------- Pricing card ------------- */

function PricingCard({ plan: p, isCurrent, onSelect }: { plan: PlanDef; isCurrent: boolean; onSelect: () => void }) {
  const isLifetime = p.planType === "lifetime";
  const totalCredits = isLifetime
    ? (p.includedCredits ?? 0)
    : p.monthlyCredits + (p.signupCredits ?? 0);
  const estimate = p.contactSales || isLifetime ? null : getPlanGenerationEstimate(totalCredits);

  const wrapper = [
    "relative flex flex-col rounded-2xl p-6 md:p-7 min-h-[560px] transition-all duration-300",
    "bg-[color:var(--card)]/40 backdrop-blur-md border border-border/60",
    "hover:border-white/20 hover:-translate-y-0.5 hover:shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)]",
    p.featured ? "border-transparent bg-gradient-to-b from-[color:var(--neon-purple)]/10 to-transparent ring-1 ring-[color:var(--neon-purple)]/40" : "",
    p.contactSales ? "border-[color:var(--brand-orange)]/40" : "",
    isLifetime ? "ring-1 ring-amber-400/30" : "",
  ].join(" ");

  return (
    <div className={wrapper}>
      {p.featured && (
        <div className="absolute -top-3 left-6 gradient-primary text-white text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold shadow-md">
          Most popular
        </div>
      )}
      {p.contactSales && (
        <div className="absolute -top-3 left-6 bg-[color:var(--brand-orange)] text-black text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold shadow-md">
          For teams
        </div>
      )}
      {isLifetime && !p.featured && (
        <div className="absolute -top-3 left-6 bg-amber-400 text-black text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full font-semibold shadow-md">
          Pay once
        </div>
      )}

      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">{p.name}</h3>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-4xl font-bold tracking-tight">{p.price}</span>
          <span className="text-sm text-muted-foreground whitespace-nowrap">{p.period}</span>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          {p.contactSales
            ? "Custom credit pool sized to your team."
            : isLifetime
              ? <>Includes <strong className="text-foreground">{totalCredits.toLocaleString()}</strong> credits at purchase · top up any time.</>
              : totalCredits > 0
                ? <>Includes <strong className="text-foreground">{totalCredits.toLocaleString()}</strong> credits{p.signupCredits ? " (with signup bonus)" : " / month"}.</>
                : "Free to start — no credit card required."}
        </div>
      </div>


      {/* Estimated usage */}
      {estimate && (
        <div className="mt-5 pt-5 border-t border-border/40">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Estimated monthly usage
            </span>
            <span
              title={`Each row is an alternative "up to" — not a bundle. Mixed usage splits the same ${totalCredits.toLocaleString()} credits.`}
              className="text-muted-foreground hover:text-foreground cursor-help">
              <Info className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <UsageChip icon={<ImageIcon className="w-3.5 h-3.5" />} label="Images" value={estimate.images} accent="pink" />
            <UsageChip icon={<Layers className="w-3.5 h-3.5" />} label="Carousels" value={estimate.carousels} accent="purple" />
            <UsageChip icon={<Film className="w-3.5 h-3.5" />} label="Short reels" value={estimate.shortReels} accent="purple" />
            <UsageChip icon={<Video className="w-3.5 h-3.5" />} label="5-min videos" value={estimate.longVideos} accent="purple" />
          </div>
          <p className="mt-2 text-[10.5px] text-muted-foreground/80 leading-relaxed">
            Alternative maximums — all types share the same credit balance.
          </p>
        </div>
      )}

      {p.contactSales && (
        <div className="mt-5 pt-5 border-t border-border/40 text-sm text-muted-foreground">
          Pricing tailored to your team size, credit pool, and support tier. We reply within 1 business day.
        </div>
      )}

      {/* Features */}
      <ul className="mt-5 space-y-2.5 flex-1">
        {p.features.slice(0, 6).map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="w-4 h-4 text-[color:var(--neon-purple)] mt-0.5 shrink-0" />
            <span className="text-foreground/90">{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA pinned to bottom */}
      <div className="mt-6 pt-2">
        {p.contactSales ? (
          <Link
            to="/contact"
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium bg-[color:var(--brand-orange)] text-black hover:opacity-90 transition">
            {p.cta} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button
            disabled={isCurrent || p.id === "free"}
            onClick={onSelect}
            className={`w-full rounded-lg py-2.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${
              p.featured
                ? "gradient-primary text-white hover:opacity-95"
                : "border border-border/70 bg-white/5 hover:bg-white/10"
            }`}>
            {isCurrent ? "Current plan" : p.cta}
          </button>
        )}
      </div>
    </div>
  );
}

function UsageChip({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: "pink" | "purple" }) {
  const color = accent === "pink" ? "text-[color:var(--neon-pink)]" : "text-[color:var(--neon-purple)]";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] border border-border/40 px-2.5 py-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        <span className={`shrink-0 ${color}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      <strong className="text-xs text-foreground whitespace-nowrap">~{value.toLocaleString()}</strong>
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

/* ------------- Full comparison ------------- */

function ComparisonSection({ plans, mode = "monthly" }: { plans?: PlanDef[]; mode?: "monthly" | "lifetime" }) {
  const list = plans ?? PLANS;
  const isLifetime = mode === "lifetime";
  const numericRows: { label: string; get: (p: PlanDef) => string }[] = isLifetime
    ? [
        { label: "Price", get: (p) => `${p.price} ${p.period ?? ""}`.trim() },
        { label: "Included credits (one-time)", get: (p) => (p.includedCredits ?? 0).toLocaleString() },
        { label: "Recurring charges", get: () => "None" },
        { label: "Additional credit packs", get: () => "Yes" },
      ]
    : [
        { label: "Price", get: (p) => `${p.price} ${p.period ?? ""}`.trim() },
        { label: "Monthly credits", get: (p) => p.contactSales ? "Custom" : p.monthlyCredits.toLocaleString() },
        { label: "Signup bonus credits", get: (p) => p.signupCredits ? `+${p.signupCredits.toLocaleString()}` : "—" },
        { label: "Est. AI images / mo", get: (p) => estStr(p, "images") },
        { label: "Est. carousels / mo", get: (p) => estStr(p, "carousels") },
        { label: "Est. short reels / mo", get: (p) => estStr(p, "shortReels") },
        { label: "Est. 5-min videos / mo", get: (p) => estStr(p, "longVideos") },
      ];

  return (
    <section className="glass rounded-2xl p-6 md:p-8">
      <div className="mb-6">
        <h2 className="text-xl md:text-2xl font-semibold">Compare all plans</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Estimated outputs assume you produce only that asset type. Mixed usage draws from the same monthly credits.
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left py-3 px-3 text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border/60"></th>
              {list.map((p) => (
                <th key={p.id} className={`text-left py-3 px-3 border-b border-border/60 ${p.featured ? "text-[color:var(--neon-purple)]" : ""}`}>
                  <div className="font-semibold text-foreground">{p.name}</div>
                  {p.featured && <div className="text-[10px] uppercase tracking-wider text-[color:var(--neon-purple)]">Most popular</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {numericRows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? "bg-white/[0.02]" : ""}>
                <td className="py-2.5 px-3 text-muted-foreground">{row.label}</td>
                {list.map((p) => (
                  <td key={p.id} className="py-2.5 px-3 text-foreground">{row.get(p)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="py-3 px-3 text-muted-foreground align-top border-t border-border/60">Included features</td>
              {list.map((p) => (
                <td key={p.id} className="py-3 px-3 align-top border-t border-border/60">
                  <ul className="space-y-1.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs">
                        <Check className="w-3 h-3 mt-0.5 shrink-0 text-[color:var(--neon-purple)]" />
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile accordion */}
      <div className="md:hidden space-y-3">
        {list.map((p) => (
          <details key={p.id} className="rounded-xl border border-border/60 bg-black/20 group">
            <summary className="cursor-pointer list-none p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.price} {p.period}</div>
              </div>
              <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4 space-y-2 text-sm">
              {numericRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-3 py-1 border-t border-border/40">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="text-foreground text-right">{row.get(p)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-border/40">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Features</div>
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-xs">
                      <Check className="w-3 h-3 mt-0.5 shrink-0 text-[color:var(--neon-purple)]" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function estStr(p: PlanDef, key: "images" | "carousels" | "shortReels" | "longVideos"): string {
  if (p.contactSales) return "Custom";
  const total = p.monthlyCredits + (p.signupCredits ?? 0);
  const est = getPlanGenerationEstimate(total);
  if (!est) return "—";
  return `up to ~${est[key].toLocaleString()}`;
}

/* ------------- Interactive Credits Estimator ------------- */

function CreditsEstimator({ plan, onChangePlan }: { plan: PlanDef; onChangePlan: (p: PlanDef) => void }) {
  const totalCredits = plan.monthlyCredits + (plan.signupCredits ?? 0);
  const [mix, setMix] = useState<Record<AssetKey, number>>({
    image: 0, carousel: 0, shortReel: 0, longVideo: 0,
  });

  const spent = useMemo(
    () => (Object.keys(mix) as AssetKey[]).reduce((s, k) => s + mix[k] * ASSET_META[k].cost, 0),
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
            Pick a plan, then mix and match to see what you can generate.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PLANS.filter((p) => !p.contactSales).map((p) => {
            const active = plan.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChangePlan(p); reset(); }}
                aria-pressed={active}
                className={`px-3 py-1.5 rounded-lg text-xs border cursor-pointer transition ${
                  active
                    ? "gradient-primary text-white border-transparent shadow-lg shadow-fuchsia-500/20"
                    : "glass border-border hover:bg-white/10 hover:border-white/30"
                }`}>
                {p.name} · {(p.monthlyCredits + (p.signupCredits ?? 0)).toLocaleString()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live plan summary — makes the switch visible even before adding items */}
      <div className="mt-4 rounded-xl border border-border/60 bg-black/20 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Selected plan</div>
          <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-lg font-semibold">{plan.name}</span>
            <span className="text-sm text-muted-foreground">{plan.price}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Credits available</div>
          <div className="mt-0.5 text-lg font-bold gradient-text">
            {totalCredits.toLocaleString()}
            <span className="text-xs text-muted-foreground font-normal ml-1">/ month</span>
          </div>
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

/* Checkout — real Razorpay payment. Credits granted after signature verification. */
function CheckoutModal({ plan, onClose }: { plan: PlanDef; onClose: () => void }) {
  const isLifetime = plan.planType === "lifetime";
  const totalCredits = isLifetime
    ? (plan.includedCredits ?? 0)
    : plan.monthlyCredits + (plan.signupCredits ?? 0);
  const estimate = getPlanGenerationEstimate(totalCredits);
  const isFree = plan.planType === "free" || /^\$0/.test(plan.price);
  const { data: access } = useAccess();
  const createOrder = useServerFn(createRazorpayPlanOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const priceNum = Number(plan.price.replace(/[^0-9.]/g, "")) || 0;
  const INR_PER_USD = 84;
  const displayAmount = currency === "INR"
    ? `₹${(priceNum * INR_PER_USD).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
    : plan.price;

  async function handlePay() {
    if (isFree) return;
    setPaying(true);
    try {
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) throw new Error("Could not load Razorpay checkout");
      const order = await createOrder({ data: { planId: plan.id, currency } });
      if (order.fellBackToINR) {
        toast.message("Switched to INR", {
          description: "Your Razorpay account doesn't have International Payments enabled — charging in INR instead.",
        });
      }
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "CreatorVault AI",
          description: `${plan.name} — ${order.plan.credits.toLocaleString()} credits`,
          prefill: access?.email ? { email: access.email } : {},
          theme: { color: "#ff6b35" },
          handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const result = await verifyPayment({ data: resp });
              toast.success(`Added ${result.credits.toLocaleString()} credits to your account`);
              await qc.invalidateQueries({ queryKey: ["access"] });
              await qc.invalidateQueries({ queryKey: ["my-payments"] });
              await qc.invalidateQueries({ queryKey: ["my-subscription"] });
              onClose();
              navigate({ to: "/invoices" });
              resolve();
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Verification failed";
              toast.error(msg);
              reject(e);
            }
          },
          modal: { ondismiss: () => resolve() },
        });
        rzp.open();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start checkout";
      toast.error(msg);
    } finally {
      setPaying(false);
    }
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
            <div className="text-xs text-muted-foreground">Secure payment · Razorpay</div>
          </div>
        </div>
        <div className="glass rounded-xl p-4 mb-3">
          <div className="flex justify-between text-sm mb-2"><span>Plan</span><span className="font-medium">{plan.name}</span></div>
          {isLifetime ? (
            <>
              <div className="flex justify-between text-sm mb-2"><span>Included credits</span><span className="font-medium">{(plan.includedCredits ?? 0).toLocaleString()} (one-time)</span></div>
              <div className="flex justify-between text-sm mb-2"><span>Billing</span><span className="font-medium">One-time · no recurring charges</span></div>
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm mb-2"><span>Monthly credits</span><span className="font-medium">{plan.monthlyCredits.toLocaleString()}</span></div>
              {plan.signupCredits ? (
                <div className="flex justify-between text-sm mb-2"><span>Signup bonus</span><span className="font-medium">+{plan.signupCredits.toLocaleString()}</span></div>
              ) : null}
            </>
          )}
          <div className="flex justify-between text-base pt-2 border-t border-border/40">
            <span className="font-semibold">Total</span><span className="font-bold gradient-text">{displayAmount}</span>
          </div>
        </div>

        {!isFree && (
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Pay in</div>
            <div className="flex rounded-lg border border-border/60 p-1 text-sm">
              {(["USD", "INR"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`flex-1 rounded-md py-1.5 font-medium transition ${
                    currency === c ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {c === "USD" ? "🇺🇸 USD" : "🇮🇳 INR"}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {currency === "USD"
                ? "Charged in USD. If your Razorpay account doesn't allow international payments, we'll auto-switch to INR."
                : `Charged in INR at ~₹${INR_PER_USD}/$1.`}
            </p>
          </div>
        )}

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

        {isFree && (
          <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-3 mb-4 text-xs text-yellow-100">
            The Free plan is available by default — no checkout needed.
          </div>
        )}

        <button
          onClick={handlePay}
          disabled={isFree || paying}
          className="w-full rounded-lg gradient-primary text-white py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
          {paying && <Loader2 className="w-4 h-4 animate-spin" />}
          {isFree ? "Already included" : paying ? "Opening checkout…" : `Pay ${displayAmount}`}
        </button>
        <p className="mt-2 text-[11px] text-center text-muted-foreground">
          Credits are only granted after a successful payment.
        </p>
      </div>
    </div>
  );
}


/* ------------- Credit Packs (Razorpay one-time USD) ------------- */

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function CreditPacksSection() {
  const { data: access } = useAccess();
  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function handleBuy(pack: CreditPack) {
    if (!access?.email) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    setBuyingId(pack.id);
    try {
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) throw new Error("Could not load Razorpay checkout");

      const order = await createOrder({ data: { packId: pack.id } });

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "CreatorVault AI",
          description: `${pack.label} — ${pack.credits.toLocaleString()} credits`,
          prefill: access?.email ? { email: access.email } : {},
          theme: { color: "#ff6b35" },
          handler: async (resp: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const result = await verifyPayment({ data: resp });
              toast.success(`Added ${result.credits.toLocaleString()} credits to your account`);
              await qc.invalidateQueries({ queryKey: ["access"] });
              await qc.invalidateQueries({ queryKey: ["my-payments"] });
              navigate({ to: "/invoices" });
              resolve();
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Verification failed";
              toast.error(msg);
              reject(e);
            }
          },
          modal: {
            ondismiss: () => resolve(),
          },
        });
        rzp.open();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Checkout failed";
      toast.error(msg);
    } finally {
      setBuyingId(null);
    }
  }

  if (access?.isAdmin) return null;

  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-[color:var(--brand-orange)]" /> Top up with credit packs
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            One-time USD purchase. Credits added instantly and never expire. Secure checkout by Razorpay.
          </p>
        </div>
        <Link to="/invoices" className="text-xs glass rounded-lg px-3 py-2 hover:bg-white/10">
          View invoices →
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CREDIT_PACKS.map((pack) => {
          const busy = buyingId === pack.id;
          return (
            <div key={pack.id} className="glass rounded-xl p-5 flex flex-col border border-border/50 hover:border-[color:var(--brand-orange)]/40 transition">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{pack.label}</div>
                  <div className="mt-1 text-2xl font-bold">{pack.credits.toLocaleString()} <span className="text-sm text-muted-foreground font-normal">credits</span></div>
                </div>
                {pack.bonus && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--brand-orange)]/20 text-[color:var(--brand-orange)] font-semibold">
                    {pack.bonus}
                  </span>
                )}
              </div>
              <div className="mt-3 text-3xl font-bold gradient-text">${pack.priceUSD.toFixed(2)}</div>
              <div className="text-[11px] text-muted-foreground">
                ≈ ${((pack.priceUSD / pack.credits) * 100).toFixed(2)} / 100 credits
              </div>
              <button
                onClick={() => handleBuy(pack)}
                disabled={busy || !!buyingId}
                className="mt-5 w-full rounded-lg gradient-primary text-white py-2.5 text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : "Buy pack"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground text-center">
        Payments processed in USD by Razorpay. Cards, UPI and international payment methods supported.
      </p>
    </section>
  );
}

