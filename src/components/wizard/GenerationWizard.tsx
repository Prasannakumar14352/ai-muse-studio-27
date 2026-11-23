// Shared 5-step wizard shell used by every generation module.
// Steps: Plan → Review → Generate → Preview → Export/Publish.
import { type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

export type WizardStep = "plan" | "review" | "generate" | "preview" | "export";

export const WIZARD_STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "review", label: "Review & Edit" },
  { id: "generate", label: "Generate" },
  { id: "preview", label: "Preview" },
  { id: "export", label: "Export / Publish" },
];

export function GenerationWizard({
  step,
  onStepChange,
  canAdvance,
  children,
  title,
  subtitle,
  nextLabel,
  onNext,
  onBack,
}: {
  step: WizardStep;
  onStepChange?: (s: WizardStep) => void;
  canAdvance?: boolean;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  nextLabel?: string;
  onNext?: () => void;
  onBack?: () => void;
}) {
  const idx = WIZARD_STEPS.findIndex((s) => s.id === step);
  const goto = (i: number) => {
    if (i < 0 || i >= WIZARD_STEPS.length) return;
    onStepChange?.(WIZARD_STEPS[i].id);
  };

  return (
    <div className="space-y-5">
      {(title || subtitle) && (
        <div>
          {title && <h1 className="text-3xl md:text-4xl font-bold">{title}</h1>}
          {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      )}

      <ol className="glass rounded-2xl p-3 flex flex-wrap items-center gap-2">
        {WIZARD_STEPS.map((s, i) => {
          const active = i === idx;
          const done = i < idx;
          return (
            <li key={s.id} className="flex items-center gap-2">
              <button
                onClick={() => (i <= idx ? goto(i) : undefined)}
                disabled={i > idx}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border transition ${
                  active
                    ? "gradient-primary text-white border-transparent"
                    : done
                      ? "border-emerald-500/40 text-emerald-300"
                      : "border-border text-muted-foreground"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-black/30 inline-flex items-center justify-center text-[10px]">
                  {done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < WIZARD_STEPS.length - 1 && <span className="text-white/20">›</span>}
            </li>
          );
        })}
      </ol>

      <div className="glass rounded-2xl p-5">{children}</div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => (onBack ? onBack() : goto(idx - 1))}
          disabled={idx === 0}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-sm disabled:opacity-40"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={() => (onNext ? onNext() : goto(idx + 1))}
          disabled={idx === WIZARD_STEPS.length - 1 || canAdvance === false}
          className="inline-flex items-center gap-1 px-4 py-2 rounded-lg gradient-primary text-white text-sm disabled:opacity-40"
        >
          {nextLabel ?? "Next"} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
