// Landing pricing section with Monthly / Yearly / Lifetime tabs.
// Reads pricing from the DB via listPricingPlans so admins can edit
// prices without a code change.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { Check, Star, Infinity as InfinityIcon } from "lucide-react";
import { planUpdatesLine } from "@/lib/plan-updates";
import { listPricingPlans, type PricingPlan, type BillingCycle } from "@/lib/pricing.functions";

const plansQuery = queryOptions({
  queryKey: ["pricing-plans"],
  queryFn: () => listPricingPlans(),
  staleTime: 60_000,
});

function usd(n: number) {
  return `$${n.toLocaleString("en-IN")}`;
}

export function LandingPricingTabs() {
  // Non-suspense on purpose: if the pricing fetch fails (DB down, missing
  // env var) the rest of the landing page must still render. A suspense
  // query here throws to the root error boundary and blanks the whole site.
  const { data, error, isLoading } = useQuery({ ...plansQuery, retry: 1 });
  const plans = data?.plans ?? [];
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  const list = cycle === "lifetime"
    ? plans.filter((p) => p.planType === "lifetime" || p.priceLifetimeUsd > 0)
    : plans.filter((p) => p.planType !== "lifetime");

  const tabs: { id: BillingCycle; label: string; hint?: string }[] = [
    { id: "monthly", label: "Monthly" },
    { id: "yearly", label: "Yearly", hint: "Save 17%" },
    { id: "lifetime", label: "Lifetime", hint: "Best Value" },
  ];

  return (
    <section id="pricing" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-4xl md:text-5xl font-bold">
            Simple, <span className="gradient-text">creator-first</span> pricing
          </h2>
          <p className="mt-4 text-muted-foreground">
            Subscribe for fresh monthly credits — or pay once and own it for life.
          </p>
          <div className="mt-8 inline-flex items-center gap-1 rounded-full glass p-1 border border-border/60">
            {tabs.map((t) => {
              const active = cycle === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCycle(t.id)}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition flex items-center gap-2 ${
                    active ? "gradient-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {t.hint && (
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold ${
                      active ? "bg-white/20 text-white" : "bg-[color:var(--brand-orange)]/20 text-[color:var(--brand-orange)]"
                    }`}>
                      {t.hint}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`grid gap-5 ${list.length >= 5 ? "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : list.length === 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-2 lg:grid-cols-3"}`}>
          {list.map((p) => <LandingCard key={p.id} p={p} cycle={cycle} />)}
        </div>

        {!isLoading && plans.length === 0 && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Plans are temporarily unavailable.
            {error && <div className="mt-1 text-xs opacity-70">({error.message})</div>}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
            Compare plans, credit packs & FAQ →
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingCard({ p, cycle }: { p: PricingPlan; cycle: BillingCycle }) {
  const isLifetime = p.planType === "lifetime" || cycle === "lifetime";
  const effective: BillingCycle = p.planType === "lifetime" ? "lifetime" : cycle;
  const price = effective === "monthly" ? p.priceMonthlyUsd : effective === "yearly" ? p.priceYearlyUsd : p.priceLifetimeUsd;
  const isFree = p.planType === "free" && price === 0;
  const suffix = p.contactSales ? "" : isFree ? "" : effective === "lifetime" ? "one-time" : effective === "yearly" ? "/year" : "/month";
  const priceLabel = p.contactSales ? "Custom" : isFree ? "$0" : usd(price);
  const showBadge = p.badge || (p.featured ? "🚀 Recommended" : null);

  return (
    <div className={`glass rounded-2xl p-6 relative flex flex-col transition hover:-translate-y-0.5 ${
      p.featured ? "border-[color:var(--brand-orange)]/60 shadow-[var(--shadow-glow)]" : ""
    } ${p.contactSales ? "border-[color:var(--brand-orange)]/60" : ""}`}>
      {showBadge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1">
          <Star className="w-3 h-3 fill-white" /> {showBadge}
        </div>
      )}
      {isLifetime && p.planType === "lifetime" && (
        <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-amber-400/20 text-amber-300 text-[10px] px-2 py-0.5 font-semibold uppercase">
          <InfinityIcon className="w-2.5 h-2.5" /> Lifetime
        </span>
      )}
      <h3 className="text-xl font-semibold">{p.name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{priceLabel}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {cycle === "yearly" && p.priceYearlyUsd > 0 && !isFree && !p.contactSales && p.planType !== "lifetime" && (
        <div className="mt-1 text-xs text-muted-foreground">
          ≈ {usd(Math.round(p.priceYearlyUsd / 12))}/mo
          {p.discountPct > 0 && <span className="ml-2 text-[color:var(--brand-orange)] font-semibold">Save {p.discountPct}%</span>}
        </div>
      )}
      <ul className="mt-6 space-y-2.5 flex-1">
        {p.features.slice(0, 6).map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.contactSales ? "text-[color:var(--brand-orange)]" : "text-[color:var(--neon-purple)]"}`} />
            <span>{f}</span>
          </li>
        ))}
        {!p.contactSales && (
          <li className="flex items-start gap-2 text-sm">
            <Check className="w-4 h-4 mt-0.5 shrink-0 text-[color:var(--neon-purple)]" />
            <span>{planUpdatesLine({ planType: p.planType, isFree, cycle })}</span>
          </li>
        )}
      </ul>
      <Link
        to={p.contactSales ? "/contact" : "/pricing"}
        className={`mt-8 block text-center rounded-lg py-3 text-sm font-medium ${
          p.contactSales
            ? "bg-[color:var(--brand-orange)] text-black hover:opacity-90"
            : p.featured
              ? "gradient-primary text-white"
              : "glass hover:bg-white/5"
        }`}
      >
        {p.contactSales ? "Contact Sales" : isFree ? "Start free" : "View plan"}
      </Link>
    </div>
  );
}
