import { Sparkles, X } from "lucide-react";
import type { ResearchPrefill } from "@/lib/research-prefill";

/**
 * "Created from Viral Research" banner. Renders when a destination module
 * successfully consumed a research handoff on mount.
 */
export function HandoffBanner({
  prefill, onDismiss,
}: {
  prefill: Pick<ResearchPrefill, "sourceLabel" | "topic" | "angle"> | null;
  onDismiss?: () => void;
}) {
  if (!prefill) return null;
  return (
    <div className="glass rounded-xl border border-pink-500/30 bg-gradient-to-r from-orange-500/5 to-pink-500/5 px-4 py-3 flex items-start gap-3 text-sm">
      <Sparkles className="w-4 h-4 text-pink-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-pink-200">Created from Viral Research</div>
        <div className="text-xs text-muted-foreground truncate">
          {prefill.sourceLabel || prefill.topic}
          {prefill.angle ? <> · <span className="italic">{prefill.angle}</span></> : null}
        </div>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="p-1 rounded hover:bg-white/10 text-muted-foreground" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
