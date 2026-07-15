import { Sparkles, X, ArrowDown } from "lucide-react";
import type { ResearchPrefill } from "@/lib/research-prefill";

/**
 * "Created from Viral Research" banner. Renders when a destination module
 * successfully consumed a research handoff on mount.
 *
 * When `prefill.autogen === true` the user clicked "Generate X Now" in the
 * Research module. The banner then reminds them to hit the Generate CTA;
 * the destination module is responsible for the actual credit check + call.
 */
export function HandoffBanner({
  prefill, onDismiss,
}: {
  prefill: Pick<ResearchPrefill, "sourceLabel" | "topic" | "angle" | "autogen"> | null;
  onDismiss?: () => void;
}) {
  if (!prefill) return null;
  const autogen = !!prefill.autogen;
  return (
    <div className={`glass rounded-xl border px-4 py-3 flex items-start gap-3 text-sm ${autogen ? "border-pink-500/50 bg-gradient-to-r from-orange-500/10 to-pink-500/10" : "border-pink-500/30 bg-gradient-to-r from-orange-500/5 to-pink-500/5"}`}>
      <Sparkles className="w-4 h-4 text-pink-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-pink-200 flex items-center gap-2">
          {autogen ? "Ready to generate — from Viral Research" : "Created from Viral Research"}
          {autogen && <ArrowDown className="w-3.5 h-3.5 animate-bounce" />}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {prefill.sourceLabel || prefill.topic}
          {prefill.angle ? <> · <span className="italic">{prefill.angle}</span></> : null}
          {autogen && <> · <span className="text-pink-200/90">Review the plan and hit Generate Now. Credits are checked before any AI call.</span></>}
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
