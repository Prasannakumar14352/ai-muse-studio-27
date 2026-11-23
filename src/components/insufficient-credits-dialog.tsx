import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Zap, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TopUpPacks } from "@/components/topup-packs";

export type InsufficientCreditsInfo = {
  required: number;
  available: number;
  shortage: number;
  planType: string;   // 'free' | 'pro' | 'admin' | ...
  isPaid: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: InsufficientCreditsInfo | null;
  onRetry?: () => void;
  retrying?: boolean;
};

/**
 * Plan-aware modal shown by `useCreditGuard` when the server rejects a
 * reservation. Preserves in-flight generation intent — the caller keeps its
 * form state; this modal is a portal overlay and offers a Retry button once
 * the user has topped up.
 */
export function InsufficientCreditsDialog({ open, onOpenChange, info, onRetry, retrying }: Props) {
  const [showTopups, setShowTopups] = useState(false);
  if (!info) return null;

  const isPaid = info.isPaid;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setShowTopups(false); onOpenChange(o); }}>
      <DialogContent className="max-w-lg p-7">
        <DialogHeader className="gap-3 text-left">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-amber-500/15">
            <Zap className="h-6 w-6 text-amber-400" />
          </div>
          <DialogTitle className="text-xl">Not enough credits for this</DialogTitle>
          <DialogDescription>
            This needs <b className="text-foreground">{info.required.toLocaleString()}</b> credits and you have{" "}
            <b className="text-foreground">{info.available.toLocaleString()}</b>. Nothing has been charged — your work
            is kept, so you can {isPaid ? "top up" : "upgrade or top up"} and carry on where you left off.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Needed" value={info.required} accent="text-foreground" />
          <Stat label="You have" value={info.available} accent="text-foreground" />
          <Stat label="Short by" value={info.shortage} accent="text-primary" />
        </div>

        {showTopups ? (
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            <TopUpPacks compact />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            {isPaid ? (
              <>
                <Button className="flex-1" onClick={() => setShowTopups(true)}>
                  <Zap /> Top up credits
                </Button>
                <Button asChild variant="secondary" className="flex-1">
                  <Link to="/billing">See my usage</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild className="flex-1">
                  <Link to="/pricing">See plans</Link>
                </Button>
                <Button variant="secondary" className="flex-1" onClick={() => setShowTopups(true)}>
                  <Zap /> Buy a credit pack
                </Button>
              </>
            )}
          </div>
        )}

        {onRetry ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-3.5 py-2.5 text-xs text-muted-foreground">
            <span>Topped up? Try again — nothing is lost.</span>
            <Button size="sm" variant="ghost" className="text-primary hover:text-primary" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Try again
            </Button>
          </div>
        ) : null}

        {!isPaid ? (
          <p className="text-xs text-muted-foreground">
            Plans include monthly credits plus premium features like advanced agents and long-form video.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary p-3 text-center">
      <div className={`text-2xl font-bold [font-family:'Space_Grotesk',Inter,sans-serif] ${accent}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
