import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PLANS, type PlanDef } from "@/lib/constants";
import { useAccess } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles, Crown, X, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pricing")({ component: PricingPage });

function PricingPage() {
  const { data: access } = useAccess();
  const [modalPlan, setModalPlan] = useState<PlanDef | null>(null);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-muted-foreground mb-4">
          <Sparkles className="w-3 h-3 text-[color:var(--neon-pink)]" /> Upgrade any time · Powered by Razorpay
        </div>
        <h1 className="text-3xl md:text-5xl font-bold">Choose your <span className="gradient-text">plan</span></h1>
        <p className="text-muted-foreground mt-2">Cancel any time. Prices in INR.</p>
        {access?.isAdmin && (
          <div className="mt-4 inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-sm">
            <Crown className="w-4 h-4 text-amber-400" /> Admin — Unlimited access, no billing
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {PLANS.map((p) => {
          const isCurrent = access?.plan === p.id;
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

      <div className="text-center text-sm text-muted-foreground">
        Need custom / team pricing? <Link to="/dashboard" className="text-[color:var(--neon-purple)] hover:underline">Contact us</Link>
      </div>

      {modalPlan && <RazorpayModal plan={modalPlan} onClose={() => setModalPlan(null)} />}
    </div>
  );
}

/* Razorpay placeholder — pretends to run checkout and activates the plan locally. */
function RazorpayModal({ plan, onClose }: { plan: PlanDef; onClose: () => void }) {
  const { data: access } = useAccess();
  const qc = useQueryClient();
  const [processing, setProcessing] = useState(false);

  async function simulatePayment() {
    if (!access) return;
    setProcessing(true);
    // Fake Razorpay call
    await new Promise((r) => setTimeout(r, 1400));

    // Activate the plan in our DB (client-side because RLS allows the owner)
    // First deactivate any existing active subscription
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
      <div className="glass rounded-2xl p-8 max-w-md w-full relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-1 rounded hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">R</div>
          <div>
            <div className="font-semibold">Razorpay Checkout</div>
            <div className="text-xs text-muted-foreground">Secure payment (demo)</div>
          </div>
        </div>
        <div className="glass rounded-xl p-4 mb-4">
          <div className="flex justify-between text-sm mb-2"><span>Plan</span><span className="font-medium">{plan.name}</span></div>
          <div className="flex justify-between text-sm mb-2"><span>Monthly credits</span><span className="font-medium">{plan.monthlyCredits.toLocaleString()}</span></div>
          <div className="flex justify-between text-base pt-2 border-t border-border/40">
            <span className="font-semibold">Total</span><span className="font-bold gradient-text">{plan.price}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          This is a demo checkout. Clicking "Pay" will activate the {plan.name} plan on your account without charging you.
          Live Razorpay integration can be wired later using their Orders API + webhook.
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
