import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap, Loader2, Crown, Infinity as InfinityIcon } from "lucide-react";
import { CREDIT_PACKS, type CreditPack } from "@/lib/constants";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/razorpay.functions";
import { useAccess } from "@/lib/access";
import { OfferCodeBox, useOfferPreview, useSavedOfferCode } from "@/components/offer-code";

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

/**
 * Reusable top-up widget. Renders the same one-time credit packs that live on the
 * Pricing page but in a compact card grid — safe to drop into Billing, Settings, etc.
 * Uses the existing Razorpay server functions; credits are only granted after
 * server-side signature verification (idempotent via payments.status guard).
 */
export function TopUpPacks({ compact = false }: { compact?: boolean }) {
  const { data: access } = useAccess();
  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [offerCode, setOfferCode] = useSavedOfferCode();
  const offerQ = useOfferPreview(CREDIT_PACKS[0] ? { kind: "pack", packId: CREDIT_PACKS[0].id } : null, offerCode, !!access?.email);
  const packQuote = offerQ.data?.quote ?? null;
  const offerError = offerQ.data?.error ?? null;

  async function handleBuy(pack: CreditPack) {
    setBuyingId(pack.id);
    try {
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) throw new Error("Could not load Razorpay checkout");
      const order = await createOrder({ data: { packId: pack.id, offerCode: offerCode && !offerError ? offerCode : undefined } });
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          order_id: order.orderId,
          name: "CreatorFlow AI",
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
              toast.success(`Added ${result.credits.toLocaleString()} credits to your wallet`);
              await qc.invalidateQueries({ queryKey: ["access"] });
              await qc.invalidateQueries({ queryKey: ["my-payments"] });
              await qc.invalidateQueries({ queryKey: ["my-subscription"] });
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

  if (access?.isAdmin) {
    return (
      <section className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[color:var(--brand-orange)]/20 text-[color:var(--brand-orange)] flex items-center justify-center">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-2">
              Unlimited access <InfinityIcon className="w-4 h-4 text-[color:var(--brand-orange)]" />
            </div>
            <div className="text-xs text-muted-foreground">Admins don't need top-ups.</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="glass rounded-2xl p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-lg md:text-xl font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-[color:var(--brand-orange)]" /> Buy extra credits
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            One-time top-ups. Added instantly after payment · Never expire · Used only after your monthly plan credits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Wallet balance</div>
            <div className="text-lg font-bold gradient-text">
              {(access?.balance ?? 0).toLocaleString()}<span className="text-xs text-muted-foreground font-normal ml-1">credits</span>
            </div>
          </div>
          <Link to="/invoices" className="text-xs glass rounded-lg px-3 py-2 hover:bg-white/10">
            Invoices →
          </Link>
        </div>
      </div>

      <div className="max-w-sm">
        <OfferCodeBox code={offerCode} setCode={setOfferCode} quote={packQuote ? { ...packQuote, discountPaise: 0, bonusCredits: 0 } : null} error={offerError} loading={offerQ.isFetching} />
      </div>

      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {CREDIT_PACKS.map((pack) => {
          const busy = buyingId === pack.id;
          const per100 = ((pack.priceUSD / pack.credits) * 100).toFixed(2);
          return (
            <div
              key={pack.id}
              className="rounded-xl border border-border/50 bg-black/20 p-4 flex flex-col hover:border-[color:var(--brand-orange)]/40 transition">
              <div className="flex items-start justify-between">
                <div className="text-xs text-muted-foreground">{pack.label}</div>
                {pack.bonus && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--brand-orange)]/20 text-[color:var(--brand-orange)] font-semibold">
                    {pack.bonus}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xl font-bold">
                {pack.credits.toLocaleString()}
                <span className="text-xs text-muted-foreground font-normal ml-1">credits</span>
              </div>
              <div className="mt-2 text-2xl font-bold gradient-text">${pack.priceUSD.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground">≈ ${per100} / 100</div>
              <button
                onClick={() => handleBuy(pack)}
                disabled={busy || !!buyingId}
                className="mt-3 w-full rounded-lg gradient-primary text-white py-2 text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {busy ? "Opening…" : "Buy pack"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        Payments processed securely by Razorpay. Credits are granted server-side only after payment signature verification — refreshing, retrying, or duplicate webhooks won't grant credits twice.
      </p>
    </section>
  );
}
