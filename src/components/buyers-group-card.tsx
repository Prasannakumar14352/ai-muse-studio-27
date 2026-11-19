import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Lock, MessageCircle, Send } from "lucide-react";
import { getBuyersGroupAccess } from "@/lib/buyers-group.functions";

/**
 * "Join our private Telegram group" — shown on Billing. Paid-plan users get
 * the link; everyone else sees what they'd unlock. Hidden until the admin has
 * set a link in Agent HQ.
 */
export function BuyersGroupCard({ highlight = false }: { highlight?: boolean }) {
  const fn = useServerFn(getBuyersGroupAccess);
  const { data } = useQuery({ queryKey: ["buyers-group"], queryFn: () => fn(), staleTime: 60_000 });
  if (!data?.configured) return null;

  if (data.eligible && data.url) {
    return (
      <section className={`glass rounded-2xl p-5 flex flex-wrap items-center gap-4 border ${highlight ? "border-[color:var(--brand-orange)]/60 ring-2 ring-[color:var(--brand-orange)]/30" : "border-border"}`}>
        <div className="w-11 h-11 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
          <MessageCircle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <div className="font-semibold">{highlight ? "🎉 You're in! Join our private buyers' group" : "Private buyers' group on Telegram"}</div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Get help fast, see new features first, and swap tips with other creators. Our support assistant answers questions there too.
          </p>
        </div>
        <a href={data.url} target="_blank" rel="noreferrer"
          className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5">
          <Send className="w-4 h-4" /> Join on Telegram
        </a>
      </section>
    );
  }

  return (
    <section className="glass rounded-2xl p-5 flex flex-wrap items-center gap-4 border border-border">
      <div className="w-11 h-11 rounded-xl bg-white/5 text-muted-foreground flex items-center justify-center shrink-0">
        <Lock className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-[220px]">
        <div className="font-semibold">Private buyers' group on Telegram</div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Included with every paid plan: priority help, early access to new features, and a community of creators.
        </p>
      </div>
      <Link to="/pricing" className="rounded-lg glass border border-border px-4 py-2 text-sm">See plans</Link>
    </section>
  );
}
