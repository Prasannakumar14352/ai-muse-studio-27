import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Zap, Loader2, RefreshCw } from "lucide-react";
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
  const title = isPaid ? "Not enough credits" : "You need more credits to generate this";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-zinc-950/95 backdrop-blur-xl border border-white/10 text-white">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500/20 to-orange-500/20 border border-pink-500/30">
              <AlertTriangle className="w-5 h-5 text-pink-300" />
            </div>
            <div>
              <DialogTitle className="text-white">{title}</DialogTitle>
              <DialogDescription className="text-white/60 mt-1">
                {isPaid
                  ? "Top up with a one-time credit pack and retry — your work is preserved."
                  : "Upgrade to unlock monthly credits and premium features. Your current draft is saved."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 my-2">
          <Stat label="Required" value={info.required} accent="text-pink-300" />
          <Stat label="Available" value={info.available} accent="text-white" />
          <Stat label="Short by" value={info.shortage} accent="text-orange-300" />
        </div>

        {showTopups ? (
          <div className="max-h-[50vh] overflow-y-auto pr-1">
            <TopUpPacks compact />
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            {isPaid ? (
              <>
                <Button
                  className="flex-1 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 border-0"
                  onClick={() => setShowTopups(true)}
                >
                  <Zap className="w-4 h-4 mr-2" /> Buy Extra Credits
                </Button>
                <Button asChild variant="outline" className="flex-1 border-white/20 bg-white/5 hover:bg-white/10 text-white">
                  <Link to="/billing">View Usage</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild className="flex-1 bg-gradient-to-r from-pink-500 to-orange-500 hover:from-pink-600 hover:to-orange-600 border-0">
                  <Link to="/pricing">View Plans</Link>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-white/20 bg-white/5 hover:bg-white/10 text-white"
                  onClick={() => setShowTopups(true)}
                >
                  <Zap className="w-4 h-4 mr-2" /> Buy Credit Pack
                </Button>
              </>
            )}
          </div>
        )}

        {onRetry ? (
          <div className="mt-2 flex items-center justify-between text-xs text-white/50">
            <span>After you top up, retry without losing your work.</span>
            <Button size="sm" variant="ghost" className="text-pink-300 hover:text-pink-200 hover:bg-white/5" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Retry generation
            </Button>
          </div>
        ) : null}

        {!isPaid ? (
          <p className="text-xs text-white/50 mt-1">
            Upgrading includes monthly credits plus premium features like advanced agents and long-form video.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
    </div>
  );
}
