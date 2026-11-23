// "Have a code?" box for checkout + the festival offer banner.
// The browser only sends the code; every price is recomputed on the server.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Check, Copy, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { previewOffer, previewPackOffers } from "@/lib/razorpay.functions";
import { getOfferBanner, syncFlashWindow } from "@/lib/offers.functions";
import { flashEnd, flashStart, type FlashConfig } from "@/lib/flash-window";
import { supabase } from "@/integrations/supabase/client";

const KEY = "cf:offer-code";

/** The code the visitor applied (from the banner, ?code= link, or typed), kept for this browser session. */
export function useSavedOfferCode(): [string, (c: string) => void] {
  const [code, setCode] = useState("");
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("code");
      const v = (fromUrl || sessionStorage.getItem(KEY) || "").toUpperCase();
      if (fromUrl) sessionStorage.setItem(KEY, v);
      setCode(v);
    } catch { /* storage blocked */ }
    const onChange = (e: Event) => setCode((e as CustomEvent<string>).detail ?? "");
    window.addEventListener(KEY, onChange);
    return () => window.removeEventListener(KEY, onChange);
  }, []);
  const save = (c: string) => {
    const v = c.trim().toUpperCase();
    setCode(v);
    try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    // Keep every code box on the page in sync (banner → pricing cards → checkout).
    window.dispatchEvent(new CustomEvent(KEY, { detail: v }));
  };
  return [code, save];
}

export type OfferTarget =
  | { kind: "pack"; packId: string }
  | { kind: "plan"; planId: string; cycle: "monthly" | "yearly" | "lifetime" }
  | { kind: "autopay"; planCode: string; cycle: "monthly" | "yearly" };

export type OfferQuoteView = {
  code: string; title: string; label: string;
  originalPaise: number; discountPaise: number; finalPaise: number; bonusCredits: number;
  razorpayOfferId: string | null; duration: string | null;
};

/** Live preview of the code (or an auto-applied offer) for one purchase. */
export function useOfferPreview(target: OfferTarget | null, code: string, enabled = true) {
  const fn = useServerFn(previewOffer);
  return useQuery({
    queryKey: ["offer-preview", target, code],
    queryFn: () => fn({ data: { code: code || undefined, target: target! } }),
    enabled: enabled && !!target,
    staleTime: 60_000,
    retry: false,
  });
}

/** Offer-adjusted INR prices for all credit packs (for the pack cards). */
export function usePackOfferPrices(code: string, enabled = true) {
  const fn = useServerFn(previewPackOffers);
  return useQuery({
    queryKey: ["pack-offer-prices", code],
    queryFn: () => fn({ data: { code: code || undefined } }),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Price line for one pack card: discounted INR with the list price struck through. */
export function PackPrice({ priceUSD, offer }: {
  priceUSD: number;
  offer?: { originalPaise: number; finalPaise: number; bonusCredits: number; label: string | null } | null;
}) {
  if (!offer || (offer.finalPaise >= offer.originalPaise && !offer.bonusCredits)) {
    return <div className="mt-2 text-2xl font-bold gradient-text">${priceUSD.toFixed(2)}</div>;
  }
  return (
    <div className="mt-2">
      {offer.finalPaise < offer.originalPaise ? (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold gradient-text">{inr(offer.finalPaise)}</span>
          <span className="text-sm text-muted-foreground line-through">{inr(offer.originalPaise)}</span>
        </div>
      ) : (
        <div className="text-2xl font-bold gradient-text">{inr(offer.originalPaise)}</div>
      )}
      <div className="text-[11px] text-emerald-300">{offer.label}{offer.bonusCredits ? ` · +${offer.bonusCredits.toLocaleString()} credits` : ""} · list ${priceUSD.toFixed(2)}</div>
    </div>
  );
}

const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

/** Code input + the applied-offer summary, for a checkout. */
export function OfferCodeBox({ code, setCode, quote, error, loading }: {
  code: string; setCode: (c: string) => void;
  quote: OfferQuoteView | null; error: string | null; loading?: boolean;
}) {
  const [open, setOpen] = useState(!!code);
  const [draft, setDraft] = useState(code);
  useEffect(() => { setDraft(code); if (code) setOpen(true); }, [code]);

  return (
    <div className="mb-3 text-sm">
      {quote && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 mb-2">
          <div className="flex items-center gap-2 font-medium text-emerald-200">
            <Check className="w-4 h-4" /> {quote.title} applied · {quote.label}
            {code && (
              <button type="button" aria-label="Remove code" onClick={() => setCode("")} className="ml-auto p-0.5 rounded hover:bg-white/10"><X className="w-3.5 h-3.5" /></button>
            )}
          </div>
          <div className="text-[12px] text-emerald-100/80 mt-1">
            {quote.discountPaise > 0 && <>You save {inr(quote.discountPaise)}{quote.duration ? ` ${quote.duration}` : ""}. </>}
            {quote.bonusCredits > 0 && <>+{quote.bonusCredits.toLocaleString()} bonus credits. </>}
          </div>
        </div>
      )}
      {!open ? (
        // Shown even when an automatic offer is applied — a typed code may be better.
        !code && (
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" /> {quote ? "Have a different offer code?" : "Have an offer code?"}
          </button>
        )
      ) : (
        (!quote || !code) && (
          <form onSubmit={(e) => { e.preventDefault(); setCode(draft); }} className="flex gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder="Offer code"
              className="flex-1 text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 font-mono uppercase focus:outline-none focus:border-orange-500/60" />
            <button type="submit" disabled={!draft.trim() || loading} className="rounded-lg glass border border-border px-3 py-2 text-sm disabled:opacity-60">
              {loading ? "Checking…" : "Apply"}
            </button>
          </form>
        )
      )}
      {error && code && <div className="text-xs text-rose-300 mt-1.5">{error}</div>}
    </div>
  );
}

/**
 * This visitor's flash window for an offer, in this browser. It starts the first
 * time they see the offer and survives refreshes. Signed-in visitors also get it
 * stored on the server, which is what checkout enforces.
 */
function useFlashWindow(offerId: string | undefined, cfg: FlashConfig | null | undefined): number | null {
  const sync = useServerFn(syncFlashWindow);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const cfgKey = cfg ? `${cfg.minutes}|${cfg.repeatDays}|${cfg.epoch}` : "";
  useEffect(() => {
    if (!offerId || !cfg) { setStartedAt(null); return; }
    const key = `cf:flash:${offerId}`;
    let rec: { startedAt: number; epoch: number } | null = null;
    try { rec = JSON.parse(localStorage.getItem(key) || "null"); } catch { rec = null; }
    const save = (start: number) => {
      setStartedAt(start);
      try { localStorage.setItem(key, JSON.stringify({ startedAt: start, epoch: new Date(cfg.epoch).getTime() })); } catch { /* private mode */ }
    };
    const local = flashStart(cfg, rec, Date.now());
    save(local.startedAt);
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session || cancelled) return;
      try {
        const w = await sync({ data: { offerId, startedAt: local.startedAt } });
        if (w && !cancelled) save(w.startedAt);
      } catch { /* the local countdown is still right */ }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId, cfgKey]);
  return cfg && startedAt ? flashEnd(cfg, startedAt) : null;
}

function formatLeft(ms: number): string {
  if (ms > 864e5) return `${Math.floor(ms / 864e5)}d ${Math.floor((ms % 864e5) / 36e5)}h left`;
  if (ms > 36e5) return `${Math.floor(ms / 36e5)}h ${Math.floor((ms % 36e5) / 6e4)}m left`;
  const m = Math.floor(ms / 6e4);
  const sec = Math.floor((ms % 6e4) / 1e3);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")} left`;
}

/** Thin festival banner shown on the landing and pricing pages while an offer is live. */
export function OfferBanner() {
  const fn = useServerFn(getOfferBanner);
  const q = useQuery({ queryKey: ["offer-banner"], queryFn: () => fn(), staleTime: 5 * 60_000 });
  const [, setCode] = useSavedOfferCode();
  const b = q.data;
  const flashEndsAt = useFlashWindow(b?.offerId, b?.flash);
  const [now, setNow] = useState(() => Date.now());
  const fast = !!b?.flash;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), fast ? 1000 : 60_000);
    return () => clearInterval(t);
  }, [fast]);
  // When the banner scrolls out of view, a small floating timer keeps the offer visible.
  const [bannerEl, setBannerEl] = useState<HTMLDivElement | null>(null);
  const [offscreen, setOffscreen] = useState(false);
  const [pillHidden, setPillHidden] = useState(false);
  useEffect(() => {
    if (!bannerEl) return;
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0 });
    io.observe(bannerEl);
    return () => io.disconnect();
  }, [bannerEl]);
  if (!b) return null;
  if (b.flash && flashEndsAt === null) return null; // window not worked out yet
  const ends = [b.endsAt ? new Date(b.endsAt).getTime() : null, flashEndsAt].filter((x): x is number => x !== null);
  const left = ends.length ? Math.min(...ends) - now : null;
  if (left !== null && left <= 0) return null;
  const countdown = left === null ? null : formatLeft(left);
  return (
    <>
    {offscreen && countdown && !pillHidden && (
      <div role="status" className="fixed left-4 bottom-4 z-[55] max-w-[calc(100vw-6rem)] animate-in fade-in slide-in-from-bottom-2">
        <div className="relative rounded-2xl gradient-primary text-white shadow-2xl pl-3.5 pr-8 py-2.5 text-xs">
          <a href="/pricing" className="block">
            <div className="font-semibold text-sm leading-tight">{b.label} · {b.title}</div>
            <div className="text-white/90 mt-0.5 font-mono">⏳ {countdown}</div>
          </a>
          <button type="button" aria-label="Hide offer timer" onClick={() => setPillHidden(true)}
            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center">
            <X className="w-3 h-3" />
          </button>
          <span className="absolute -bottom-1.5 left-6 w-3 h-3 rotate-45 gradient-primary" aria-hidden />
        </div>
      </div>
    )}
    <div ref={setBannerEl} className="w-full gradient-primary text-white text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span className="font-semibold">{b.text || `${b.title} — ${b.label}`}</span>
        {b.scope && <span className="text-white/85 text-xs">({b.scope})</span>}
        {b.code ? (
          <button type="button" onClick={async () => {
            setCode(b.code!);
            try { await navigator.clipboard.writeText(b.code!); } catch { /* ignore */ }
            toast.success(`${b.code} applied — it will be used at checkout`);
          }} className="inline-flex items-center gap-1 rounded-full bg-white/20 hover:bg-white/30 px-2.5 py-0.5 font-mono font-bold">
            {b.code} <Copy className="w-3 h-3" />
          </button>
        ) : (
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs">applied automatically at checkout</span>
        )}
        {countdown && <span className="text-white/85 text-xs">⏳ {countdown}</span>}
        <a href="/pricing" className="underline text-xs">See plans</a>
      </div>
    </div>
    </>
  );
}
