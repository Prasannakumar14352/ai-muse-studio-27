import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMySubscription } from "@/lib/razorpay.functions";
import { PLANS } from "@/lib/constants";
import { TopUpPacks } from "@/components/topup-packs";
import {
  Wallet, Crown, CheckCircle2, Clock, XCircle, ArrowRight,
  Receipt, RefreshCw, Calendar, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [{ title: "Billing — CreatorFlow AI" }],
  }),
  component: BillingPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="max-w-2xl mx-auto p-6 glass rounded-2xl mt-8">
        <h2 className="text-lg font-semibold text-red-400">Could not load billing</h2>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
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
};

function BillingPage() {
  const fn = useServerFn(getMySubscription);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => fn(),
  });

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
                {sub?.renews_at && (
                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" /> Renews {new Date(sub.renews_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}
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
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">This month's usage</div>
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
                    : pct >= 90
                      ? "You're close to your monthly limit — consider upgrading or topping up."
                      : `${100 - pct}% of your monthly credits still available.`}
                </div>
              </div>
            </div>
          </section>

          {/* Inline top-up packs — buy extra credits without leaving Billing */}
          <TopUpPacks />

          {/* Quick actions */}
          <section className="grid gap-4 md:grid-cols-2">
            <ActionCard
              icon={<Sparkles className="w-5 h-5" />}
              title={planKey === "free" ? "Upgrade to Creator" : "Change subscription"}
              desc={planKey === "free" ? "Unlock 1,000 monthly credits + priority queue." : "Move up or down anytime."}
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
                          {p.currency === "INR" ? "₹" : "$"}{(p.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: p.currency === "INR" ? 0 : 2, maximumFractionDigits: 2 })} {p.currency}
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
