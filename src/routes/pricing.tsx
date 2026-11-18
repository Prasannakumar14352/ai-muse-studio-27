import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listPricingPlans,
  type PricingPlan,
  type BillingCycle,
} from "@/lib/pricing.functions";
import { createRazorpayOrder, verifyRazorpayPayment, createRazorpayPlanOrder, getUsdInrRate } from "@/lib/razorpay.functions";
import { CREDIT_PACKS, type CreditPack } from "@/lib/constants";
import { useAccess } from "@/lib/access";
import { toast } from "sonner";
import {
  Check, Sparkles, Crown, X, ChevronDown, Loader2, ArrowRight,
  Infinity as InfinityIcon, Star, Zap,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";

const plansQuery = queryOptions({
  queryKey: ["pricing-plans"],
  queryFn: () => listPricingPlans(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — CreatorFlow AI" },
      { name: "description", content: "Simple, affordable pricing for CreatorFlow AI in USD. Monthly, yearly (save ~17%) or pay once for lifetime access." },
      { property: "og:title", content: "Pricing — CreatorFlow AI" },
      { property: "og:description", content: "Monthly, yearly or lifetime access — pick what fits your workflow." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Pricing — CreatorFlow AI" },
      { name: "twitter:description", content: "Monthly, yearly or lifetime access — pick what fits your workflow." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  errorComponent: ({ error }) => <div className="p-8 text-red-400">Pricing failed to load: {error instanceof Error ? error.message : String(error)}</div>,
  notFoundComponent: () => <div className="p-8">Pricing not found.</div>,
  component: PricingPage,
});

/* ---------- helpers ---------- */
function usd(n: number) {
  return `$${n.toLocaleString("en-US")}`;
}
function priceForCycle(p: PricingPlan, cycle: BillingCycle): number {
  return cycle === "monthly" ? p.priceMonthlyUsd : cycle === "yearly" ? p.priceYearlyUsd : p.priceLifetimeUsd;
}
function suffixForCycle(cycle: BillingCycle): string {
  return cycle === "monthly" ? "/month" : cycle === "yearly" ? "/year" : "one-time";
}

/* ---------- page ---------- */
function PricingPage() {
  const { data } = useSuspenseQuery(plansQuery);
  const plans = data.plans;
  const { data: access } = useAccess();
  const navigate = useNavigate();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [modalPlan, setModalPlan] = useState<PricingPlan | null>(null);

  const visible = useMemo(() => {
    if (cycle === "lifetime") {
      return plans.filter((p) => p.priceLifetimeUsd > 0 || p.planType === "lifetime");
    }
    // monthly & yearly: everything except lifetime-only rows
    return plans.filter((p) => p.planType !== "lifetime");
  }, [plans, cycle]);

  const handleSelect = (p: PricingPlan) => {
    if (p.contactSales) return;
    if (p.priceMonthlyUsd === 0 && p.priceYearlyUsd === 0 && p.priceLifetimeUsd === 0) return; // free
    if (!access?.email) {
      navigate({ to: "/auth", search: { next: "/pricing" } });
      return;
    }
    setModalPlan(p);
  };

  return (
    <PublicShell>
      <div className="space-y-16 max-w-7xl mx-auto pb-32 px-4 sm:px-6 pt-10">
        <header className="text-center max-w-3xl mx-auto pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-4">
            <Sparkles className="w-3 h-3 text-[color:var(--brand-orange)]" /> Simple pricing · Cancel anytime
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Pricing that scales <br className="hidden md:block" />
            with your <span className="gradient-text">creativity</span>
          </h1>
          <p className="text-muted-foreground mt-4 text-base md:text-lg">
            Monthly, yearly (save ~17%) — or pay once and own it for life.
          </p>
          {access?.isAdmin && (
            <div className="mt-4 inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-sm">
              <Crown className="w-4 h-4 text-amber-400" /> Admin — Unlimited access, no billing
            </div>
          )}

          <CycleTabs cycle={cycle} setCycle={setCycle} />
        </header>

        {/* Pricing cards */}
        <section className={`grid gap-6 mx-auto w-full ${
          visible.length >= 5 ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" : visible.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"
        }`}>
          {visible.map((p) => (
            <PricingCard key={p.id} plan={p} cycle={cycle} isCurrent={access?.plan === p.code} onSelect={() => handleSelect(p)} />
          ))}
        </section>

        <SubVsLifetimeCompare cycle={cycle} plans={plans} />
        <CreditPacksSection />
        <PricingFAQ />

        <div className="text-center text-sm text-muted-foreground">
          Need a custom plan or bulk credits?{" "}
          <Link to="/contact" className="text-[color:var(--brand-orange)] hover:underline">Contact us</Link>
        </div>

        {modalPlan && <CheckoutModal plan={modalPlan} cycle={cycle} onClose={() => setModalPlan(null)} />}
      </div>
    </PublicShell>
  );
}

/* ---------- tabs ---------- */
function CycleTabs({ cycle, setCycle }: { cycle: BillingCycle; setCycle: (c: BillingCycle) => void }) {
  const tabs: { id: BillingCycle; label: string; hint?: string }[] = [
    { id: "monthly", label: "Monthly" },
    { id: "yearly", label: "Yearly", hint: "Save 17%" },
    { id: "lifetime", label: "Lifetime", hint: "Best Value" },
  ];
  return (
    <div className="mt-8 inline-flex items-center gap-1 rounded-full glass p-1 border border-border/60">
      {tabs.map((t) => {
        const active = cycle === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setCycle(t.id)}
            aria-pressed={active}
            className={`px-5 py-2.5 rounded-full text-sm font-semibold transition flex items-center gap-2 ${
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
  );
}

/* ---------- pricing card ---------- */
function PricingCard({
  plan, cycle, isCurrent, onSelect,
}: {
  plan: PricingPlan; cycle: BillingCycle; isCurrent: boolean; onSelect: () => void;
}) {
  const isLifetime = cycle === "lifetime" || plan.planType === "lifetime";
  const effectiveCycle: BillingCycle = plan.planType === "lifetime" ? "lifetime" : cycle;
  const price = priceForCycle(plan, effectiveCycle);
  const isFree = price === 0 && plan.planType === "free";
  const recommended = plan.featured;
  const showBadge = plan.badge || (recommended ? "🚀 Recommended" : null);
  const monthlyEquivYearly = cycle === "yearly" && plan.priceYearlyUsd > 0
    ? Math.round(plan.priceYearlyUsd / 12)
    : null;
  const priceLabel = plan.contactSales
    ? "Custom"
    : isFree
      ? "$0"
      : usd(price);
  const suffix = plan.contactSales ? "" : isFree ? "" : suffixForCycle(effectiveCycle);

  return (
    <div
      onClick={onSelect}
      className={[
        "group relative flex flex-col rounded-3xl p-7 min-h-[560px] cursor-pointer",
        "bg-[color:var(--card)]/40 backdrop-blur-md border transition-all duration-300",
        recommended
          ? "border-[color:var(--brand-orange)]/50 shadow-[0_20px_60px_-20px_rgba(255,107,53,0.35)] bg-gradient-to-b from-[color:var(--brand-orange)]/10 to-transparent"
          : "border-border/60 hover:border-white/20",
        "hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]",
      ].join(" ")}
    >
      {showBadge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white text-[11px] uppercase tracking-wider px-3 py-1 rounded-full font-bold shadow-lg flex items-center gap-1">
          <Star className="w-3 h-3 fill-white" /> {showBadge}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">{plan.name}</h3>
          {isLifetime && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300">
              <InfinityIcon className="w-3 h-3 inline mr-0.5" /> Lifetime
            </span>
          )}
        </div>

        <div className="mt-5 flex items-baseline gap-1.5">
          <span className="text-5xl font-extrabold tracking-tight">{priceLabel}</span>
          {suffix && <span className="text-sm text-muted-foreground whitespace-nowrap">{suffix}</span>}
        </div>
        {monthlyEquivYearly && !isFree && !plan.contactSales && (
          <div className="mt-1 text-xs text-muted-foreground">
            ≈ {usd(monthlyEquivYearly)}/mo · billed yearly
            {plan.discountPct > 0 && (
              <span className="ml-2 text-[color:var(--brand-orange)] font-semibold">Save {plan.discountPct}%</span>
            )}
          </div>
        )}
        {cycle === "monthly" && plan.priceYearlyUsd > 0 && !isFree && !plan.contactSales && plan.planType !== "lifetime" && (
          <div className="mt-1 text-xs text-muted-foreground">
            or {usd(plan.priceYearlyUsd)}/yr {plan.discountPct > 0 ? `· save ${plan.discountPct}%` : ""}
          </div>
        )}

        <p className="mt-3 text-sm text-muted-foreground min-h-[40px]">
          {plan.contactSales
            ? "Custom credit pool sized to your team."
            : plan.planType === "lifetime"
              ? <>
                  Includes <strong className="text-foreground">{(plan.includedCredits || plan.monthlyCredits).toLocaleString()}</strong> credits one-time
                  {plan.includedCredits > 0 && plan.monthlyCredits > 0
                    ? <> + <strong className="text-foreground">{plan.monthlyCredits.toLocaleString()}</strong> bonus credits every month.</>
                    : "."}
                </>
              : plan.monthlyCredits > 0
                ? <>Includes <strong className="text-foreground">{plan.monthlyCredits.toLocaleString()}</strong> credits per month.</>
                : plan.includedCredits > 0
                  ? <>Includes <strong className="text-foreground">{plan.includedCredits.toLocaleString()}</strong> signup credits.</>
                  : "Free to start — no card required."}
        </p>
      </div>

      <ul className="mt-6 space-y-3 flex-1">
        {plan.features.map((f) => (
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

      <div className="mt-7">
        {plan.contactSales ? (
          <Link
            to="/contact"
            onClick={(e) => e.stopPropagation()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold bg-[color:var(--brand-orange)] text-black hover:opacity-90 transition"
          >
            Contact Sales <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <button
            disabled={isCurrent || isFree}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
              recommended
                ? "gradient-primary text-white hover:opacity-95 shadow-lg"
                : "border border-border/70 bg-white/5 hover:bg-white/10"
            }`}
          >
            {isCurrent ? "Current plan" : isFree ? "Start free" : plan.planType === "lifetime" || cycle === "lifetime" ? "Get Lifetime" : cycle === "yearly" ? "Choose Yearly" : "Choose Monthly"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- subscription vs lifetime table ---------- */
function SubVsLifetimeCompare({ cycle, plans }: { cycle: BillingCycle; plans: PricingPlan[] }) {
  const lifetime = plans.find((p) => p.planType === "lifetime");
  const rows: { label: string; sub: React.ReactNode; life: React.ReactNode }[] = [
    { label: "Billing", sub: cycle === "yearly" ? "Yearly" : "Monthly", life: "One-time" },
    { label: "Recurring charges", sub: <YesIcon />, life: <NoIcon /> },
    { label: "Monthly credits", sub: "Full plan allowance", life: lifetime && lifetime.monthlyCredits > 0 ? `Bonus: from ${lifetime.monthlyCredits.toLocaleString()} / mo` : <NoIcon /> },
    { label: "Included credits", sub: "Based on plan", life: lifetime ? `From ${(lifetime.includedCredits || lifetime.monthlyCredits).toLocaleString()} one-time` : "—" },
    { label: "Priority rendering", sub: "Higher plans", life: <YesIcon /> },
    { label: "Commercial usage", sub: <YesIcon />, life: <YesIcon /> },
    { label: "Future updates", sub: <YesIcon />, life: <YesIcon /> },
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
              <th className="text-center py-4 px-4 border-b border-border/60 font-semibold">Subscription ({cycle === "yearly" ? "Yearly" : "Monthly"})</th>
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
  return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400"><Check className="w-3.5 h-3.5" /></span>;
}
function NoIcon() {
  return <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/5 text-muted-foreground"><X className="w-3.5 h-3.5" /></span>;
}

/* ---------- FAQ ---------- */
const FAQ = [
  { q: "What's the difference between Monthly and Yearly?", a: "Yearly is the same plan billed once per year — you save about 17% compared to paying month-to-month, and you receive 12× the monthly credits upfront." },
  { q: "What is the Lifetime plan?", a: "One payment, and CreatorFlow AI is yours forever. You keep receiving 1,000 AI credits every month, plus premium templates and priority support — no recurring charges." },
  { q: "Do lifetime plans get monthly credits?", a: "Yes. Besides the one-time credits, lifetime plans get a monthly bonus (75, 150 or 300 credits) that refills on your purchase day each month. Bonus credits are used first and don't carry over to the next month; your one-time credits never expire." },
  { q: "Can I switch between Monthly, Yearly and Lifetime?", a: "Yes. Any credits already in your wallet stay put, and we deduct in the order: monthly → top-ups → lifetime, so nothing is wasted." },
  { q: "Can I buy additional credit packs?", a: "Yes. Any user can top up anytime — packs are added instantly and never expire." },
  { q: "Do failed generations cost credits?", a: "No. Credits are only deducted when a generation succeeds; failed runs are refunded automatically." },
  { q: "How is payment processed?", a: "Payments are processed securely by Razorpay in USD ($). We never store your card details." },
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
                className="w-full flex items-start justify-between gap-4 text-left"
              >
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

/* ---------- Checkout ---------- */
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

function inr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function CheckoutModal({ plan, cycle, onClose }: { plan: PricingPlan; cycle: BillingCycle; onClose: () => void }) {
  const effective: BillingCycle = plan.planType === "lifetime" ? "lifetime" : cycle;
  const price = priceForCycle(plan, effective);
  const { data: access } = useAccess();
  const createOrder = useServerFn(createRazorpayPlanOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const getRate = useServerFn(getUsdInrRate);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [lastError, setLastError] = useState<{ code?: string; description?: string; source?: string; reason?: string } | null>(null);
  const [rateInfo, setRateInfo] = useState<{ rate: number; source: string; status: string; updatedAt: string | null; warning: string | null } | null>(null);
  const credits = effective === "lifetime"
    ? (plan.includedCredits || plan.monthlyCredits)
    : effective === "yearly"
      ? plan.monthlyCredits * 12
      : plan.monthlyCredits;

  useEffect(() => {
    let alive = true;
    getRate()
      .then((r) => { if (alive) setRateInfo({ rate: r.rate, source: r.source, status: r.status, updatedAt: r.updatedAt, warning: r.warning }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [getRate]);
  const rate = rateInfo?.rate ?? null;

  const inrPreview = rate ? Math.round(price * rate) : null;

  async function handlePay() {
    setPaying(true);
    setLastError(null);
    try {
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) throw new Error("Could not load Razorpay checkout");
      const order = await createOrder({ data: { planId: plan.id, billingCycle: effective } });
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "CreatorFlow AI",
          description: `${plan.name} — ${order.plan.credits.toLocaleString()} credits (${effective})`,
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
              setLastError({ description: msg, source: "verification" });
              toast.error(msg);
              reject(e);
            }
          },
          modal: {
            ondismiss: () => {
              setPaying(false);
              resolve();
            },
          },
        }) as { open: () => void; on?: (event: string, cb: (payload: unknown) => void) => void };
        // Capture Razorpay payment.failed for a useful error + retry.
        if (typeof rzp.on === "function") {
          rzp.on("payment.failed", (payload: unknown) => {
            const err = (payload as { error?: { code?: string; description?: string; source?: string; reason?: string } })?.error;
            const info = {
              code: err?.code,
              description: err?.description ?? "Payment failed",
              source: err?.source,
              reason: err?.reason,
            };
            setLastError(info);
            toast.error(`${info.code ?? "Payment failed"}: ${info.description}`);
          });
        }
        rzp.open();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start checkout";
      setLastError({ description: msg, source: "client" });
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
          <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center text-white font-bold text-sm">₹</div>
          <div>
            <div className="font-semibold">Checkout</div>
            <div className="text-xs text-muted-foreground">Secure payment · Razorpay · Charged in INR</div>
          </div>
        </div>
        <div className="glass rounded-xl p-4 mb-3 space-y-2 text-sm">
          <div className="flex justify-between"><span>Plan</span><span className="font-medium">{plan.name}</span></div>
          <div className="flex justify-between"><span>Billing</span><span className="font-medium capitalize">{effective}</span></div>
          <div className="flex justify-between"><span>Credits</span><span className="font-medium">{credits.toLocaleString()}{effective === "lifetime" ? (plan.monthlyCredits > 0 && plan.includedCredits > 0 ? ` one-time + ${plan.monthlyCredits.toLocaleString()} / month bonus` : " one-time") : ""}</span></div>
          <div className="flex justify-between"><span>Listed price</span><span className="font-medium">{usd(price)}<span className="text-xs text-muted-foreground ml-1">{suffixForCycle(effective)}</span></span></div>
          <div className="flex justify-between"><span>Exchange rate</span><span className="font-medium">{rate ? `1 USD = ₹${rate.toFixed(2)}` : "…"}</span></div>
          {rateInfo && (
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Rate source</span>
              <span>
                <span className={
                  rateInfo.status === "live" ? "text-emerald-300"
                    : rateInfo.status === "cached" ? "text-sky-300"
                    : rateInfo.status === "manual" ? "text-purple-300"
                    : "text-amber-300"
                }>
                  {rateInfo.status === "live" ? "Live" : rateInfo.status === "cached" ? "Cached" : rateInfo.status === "manual" ? "Manual" : "Stale"}
                </span>
                {rateInfo.updatedAt ? ` · ${new Date(rateInfo.updatedAt).toLocaleString()}` : ""}
              </span>
            </div>
          )}
          {rateInfo?.warning && (
            <div className="text-[11px] text-amber-300">{rateInfo.warning}</div>
          )}
          <div className="flex justify-between text-base pt-2 border-t border-border/40">
            <span className="font-semibold">Payable today</span>
            <span className="font-bold gradient-text">{inrPreview !== null ? inr(inrPreview) : "…"}</span>
          </div>
        </div>
        <button
          onClick={handlePay}
          disabled={paying || !rate}
          className="w-full rounded-lg gradient-primary text-white py-3 font-medium flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {paying && <Loader2 className="w-4 h-4 animate-spin" />}
          {paying ? "Opening checkout…" : lastError ? "Retry payment" : inrPreview !== null ? `Pay ${inr(inrPreview)}` : "Loading…"}
        </button>
        {lastError && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-100 p-3 text-xs">
            <div className="font-semibold mb-1">Payment did not complete</div>
            <div>{lastError.description}</div>
            {(lastError.code || lastError.source || lastError.reason) && (
              <div className="mt-1 text-[10px] opacity-75 font-mono">
                {[lastError.code, lastError.source, lastError.reason].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        )}
        <p className="mt-2 text-[11px] text-center text-muted-foreground">
          Final payment is processed in INR through Razorpay. Credits are only granted after a successful payment.
        </p>
      </div>
    </div>
  );
}

/* ---------- Credit packs (unchanged behavior) ---------- */
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
      const order = await createOrder({ data: { packId: pack.id, currency: "USD" } });
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "CreatorFlow AI",
          description: `${pack.label} — ${pack.credits} credits`,
          prefill: access?.email ? { email: access.email } : {},
          theme: { color: "#ff6b35" },
          handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const result = await verifyPayment({ data: resp });
              toast.success(`Added ${result.credits.toLocaleString()} credits`);
              await qc.invalidateQueries({ queryKey: ["access"] });
              onClose(resolve);
            } catch (e) {
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
      setBuyingId(null);
    }
    function onClose(res: () => void) { res(); }
  }

  return (
    <section>
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Zap className="w-3.5 h-3.5" /> Need more credits?
        </div>
        <h2 className="text-2xl md:text-3xl font-bold mt-2">One-time credit packs</h2>
        <p className="text-sm text-muted-foreground mt-2">Credits never expire. Stacks on top of any plan.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CREDIT_PACKS.map((pack) => (
          <div key={pack.id} className="glass rounded-2xl p-5 flex flex-col hover:-translate-y-0.5 transition">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{pack.label}</div>
              {pack.bonus && (
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                  {pack.bonus}
                </span>
              )}
            </div>
            <div className="mt-3 text-3xl font-extrabold">{pack.credits.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">credits</div>
            <div className="mt-3 text-lg font-bold gradient-text">${pack.priceUSD.toFixed(2)}</div>
            <button
              onClick={() => handleBuy(pack)}
              disabled={buyingId === pack.id}
              className="mt-4 w-full rounded-xl py-2.5 text-sm font-semibold border border-border/70 hover:bg-white/10 transition disabled:opacity-60"
            >
              {buyingId === pack.id ? "Opening…" : "Buy pack"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
