import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PLANS, type PlanDef, CREDIT_PACKS, type CreditPack } from "@/lib/constants";
import { getPlanGenerationEstimate } from "@/lib/credit-costs";
import { useAccess } from "@/lib/access";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createRazorpayOrder, verifyRazorpayPayment, createRazorpayPlanOrder } from "@/lib/razorpay.functions";
import { toast } from "sonner";
import {
  Check, Sparkles, Crown, X, Image as ImageIcon, Layers, Film, Video,
  ChevronDown, Zap, Loader2, ArrowRight, Infinity as InfinityIcon, Star,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — CreatorVault AI" },
      { name: "description", content: "Simple pricing for CreatorVault AI. Subscribe monthly for fresh AI credits — or pay once and own it for life." },
      { property: "og:title", content: "Pricing — CreatorVault AI" },
      { property: "og:description", content: "Subscribe monthly or pay once for lifetime access." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Pricing — CreatorVault AI" },
      { name: "twitter:description", content: "Subscribe monthly or pay once for lifetime access." },
    ],
  }),
  component: PricingPage,
});

/* ---------- Marketing metadata (UI only — no billing logic changes) ---------- */

type PlanCopy = {
  tagline: string;
  features: string[];
  cta?: string;
  recommended?: boolean;
};

const PLAN_COPY: Record<string, PlanCopy> = {
  free: {
    tagline: "Try it free",
    features: [
      "50 signup credits",
      "All AI content types",
      "Basic templates",
      "Community styles",
      "Manual publishing",
    ],
    cta: "Start free",
  },
  starter: {
    tagline: "Best for beginners",
    features: [
      "300 monthly credits",
      "All AI content types",
      "Standard rendering",
      "Download assets",
      "Manual publishing",
      "Purchase additional credits",
    ],
    cta: "Start Starter plan",
  },
  creator: {
    tagline: "Most popular",
    recommended: true,
    features: [
      "1,000 monthly credits",
      "Everything in Starter",
      "Priority rendering",
      "Premium templates",
      "Brand kits",
      "Character consistency",
      "Direct publishing",
      "Purchase additional credits",
    ],
    cta: "Upgrade to Creator",
  },
  pro: {
    tagline: "For power users",
    features: [
      "3,000 monthly credits",
      "Everything in Creator",
      "Priority queue",
      "Advanced AI features",
      "Premium brand kits",
      "Faster rendering",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
  },
  team: {
    tagline: "For teams & agencies",
    features: [
      "Multi-seat workspace",
      "Shared brand kits & presets",
      "Custom monthly credit pool",
      "Dedicated priority rendering",
      "Onboarding & Slack support",
      "Invoiced billing available",
    ],
    cta: "Contact sales",
  },
  starter_life: {
    tagline: "Own it forever",
    features: [
      "Lifetime account",
      "500 included credits",
      "Videos, Shorts, Carousels",
      "Images, Thumbnails",
      "LinkedIn posts, Captions",
      "Unlimited downloads",
      "Commercial use",
      "Buy additional credits anytime",
    ],
    cta: "Buy Lifetime",
  },
  creator_life: {
    tagline: "Best lifetime value",
    recommended: true,
    features: [
      "Everything in Starter Lifetime",
      "1,500 included credits",
      "Premium templates",
      "Larger storage",
      "Faster rendering",
      "Buy additional credits anytime",
    ],
    cta: "Buy Lifetime",
  },
  pro_life: {
    tagline: "Ultimate lifetime",
    features: [
      "Everything in Creator Lifetime",
      "5,000 included credits",
      "Premium templates",
      "Priority rendering",
      "Priority support",
      "Buy additional credits anytime",
    ],
    cta: "Buy Lifetime",
  },
};

function copyFor(p: PlanDef): PlanCopy {
  return PLAN_COPY[p.id] ?? { tagline: "", features: p.features };
}

/* ---------- Page ---------- */

function PricingPage() {
  const { data: access } = useAccess();
  const navigate = useNavigate();
  const [modalPlan, setModalPlan] = useState<PlanDef | null>(null);
  const [tab, setTab] = useState<"subscription" | "lifetime">("subscription");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly"); // UI-only
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const monthlyPlans = useMemo(
    () => PLANS.filter((p) => p.planType === "free" || p.planType === "monthly" || p.planType === "enterprise"),
    []
  );
  const lifetimePlans = useMemo(() => PLANS.filter((p) => p.planType === "lifetime"), []);
  const visiblePlans = tab === "lifetime" ? lifetimePlans : monthlyPlans;

  const selectedPlan =
    (selectedId && visiblePlans.find((p) => p.id === selectedId)) ||
    visiblePlans.find((p) => copyFor(p).recommended) ||
    visiblePlans[0];

  const handleSelect = (p: PlanDef) => {
    setSelectedId(p.id);
    if (p.contactSales || p.id === "free") return;
    if (!access?.email) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    setModalPlan(p);
  };

  return (
    <PublicShell>
      <div className="space-y-16 max-w-7xl mx-auto pb-32 px-4 sm:px-6 pt-10">

        {/* Header */}
        <header className="text-center max-w-3xl mx-auto pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-4">
            <Sparkles className="w-3 h-3 text-[color:var(--brand-orange)]" /> Simple pricing · Cancel anytime
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Pricing that scales <br className="hidden md:block" />
            with your <span className="gradient-text">creativity</span>
          </h1>
          <p className="text-muted-foreground mt-4 text-base md:text-lg">
            Choose a monthly subscription for fresh credits — or pay once and own it for life.
          </p>
          {access?.isAdmin && (
            <div className="mt-4 inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-sm">
              <Crown className="w-4 h-4 text-amber-400" /> Admin — Unlimited access, no billing
            </div>
          )}

          {/* Top-level tabs */}
          <div className="mt-8 inline-flex items-center gap-1 rounded-full glass p-1 border border-border/60">
            {([
              { id: "subscription", label: "Subscription Plans" },
              { id: "lifetime", label: "Lifetime Plans" },
            ] as const).map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => { setTab(t.id); setSelectedId(null); }}
                  aria-pressed={active}
                  className={`px-5 py-2.5 rounded-full text-sm font-semibold transition ${
                    active
                      ? "gradient-primary text-white shadow-lg"
                      : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Monthly / Yearly toggle (subscription only, UI-only) */}
          {tab === "subscription" && (
            <div className="mt-5 inline-flex items-center gap-3 text-sm">
              <span className={billingCycle === "monthly" ? "text-foreground font-medium" : "text-muted-foreground"}>Monthly</span>
              <button
                type="button"
                onClick={() => setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")}
                className="relative w-12 h-6 rounded-full bg-white/10 border border-border/60 transition"
                aria-label="Toggle billing cycle">
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full gradient-primary transition-all ${
                    billingCycle === "yearly" ? "left-6" : "left-0.5"
                  }`}
                />
              </button>
              <span className={billingCycle === "yearly" ? "text-foreground font-medium" : "text-muted-foreground"}>
                Yearly
              </span>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-[color:var(--brand-orange)]/20 text-[color:var(--brand-orange)]">
                Save 20%
              </span>
            </div>
          )}
          {tab === "subscription" && billingCycle === "yearly" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Yearly billing is launching soon — you'll see monthly pricing for now.
            </p>
          )}
          {tab === "lifetime" && (
            <p className="mt-5 text-xs text-muted-foreground">
              One payment. No recurring charges. Credits added at purchase — top up any time.
            </p>
          )}
        </header>

        {/* Pricing cards */}
        <section className={`grid gap-6 mx-auto w-full ${
          visiblePlans.length >= 4 ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3"
        }`}>
          {visiblePlans.map((p) => (
            <PricingCard
              key={p.id}
              plan={p}
              isCurrent={access?.plan === p.id}
              isSelected={selectedPlan?.id === p.id}
              onSelect={() => handleSelect(p)}
            />
          ))}
        </section>

        {/* Subscription vs Lifetime comparison */}
        <SubVsLifetimeCompare />

        {/* Credit packs */}
        <CreditPacksSection />

        {/* Which plan is right */}
        <WhichPlanForMe />

        {/* FAQ */}
        <PricingFAQ />

        <div className="text-center text-sm text-muted-foreground">
          Need custom / team pricing?{" "}
          <Link to="/contact" className="text-[color:var(--brand-orange)] hover:underline">
            Contact us
          </Link>
        </div>

        {modalPlan && <CheckoutModal plan={modalPlan} onClose={() => setModalPlan(null)} />}
      </div>

      {/* Sticky summary bar */}
      {selectedPlan && !modalPlan && (
        <StickyPlanBar
          plan={selectedPlan}
          tab={tab}
          onCta={() => handleSelect(selectedPlan)}
          isCurrent={access?.plan === selectedPlan.id}
        />
      )}
    </PublicShell>
  );
}

/* ---------- Pricing card ---------- */

function PricingCard({
  plan: p, isCurrent, isSelected, onSelect,
}: {
  plan: PlanDef; isCurrent: boolean; isSelected: boolean; onSelect: () => void;
}) {
  const copy = copyFor(p);
  const isLifetime = p.planType === "lifetime";
  const totalCredits = isLifetime
    ? (p.includedCredits ?? 0)
    : p.monthlyCredits + (p.signupCredits ?? 0);
  const recommended = copy.recommended;

  return (
    <div
      onClick={onSelect}
      className={[
        "relative flex flex-col rounded-3xl p-7 min-h-[600px] cursor-pointer",
        "bg-[color:var(--card)]/40 backdrop-blur-md border transition-all duration-300",
        recommended
          ? "border-[color:var(--brand-orange)]/50 shadow-[0_20px_60px_-20px_rgba(255,107,53,0.35)] bg-gradient-to-b from-[color:var(--brand-orange)]/10 to-transparent"
          : "border-border/60 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-[0_15px_45px_-20px_rgba(0,0,0,0.7)]",
        isSelected && !recommended ? "ring-1 ring-[color:var(--brand-orange)]/60" : "",
      ].join(" ")}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white text-[11px] uppercase tracking-wider px-3 py-1 rounded-full font-bold shadow-lg flex items-center gap-1">
          <Star className="w-3 h-3 fill-white" /> {copy.tagline || "Recommended"}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">{p.name}</h3>
          {isLifetime && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300">
              <InfinityIcon className="w-3 h-3 inline mr-0.5" /> Lifetime
            </span>
          )}
        </div>
        {!recommended && copy.tagline && (
          <div className="mt-1 text-xs font-medium text-[color:var(--brand-orange)]">
            {copy.tagline}
          </div>
        )}

        <div className="mt-5 flex items-baseline gap-1.5">
          <span className="text-5xl font-extrabold tracking-tight">{p.price}</span>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {isLifetime ? "one-time" : p.period}
          </span>
        </div>

        <p className="mt-3 text-sm text-muted-foreground min-h-[40px]">
          {p.contactSales
            ? "Custom credit pool sized to your team."
            : isLifetime
              ? <>Includes <strong className="text-foreground">{totalCredits.toLocaleString()}</strong> credits · one-time.</>
              : totalCredits > 0
                ? <>Includes <strong className="text-foreground">{totalCredits.toLocaleString()}</strong> credits{p.signupCredits ? " + signup bonus" : " per month"}.</>
                : "Free to start — no card required."}
        </p>
      </div>

      {/* Features */}
      <ul className="mt-6 space-y-3 flex-1">
        {copy.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <span className={`mt-0.5 shrink-0 rounded-full w-4 h-4 flex items-center justify-center ${
              recommended ? "bg-[color:var(--brand-orange)]/20" : "bg-white/10"
            }`}>
              <Check className={`w-2.5 h-2.5 ${recommended ? "text-[color:var(--brand-orange)]" : "text-foreground/80"}`} />
            </span>
            <span className="text-foreground/90 leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <div className="mt-7">
        {p.contactSales ? (
          <Link
            to="/contact"
            onClick={(e) => e.stopPropagation()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold bg-[color:var(--brand-orange)] text-black hover:opacity-90 transition">
            {copy.cta ?? p.cta} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button
            disabled={isCurrent || p.id === "free"}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
              recommended
                ? "gradient-primary text-white hover:opacity-95 shadow-lg"
                : "border border-border/70 bg-white/5 hover:bg-white/10"
            }`}>
            {isCurrent ? "Current plan" : (copy.cta ?? p.cta)}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Subscription vs Lifetime ---------- */

function SubVsLifetimeCompare() {
  const rows: { label: string; sub: React.ReactNode; life: React.ReactNode }[] = [
    { label: "Monthly Credits",       sub: <YesIcon />,  life: <NoIcon /> },
    { label: "One-Time Payment",      sub: <NoIcon />,   life: <YesIcon /> },
    { label: "Lifetime Access",       sub: <NoIcon />,   life: <YesIcon /> },
    { label: "Purchase Credit Packs", sub: <YesIcon />,  life: <YesIcon /> },
    { label: "Premium AI Features",   sub: "Higher plans",  life: "Higher lifetime plans" },
    { label: "Priority Rendering",    sub: "Higher plans",  life: "Higher lifetime plans" },
    { label: "Commercial Usage",      sub: <YesIcon />,  life: <YesIcon /> },
  ];
  return (
    <section className="glass rounded-3xl p-6 md:p-8">
      <div className="text-center mb-8">
        <h2 className="text-2xl md:text-3xl font-bold">Subscription vs Lifetime</h2>
        <p className="text-sm text-muted-foreground mt-2">Compare what's included in each pricing model.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="text-left py-4 px-4 text-xs uppercase tracking-wider text-muted-foreground font-semibold border-b border-border/60">Feature</th>
              <th className="text-center py-4 px-4 border-b border-border/60 font-semibold">Subscription</th>
              <th className="text-center py-4 px-4 border-b border-border/60 font-semibold text-[color:var(--brand-orange)]">Lifetime</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className={i % 2 === 0 ? "bg-white/[0.02]" : ""}>
                <td className="py-3.5 px-4 text-foreground/90 font-medium">{r.label}</td>
                <td className="py-3.5 px-4 text-center">{r.sub}</td>
                <td className="py-3.5 px-4 text-center">{r.life}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function YesIcon() {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400">
      <Check className="w-3.5 h-3.5" />
    </span>
  );
}
function NoIcon() {
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/5 text-muted-foreground">
      <X className="w-3.5 h-3.5" />
    </span>
  );
}

/* ---------- Which plan is right for me ---------- */

function WhichPlanForMe() {
  return (
    <section>
      <div className="text-center mb-8">
        <h2 className="text-2xl md:text-3xl font-bold">Which plan is right for you?</h2>
        <p className="text-sm text-muted-foreground mt-2">Pick the model that matches how you create.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-3xl p-7 border border-border/60 bg-[color:var(--card)]/40 backdrop-blur">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold">Subscription Plans</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Best for:</p>
          <ul className="space-y-2.5 text-sm">
            {["Regular content creators","Agencies","Businesses","Frequent AI generation","Users who want fresh monthly credits"].map((x) => (
              <li key={x} className="flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 text-[color:var(--brand-orange)] shrink-0" />{x}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl p-7 border border-amber-400/40 bg-gradient-to-b from-amber-400/10 to-transparent">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center text-black">
              <InfinityIcon className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold">Lifetime Plans</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">Best for:</p>
          <ul className="space-y-2.5 text-sm">
            {["Freelancers","Small businesses","Occasional creators","Users who dislike subscriptions","Users who prefer one-time ownership"].map((x) => (
              <li key={x} className="flex items-start gap-2">
                <Check className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" />{x}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */

const FAQ = [
  { q: "Can I switch from Lifetime to Subscription?", a: "Yes. Your lifetime credits stay in your wallet and are used after any active subscription's monthly credits. You can start a subscription at any time from Settings → Plans & credits." },
  { q: "Can I buy additional credits?", a: "Yes. Both subscription and lifetime users can buy one-time credit packs anytime. Packs are added instantly to your wallet and never expire." },
  { q: "Do Lifetime credits expire?", a: "No. Included lifetime credits and top-up packs never expire. They stay in your wallet until you use them." },
  { q: "Do Monthly credits roll over?", a: "No. Monthly subscription credits reset at the start of each billing cycle. Top-up and lifetime credits do not reset — they roll forever." },
  { q: "Can I upgrade my plan?", a: "Yes. Upgrades take effect immediately and unused credits carry into the new plan. You're only charged the prorated difference at the next cycle." },
  { q: "Can I downgrade?", a: "Yes. Downgrades apply at the end of your current billing cycle so you don't lose credits you've already paid for." },
  { q: "What happens if my subscription expires?", a: "Your monthly credit allotment stops renewing, but your top-up credits and lifetime credits (if any) stay in your wallet and can be used as normal." },
  { q: "In what order are credits used?", a: "Monthly subscription credits are spent first, then top-up credits, then lifetime credits — so you never waste a bucket you can't refill." },
  { q: "Do failed generations cost credits?", a: "No. Credits are only deducted when a generation succeeds. Failed runs are refunded automatically." },
];

function PricingFAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="glass rounded-3xl p-6 md:p-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-bold">Frequently asked questions</h2>
        <p className="text-sm text-muted-foreground mt-2">Everything about plans, credits, and billing.</p>
      </div>
      <div className="max-w-3xl mx-auto divide-y divide-border/50">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="py-4">
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

/* ---------- Sticky summary bar ---------- */

function StickyPlanBar({
  plan, tab, onCta, isCurrent,
}: {
  plan: PlanDef; tab: "subscription" | "lifetime"; onCta: () => void; isCurrent: boolean;
}) {
  const isLifetime = plan.planType === "lifetime";
  const credits = isLifetime ? (plan.includedCredits ?? 0) : plan.monthlyCredits + (plan.signupCredits ?? 0);
  const copy = copyFor(plan);
  const disabled = isCurrent || plan.id === "free";
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-[color:var(--background)]/85 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex-1 flex items-center gap-4 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected plan</span>
            <span className="text-sm font-semibold truncate">{plan.name}</span>
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</span>
            <span className="text-sm font-bold gradient-text">{plan.price}<span className="text-xs text-muted-foreground font-normal ml-1">{isLifetime ? "one-time" : plan.period}</span></span>
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Credits</span>
            <span className="text-sm font-semibold">{credits > 0 ? credits.toLocaleString() : (plan.contactSales ? "Custom" : "—")}</span>
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Billing</span>
            <span className="text-sm font-semibold">{isLifetime ? "One-time" : tab === "subscription" ? "Recurring" : "—"}</span>
          </div>
        </div>
        {plan.contactSales ? (
          <Link to="/contact" className="rounded-xl px-5 py-2.5 text-sm font-semibold bg-[color:var(--brand-orange)] text-black hover:opacity-90">
            Contact sales
          </Link>
        ) : (
          <button
            onClick={onCta}
            disabled={disabled}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold gradient-primary text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
            {isCurrent ? "Current plan" : (copy.cta ?? plan.cta)}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Checkout modal ---------- */

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

function EstRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-muted-foreground">{icon} {label}</span>
      <strong className="text-foreground">up to ~{value.toLocaleString()}</strong>
    </div>
  );
}

/* ---------- Credit packs ---------- */

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
          handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
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
          modal: { ondismiss: () => resolve() },
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
    <section>
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-3">
          <Zap className="w-3 h-3 text-[color:var(--brand-orange)]" /> Available on every plan
        </div>
        <h2 className="text-2xl md:text-3xl font-bold">Need more credits?</h2>
        <p className="text-sm text-muted-foreground mt-2">
          One-time top-ups. Added instantly · Never expire · Works with subscription and lifetime plans.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {CREDIT_PACKS.map((pack) => {
          const busy = buyingId === pack.id;
          return (
            <div
              key={pack.id}
              className="rounded-2xl p-5 flex flex-col border border-border/60 bg-[color:var(--card)]/40 backdrop-blur hover:border-[color:var(--brand-orange)]/50 hover:-translate-y-0.5 transition-all">
              <div className="flex items-start justify-between">
                <div className="text-xs text-muted-foreground">{pack.label}</div>
                {pack.bonus && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--brand-orange)]/20 text-[color:var(--brand-orange)] font-bold">
                    {pack.bonus}
                  </span>
                )}
              </div>
              <div className="mt-2 text-2xl font-extrabold">
                {pack.credits.toLocaleString()}
                <span className="text-xs text-muted-foreground font-normal ml-1">credits</span>
              </div>
              <div className="mt-2 text-3xl font-bold gradient-text">${pack.priceUSD}</div>
              <div className="text-[10px] text-muted-foreground">
                ≈ ${((pack.priceUSD / pack.credits) * 100).toFixed(2)} / 100
              </div>
              <button
                onClick={() => handleBuy(pack)}
                disabled={busy || !!buyingId}
                className="mt-4 w-full rounded-xl gradient-primary text-white py-2.5 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5">
                {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> …</> : "Buy Credits"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground text-center">
        Payments processed securely by Razorpay · Cards, UPI and international methods supported.
      </p>
    </section>
  );
}
