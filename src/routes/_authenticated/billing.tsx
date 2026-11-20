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
  Wallet, Crown, CheckCircle2, Clock, XCircle, ArrowRight,
  Receipt, RefreshCw, Calendar, Sparkles,
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

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6 text-[color:var(--brand-orange)]" /> Billing & Subscription
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your plan, credit usage, and payment history in one place.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs glass rounded-lg px-3 py-2 hover:bg-white/10 inline-flex items-center gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">Loading your billing details…</div>
      ) : (
        <>
          {sub?.payment_issue && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">
                  {sub.payment_issue === "halted" ? "Your plan was paused — renewal payment failed" : "Your last renewal payment failed"}
                </div>
                <div className="text-xs opacity-80 mt-0.5">
                  {sub.payment_issue === "halted"
                    ? "Razorpay couldn't charge your UPI / card after several tries, so you're on Free now. Subscribe again to restore your plan."
                    : "Razorpay will retry automatically over the next few days. Make sure your UPI AutoPay mandate or card is active and has enough balance."}
                </div>
              </div>
              {sub.payment_issue === "halted" && (
                <Link to="/pricing" className="rounded-lg gradient-primary text-white px-3 py-1.5 text-xs font-medium">Subscribe again</Link>
              )}
            </div>
          )}

          <BuyersGroupCard highlight={Boolean(welcome)} />

          {/* Current Plan */}
          <section className="glass rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full gradient-primary opacity-10 blur-3xl pointer-events-none" />
            <div className="relative flex flex-wrap items-start justify-between gap-6">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Current plan</div>
                <div className="mt-1 flex items-center gap-2">
                  <h2 className="text-2xl font-bold capitalize">{isAdmin ? "Admin" : planDef.name}</h2>
                  {unlimited ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[color:var(--brand-orange)]/20 text-[color:var(--brand-orange)]">
                      <Crown className="w-3 h-3" /> Unlimited
                    </span>
                  ) : sub?.lifetime_access ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300">
                      <Crown className="w-3 h-3" /> Lifetime
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {isAdmin ? "Full access to all features." : `${planDef.price} ${planDef.period ?? ""}`.trim()}
                </div>
                {sub?.auto_renew && sub.renews_at ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> Auto-renews {fmtDate(sub.renews_at)} · charged automatically via Razorpay
                    </span>
                    <button onClick={handleCancelAutopay} disabled={cancelling}
                      className="underline hover:text-foreground disabled:opacity-50">
                      {cancelling ? "Cancelling…" : "Cancel auto-renew"}
                    </button>
                  </div>
                ) : sub?.expires_at ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-300">
                    <Calendar className="w-3.5 h-3.5" /> Auto-renew off · plan ends {fmtDate(sub.expires_at)}
                  </div>
                ) : sub?.renews_at ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" /> Paid until {fmtDate(sub.renews_at)} · renew from Pricing
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  to="/pricing"
                  className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5">
                  {planKey === "free" ? "Upgrade plan" : "Change plan"} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                {lastPending && (
                  <Link
                    to="/pricing"
                    className="rounded-lg glass px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-white/10">
                    <RefreshCw className="w-3.5 h-3.5" /> Retry pending payment
                  </Link>
                )}
              </div>
            </div>

            {/* Usage */}
            <div className="relative mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-black/30 border border-border/50 p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Credit balance</div>
                <div className="mt-1 text-2xl font-bold flex items-center gap-1">
                  {unlimited ? <><Crown className="w-5 h-5 text-[color:var(--brand-orange)]" /> Unlimited</> : balance.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Available to spend now.</div>
              </div>

              <div className="rounded-xl bg-black/30 border border-border/50 p-4 md:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {sub?.lifetime_access ? "Monthly bonus credits" : "This month's usage"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {unlimited ? "No cap" : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
                  </div>
                </div>
                <div className="mt-3 h-2.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-all"
                    style={{ width: unlimited ? "100%" : `${pct}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {unlimited
                    ? "Your plan includes unlimited monthly usage."
                    : sub?.lifetime_access
                      ? limit > 0
                        ? `${(limit - Math.min(used, limit)).toLocaleString()} bonus credits left · refills ${nextMonthlyRefill(sub.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Bonus credits are used first and don't carry over.`
                        : "Your lifetime credits never expire."
                    : pct >= 90
                      ? "You're close to your monthly limit — consider upgrading or topping up."
                      : `${100 - pct}% of your monthly credits still available.`}
                </div>
              </div>
            </div>
          </section>

          {/* Inline top-up packs — buy extra credits without leaving Billing */}
          <div id="topup" className="scroll-mt-20">
            <TopUpPacks />
          </div>

          {/* Credit history (the support bot points users here) */}
          <div id="credit-history" className="scroll-mt-20">
            <CreditHistory />
          </div>

          {/* Quick actions */}
          <section className="grid gap-4 md:grid-cols-2">
            <ActionCard
              icon={<Sparkles className="w-5 h-5" />}
              title={planKey === "free" ? "Upgrade to Creator" : "Change subscription"}
              desc={planKey === "free" ? `Unlock ${creatorCredits ? `${creatorCredits.toLocaleString()} monthly credits` : "monthly credits"} + priority queue.` : "Move up or down anytime."}
              to="/pricing"
              cta={planKey === "free" ? "Upgrade" : "Manage plan"}
            />
            <ActionCard
              icon={<Receipt className="w-5 h-5" />}
              title="Invoices & receipts"
              desc="Download PDF receipts for every payment."
              to="/invoices"
              cta="View invoices"
            />
          </section>

          {/* Recent payments */}
          <section className="glass rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="font-semibold">Recent payments</h3>
              <Link to="/invoices" className="text-xs text-[color:var(--brand-orange)] hover:underline">See all →</Link>
            </div>
            {payments.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No payments yet. <Link to="/pricing" className="text-[color:var(--brand-orange)] hover:underline">Buy your first plan</Link>.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-6 py-3">Date</th>
                      <th className="text-left px-4 py-3">Item</th>
                      <th className="text-right px-4 py-3">Credits</th>
                      <th className="text-right px-4 py-3">Amount</th>
                      <th className="text-center px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-border/40 hover:bg-white/5">
                        <td className="px-6 py-3 whitespace-nowrap">
                          {new Date(p.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">{p.pack_id.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3 text-right">{p.credits.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {p.currency === "INR" && p.amount_inr_paise != null
                            ? `₹${Math.round(p.amount_inr_paise / 100).toLocaleString("en-IN")}`
                            : `$${(p.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p.currency}`}
                          {p.price_usd_cents != null && (
                            <div className="text-[10px] text-muted-foreground font-normal">
                              Listed ${(p.price_usd_cents / 100).toFixed(2)}
                              {p.conversion_rate ? ` @ ₹${Number(p.conversion_rate).toFixed(2)}` : ""}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3 text-center"><StatusPill status={p.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ActionCard({ icon, title, desc, to, cta }: { icon: React.ReactNode; title: string; desc: string; to: "/pricing" | "/invoices"; cta: string }) {
  return (
    <div className="glass rounded-2xl p-5 flex flex-col">
      <div className="w-10 h-10 rounded-lg gradient-primary flex items-center justify-center text-white mb-3">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 flex-1">{desc}</div>
      <Link to={to} className="mt-4 text-sm text-[color:var(--brand-orange)] hover:underline inline-flex items-center gap-1">
        {cta} <ArrowRight className="w-3.5 h-3.5" />
      </Link>
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
