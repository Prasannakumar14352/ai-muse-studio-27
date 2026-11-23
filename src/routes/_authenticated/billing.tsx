import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMySubscription } from "@/lib/razorpay.functions";
import { listPricingPlans } from "@/lib/pricing.functions";
import { CreditHistory } from "@/components/credit-history";
import { cancelAutopay } from "@/lib/razorpay-autopay.functions";
import { confirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { PLANS } from "@/lib/constants";
import { TopUpPacks } from "@/components/topup-packs";
import { BuyersGroupCard } from "@/components/buyers-group-card";
import {
  Crown, CheckCircle2, Clock, XCircle, ArrowRight,
  Receipt, RefreshCw, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [{ title: "Billing — CreatorFlow AI" }],
  }),
  validateSearch: (s: Record<string, unknown>): { welcome?: number } => (s.welcome ? { welcome: 1 } : {}),
  component: BillingPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="max-w-2xl mx-auto p-6 glass rounded-2xl mt-8">
        <h2 className="text-lg font-semibold text-red-400">Could not load billing</h2>
        <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : String(error)}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-4 px-4 py-2 rounded-lg gradient-primary text-white text-sm">
          Retry
        </button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-8 text-center text-muted-foreground">Not found</div>,
});

type Sub = {
  id: string;
  plan_name: string;
  plan_type?: string | null;
  lifetime_access?: boolean | null;
  included_credits?: number | null;
  status: string;
  started_at: string;
  expires_at: string | null;
  renews_at: string | null;
  monthly_credit_limit: number;
  monthly_credits_used: number;
  unlimited_usage: boolean;
  auto_renew?: boolean | null;
  payment_issue?: string | null;
  razorpay_subscription_id?: string | null;
} | null;

type Pay = {
  id: string;
  razorpay_order_id: string;
  pack_id: string;
  credits: number;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
  price_usd_cents?: number | null;
  conversion_rate?: number | null;
  amount_inr_paise?: number | null;
};

function BillingPage() {
  const fn = useServerFn(getMySubscription);
  // Plan facts come from the same pricing_plans table the Pricing page uses.
  const plansFn = useServerFn(listPricingPlans);
  const plansQ = useQuery({ queryKey: ["billing-plans"], queryFn: () => plansFn(), staleTime: 10 * 60_000 });
  const creatorCredits = plansQ.data?.plans.find((p) => p.code === "creator")?.monthlyCredits ?? null;
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => fn(),
  });

  const { welcome } = Route.useSearch();
  const sub = (data?.subscription ?? null) as Sub;
  const balance = data?.balance ?? 0;
  const isAdmin = !!data?.isAdmin;
  const payments = (data?.recentPayments ?? []) as Pay[];

  const planKey = (sub?.plan_name ?? "free").toLowerCase();
  const planDef = PLANS.find((p) => p.id === planKey) ?? PLANS[0];
  const used = sub?.monthly_credits_used ?? 0;
  const limit = sub?.monthly_credit_limit ?? 0;
  const unlimited = !!sub?.unlimited_usage || isAdmin;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  const lastPending = payments.find((p) => p.status === "pending");
  const cancelFn = useServerFn(cancelAutopay);
  const [cancelling, setCancelling] = useState(false);
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  async function handleCancelAutopay() {
    const ok = await confirmDialog({
      title: "Cancel auto-renew?",
      description: sub?.renews_at
        ? `You won't be charged again. Your plan and credits stay active until ${fmtDate(sub.renews_at)}, then you move to Free.`
        : "You won't be charged again.",
      confirmText: "Cancel auto-renew",
      cancelText: "Keep auto-renew",
      tone: "destructive",
    });
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelFn();
      toast.success("Auto-renew cancelled");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel auto-renew");
    } finally {
      setCancelling(false);
    }
  }

  const renewText = sub?.auto_renew && sub.renews_at
    ? `Renews ${fmtDate(sub.renews_at)}`
    : sub?.expires_at
      ? `Ends ${fmtDate(sub.expires_at)}`
      : sub?.renews_at
        ? `Paid until ${fmtDate(sub.renews_at)}`
        : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Billing</h1>
          <p className="text-muted-foreground mt-1.5">Your plan, credits and payments in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => refetch()} aria-label="Refresh"
            className="rounded-xl border border-border bg-secondary px-3 py-2.5 hover:bg-accent transition">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          <Link to="/invoices" className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold hover:bg-accent transition inline-flex items-center gap-1.5">
            <Receipt className="w-4 h-4" /> Invoices
          </Link>
          {!unlimited && (
            <button type="button" onClick={() => document.getElementById("topup")?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-xl gradient-primary text-white px-4 py-2.5 text-sm font-semibold shadow-[var(--shadow-glow)] hover:brightness-110 transition inline-flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Top up credits
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">Loading your billing details…</div>
      ) : (
        <>
          {sub?.payment_issue && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-amber-300">
                  {sub.payment_issue === "halted" ? "Your plan was paused — renewal payment failed" : "Your last renewal payment failed"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {sub.payment_issue === "halted"
                    ? "Razorpay couldn't charge your UPI / card after several tries, so you're on Free now. Subscribe again to restore your plan."
                    : "Razorpay will retry automatically over the next few days. Make sure your UPI AutoPay mandate or card is active and has enough balance."}
                </div>
              </div>
              {sub.payment_issue === "halted" && (
                <Link to="/pricing" className="rounded-xl gradient-primary text-white px-3 py-2 text-xs font-semibold">Subscribe again</Link>
              )}
            </div>
          )}

          <BuyersGroupCard highlight={Boolean(welcome)} />

          {/* At a glance */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="glass rounded-2xl p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Plan</div>
              <div className="text-xl font-bold capitalize [font-family:'Space_Grotesk',Inter,sans-serif]">{isAdmin ? "Admin" : planDef.name}</div>
              <div className="text-xs text-muted-foreground">
                {unlimited ? <span className="inline-flex items-center gap-1 text-primary"><Crown className="w-3 h-3" /> Unlimited</span>
                  : sub?.lifetime_access ? <span className="inline-flex items-center gap-1 text-amber-400"><Crown className="w-3 h-3" /> Lifetime</span>
                  : isAdmin ? "Full access" : `${planDef.price} ${planDef.period ?? ""}`.trim()}
              </div>
            </div>
            <div className="glass rounded-2xl p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Credit balance</div>
              <div className="text-xl font-bold [font-family:'Space_Grotesk',Inter,sans-serif]">{unlimited ? "∞" : balance.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Available to spend now</div>
            </div>
            <div className="glass rounded-2xl p-4 space-y-1.5">
              <div className="text-xs text-muted-foreground">{sub?.lifetime_access ? "Monthly bonus used" : "Used this month"}</div>
              <div className="text-xl font-bold [font-family:'Space_Grotesk',Inter,sans-serif]">
                {unlimited ? "No cap" : <>{used.toLocaleString()}<span className="text-sm text-muted-foreground font-medium"> / {limit.toLocaleString()}</span></>}
              </div>
              {!unlimited && limit > 0 && (
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 90 ? "bg-amber-500" : "gradient-primary"}`} style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              )}
            </div>
            <div className="glass rounded-2xl p-4 space-y-1">
              <div className="text-xs text-muted-foreground">Renewal</div>
              <div className="text-xl font-bold [font-family:'Space_Grotesk',Inter,sans-serif]">{renewText ? renewText.split(" ").slice(-3).join(" ") : "—"}</div>
              <div className="text-xs text-muted-foreground">
                {sub?.auto_renew && sub.renews_at ? "Auto-pay on" : sub?.expires_at ? <span className="text-amber-400">Auto-renew off</span> : renewText ? "Renew from Pricing" : "No paid plan"}
              </div>
            </div>
          </section>

          {/* Plan actions */}
          <section className="glass rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="text-sm">
              <div className="font-semibold">
                {planKey === "free" ? "Get monthly credits with a plan" : `You're on ${isAdmin ? "Admin" : planDef.name}`}
              </div>
              <div className="text-muted-foreground mt-0.5">
                {unlimited
                  ? "Your plan includes unlimited monthly usage."
                  : sub?.lifetime_access
                    ? limit > 0
                      ? `${(limit - Math.min(used, limit)).toLocaleString()} bonus credits left · refills ${nextMonthlyRefill(sub.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Bonus credits are used first and don't carry over.`
                      : "Your lifetime credits never expire."
                    : planKey === "free"
                      ? `Creator includes ${creatorCredits ? `${creatorCredits.toLocaleString()} credits every month` : "monthly credits"} plus the priority queue.`
                      : pct >= 90
                        ? "You're close to your monthly limit — top up or move up a plan."
                        : `${100 - pct}% of your monthly credits still available.`}
                {sub?.auto_renew && sub.renews_at && (
                  <> · <button onClick={handleCancelAutopay} disabled={cancelling} className="underline hover:text-foreground disabled:opacity-50">
                    {cancelling ? "Cancelling…" : "Cancel auto-renew"}
                  </button></>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {lastPending && (
                <Link to="/pricing" className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-accent transition">
                  <RefreshCw className="w-3.5 h-3.5" /> Retry pending payment
                </Link>
              )}
              <Link to="/pricing" className="rounded-xl gradient-primary text-white px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-1.5 shadow-[var(--shadow-glow)] hover:brightness-110 transition">
                {planKey === "free" ? "Upgrade plan" : "Change plan"} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>

          {/* Top-up packs — buy extra credits without leaving Billing */}
          <div id="topup" className="scroll-mt-24">
            <TopUpPacks />
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-start">
            {/* Credit history (the support bot points users here) */}
            <div id="credit-history" className="scroll-mt-24 min-w-0">
              <CreditHistory />
            </div>

            {/* Recent payments */}
            <section className="glass rounded-2xl overflow-hidden min-w-0">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="font-semibold">Recent payments</h3>
                <Link to="/invoices" className="text-xs font-semibold text-primary hover:underline">See all →</Link>
              </div>
              {payments.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No payments yet. <Link to="/pricing" className="text-primary font-semibold hover:underline">See plans</Link>.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium capitalize truncate">{p.pack_id.replace(/_/g, " ")}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · {p.credits.toLocaleString()} credits
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <div className="text-sm font-semibold">
                          {p.currency === "INR" && p.amount_inr_paise != null
                            ? `₹${Math.round(p.amount_inr_paise / 100).toLocaleString("en-IN")}`
                            : `$${(p.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.currency}`}
                        </div>
                        <StatusPill status={p.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "success") {
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
      <CheckCircle2 className="w-3 h-3" /> Paid
    </span>;
  }
  if (status === "failed") {
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
      <XCircle className="w-3 h-3" /> Failed
    </span>;
  }
  return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
    <Clock className="w-3 h-3" /> Pending
  </span>;
}

/** Next monthly refill date: the purchase day each month (clamped to month end). */
function nextMonthlyRefill(startedAt: string): Date {
  const day = new Date(startedAt).getDate();
  const now = new Date();
  const at = (y: number, m: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
  const thisMonth = at(now.getFullYear(), now.getMonth());
  return thisMonth > now ? thisMonth : at(now.getFullYear(), now.getMonth() + 1);
}
