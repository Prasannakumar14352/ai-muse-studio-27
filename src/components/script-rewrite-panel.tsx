// Script → Video: optional "Rewrite with AI". Shows the creator's script and
// the AI suggestion side by side; nothing changes until they choose.
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, RotateCcw, Wand2 } from "lucide-react";
import { rewriteScriptFn } from "@/lib/video-ai.functions";
import { REWRITE_GOALS, estimateScriptSeconds, type RewriteGoal } from "@/lib/script-to-video";

export function ScriptRewritePanel({ script, language, onUse }: {
  script: string;
  language: string;
  onUse: (rewritten: string) => void;
}) {
  const rewrite = useServerFn(rewriteScriptFn);
  const [goal, setGoal] = useState<RewriteGoal>("hook");
  const [targetSec, setTargetSec] = useState(60);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  async function run() {
    if (!script.trim() || busy) return;
    setBusy(true);
    try {
      const out = await rewrite({ data: { script, goal, language, ...(goal === "fit" ? { targetSec } : {}) } });
      setSuggestion(out.script);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Rewrite failed";
      toast.error(/insufficient_credits/i.test(msg) ? "Not enough credits for a rewrite (1 credit)." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-3 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold flex items-center gap-1.5"><Wand2 className="w-4 h-4 text-orange-300" /> Rewrite with AI <span className="text-xs font-normal text-muted-foreground">(optional · 1 credit)</span></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {REWRITE_GOALS.map((g) => (
          <button key={g.id} type="button" title={g.hint} onClick={() => setGoal(g.id)}
            className={`px-3 py-1.5 rounded-full text-xs border ${goal === g.id ? "gradient-primary text-white border-transparent" : "glass border-border hover:border-primary/40"}`}>
            {g.label}
          </button>
        ))}
        {goal === "fit" && [30, 60, 90].map((s) => (
          <button key={s} type="button" onClick={() => setTargetSec(s)}
            className={`px-3 py-1.5 rounded-full text-xs border ${targetSec === s ? "bg-white text-black border-transparent" : "glass border-border"}`}>{s}s</button>
        ))}
        <button type="button" onClick={run} disabled={busy || !script.trim()}
          className="rounded-lg glass border border-border px-3 py-1.5 text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} {suggestion ? "Try again" : "Rewrite"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Keeps your language mix and names (e.g. channel names) as they are. Your script only changes if you click “Use rewrite”.</p>

      {suggestion && (
        <div className="space-y-2">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Your script · ~{estimateScriptSeconds(script, language)}s</div>
              <div className="rounded-lg border border-border bg-black/30 p-3 text-sm whitespace-pre-wrap max-h-72 overflow-y-auto">{script}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-orange-300 mb-1">AI rewrite · ~{estimateScriptSeconds(suggestion, language)}s</div>
              <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={10}
                className="w-full rounded-lg border border-orange-400/30 bg-black/30 p-3 text-sm max-h-72" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={() => setSuggestion(null)}
              className="rounded-lg glass border border-border px-3 py-1.5 text-sm inline-flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> Keep mine
            </button>
            <button type="button" onClick={() => { onUse(suggestion); setSuggestion(null); toast.success("Rewrite applied — you can still edit it"); }}
              className="rounded-lg gradient-primary text-white px-3 py-1.5 text-sm inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> Use rewrite
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
