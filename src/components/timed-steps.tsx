import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * Step list for a single long AI call that has no real progress events.
 * Steps advance on typical timings, and the last one waits until the call
 * returns. That's better than a bare spinner for a 30–60 s wait.
 */
export function TimedSteps({ steps, active }: { steps: Array<{ label: string; seconds: number }>; active: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = Date.now();
    const t = setInterval(() => setElapsed((Date.now() - start) / 1000), 500);
    return () => clearInterval(t);
  }, [active]);
  if (!active) return null;
  let acc = 0;
  let current = steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    acc += steps[i].seconds;
    if (elapsed < acc) { current = i; break; }
  }
  return (
    <div className="glass rounded-2xl p-4 border border-border space-y-2" role="status" aria-live="polite">
      {steps.map((s, i) => (
        <div key={s.label} className={`flex items-center gap-2 text-sm ${i > current ? "text-muted-foreground/60" : ""}`}>
          {i < current ? <Check className="w-4 h-4 text-emerald-400" />
            : i === current ? <Loader2 className="w-4 h-4 animate-spin text-[color:var(--brand-orange)]" />
            : <span className="w-4 h-4 rounded-full border border-border inline-block" />}
          {s.label}
        </div>
      ))}
      <div className="text-[11px] text-muted-foreground pt-1">{Math.round(elapsed)}s · usually under a minute</div>
    </div>
  );
}

export const CAROUSEL_STEPS = [
  { label: "Reading your topic and planning the slides", seconds: 8 },
  { label: "Writing headlines, bullets and the caption", seconds: 20 },
  { label: "Designing each slide's image brief", seconds: 25 },
  { label: "Saving your carousel", seconds: 60 },
];

export const SCRIPT_STEPS = [
  { label: "Researching the topic", seconds: 6 },
  { label: "Writing the hook and script", seconds: 15 },
  { label: "Planning scenes and image prompts", seconds: 15 },
  { label: "Writing the caption and hashtags", seconds: 60 },
];
