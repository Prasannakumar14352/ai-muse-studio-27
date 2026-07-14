// Landing-page pricing section with Monthly/Lifetime tabs. Reuses the plan
// definitions from constants; keeps CTA linking to /auth or /pricing.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Star, Infinity as InfinityIcon } from "lucide-react";
import { PLANS, type PlanDef } from "@/lib/constants";

export function LandingPricingTabs() {
  const [tab, setTab] = useState<"subscription" | "lifetime">("subscription");
  const monthly = PLANS.filter((p) => p.planType === "free" || p.planType === "monthly" || p.planType === "enterprise");
  const lifetime = PLANS.filter((p) => p.planType === "lifetime");
  const list = tab === "lifetime" ? lifetime : monthly;

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
            {([
              { id: "subscription", label: "Subscription" },
              { id: "lifetime", label: "Lifetime" },
            ] as const).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition ${
                    active ? "gradient-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`grid gap-5 ${list.length >= 4 ? "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : "md:grid-cols-2 lg:grid-cols-3"}`}>
          {list.map((p) => <LandingCard key={p.id} p={p} />)}
        </div>

        <div className="mt-8 text-center">
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
            Compare plans, credit packs & FAQ →
          </Link>
        </div>
      </div>
    </section>
  );
}

function LandingCard({ p }: { p: PlanDef }) {
  const isLifetime = p.planType === "lifetime";
  return (
    <div className={`glass rounded-2xl p-6 relative flex flex-col ${p.featured ? "border-[color:var(--brand-orange)]/60 shadow-[var(--shadow-glow)]" : ""} ${p.contactSales ? "border-[color:var(--brand-orange)]/60" : ""}`}>
      {p.featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white text-xs px-3 py-1 rounded-full font-medium flex items-center gap-1">
          <Star className="w-3 h-3 fill-white" /> Recommended
        </div>
      )}
      {isLifetime && (
        <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-amber-400/20 text-amber-300 text-[10px] px-2 py-0.5 font-semibold uppercase">
          <InfinityIcon className="w-2.5 h-2.5" /> Lifetime
        </span>
      )}
      <h3 className="text-xl font-semibold">{p.name}</h3>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold">{p.price}</span>
        <span className="text-sm text-muted-foreground">{isLifetime ? "one-time" : p.period}</span>
      </div>
      <ul className="mt-6 space-y-2.5 flex-1">
        {p.features.slice(0, 6).map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.contactSales ? "text-[color:var(--brand-orange)]" : "text-[color:var(--neon-purple)]"}`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to={p.contactSales ? "/contact" : "/auth"}
        className={`mt-8 block text-center rounded-lg py-3 text-sm font-medium ${
          p.contactSales
            ? "bg-[color:var(--brand-orange)] text-black hover:opacity-90"
            : p.featured
              ? "gradient-primary text-white"
              : "glass hover:bg-white/5"
        }`}
      >
        {p.cta}
      </Link>
    </div>
  );
}
