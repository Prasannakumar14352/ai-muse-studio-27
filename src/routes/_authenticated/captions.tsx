import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Copy, Loader2, Wand2 } from "lucide-react";
import { ProjectsSection } from "@/components/projects-section";
import { PLATFORMS } from "@/lib/constants";
import { GenerationWizard, type WizardStep } from "@/components/wizard/GenerationWizard";
import { PlanEditor } from "@/components/wizard/PlanEditor";
import { AssetActions } from "@/components/wizard/AssetActions";
import { planContentFn, type ContentPlan } from "@/lib/content-plan.functions";
import { clearDraft, loadDraft, saveDraft } from "@/lib/plan-store";
import { ActiveStrategyBanner } from "@/components/active-strategy-banner";
import { getActiveStrategyContext } from "@/lib/active-strategy";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";
import { useAutogen } from "@/lib/use-autogen";

export const Route = createFileRoute("/_authenticated/captions")({ component: CaptionsPage });

function CaptionsPage() {
  const initial = loadDraft("caption");
  const [handoff, setHandoff] = useState<ResearchPrefill | null>(() => consumeResearchPrefill("caption"));
  const [step, setStep] = useState<WizardStep>(initial?.aiPlan ? "review" : "plan");
  const [topic, setTopic] = useState(handoff?.topic ?? initial?.originalPrompt ?? "");
  const [platform, setPlatform] = useState(handoff?.platform ?? "instagram");
  const [plan, setPlan] = useState<ContentPlan | null>(initial?.editedPlan ?? initial?.aiPlan ?? null);

  const plan$ = useServerFn(planContentFn);
  const planM = useMutation({
    mutationFn: () => plan$({ data: { module: "caption", topic, context: `Platform: ${platform}`, strategyContext: getActiveStrategyContext() } }),
    onSuccess: (p) => {
      setPlan(p);
      saveDraft({ module: "caption", originalPrompt: topic, aiPlan: p, editedPlan: p, result: null, exports: [], updatedAt: Date.now() });
      setStep("review");
      toast.success("Plan ready — edit and continue");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const result = useMemo(() => {
    if (!plan) return null;
    const get = (k: string) => plan.sections.find((s) => s.key === k)?.value;
    return {
      captions: (get("captions") as string[]) ?? [],
      hooks: (get("hooks") as string[]) ?? [],
      ctas: (get("ctas") as string[]) ?? [],
      hashtags: (get("hashtags") as string[]) ?? [],
    };
  }, [plan]);

  async function copy(text: string) { await navigator.clipboard.writeText(text); toast.success("Copied"); }

  return (
    <div className="space-y-6 max-w-4xl">
      <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />
      <ActiveStrategyBanner />
      <GenerationWizard
        step={step}
        onStepChange={setStep}
        title="Caption & Hashtag Wizard"
        subtitle="Plan → Review → Generate → Preview → Export."
        canAdvance={step === "plan" ? !!topic.trim() && !!plan : true}
      >
        {step === "plan" && (
          <div className="space-y-4">
            <label className="block">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Idea / Topic</div>
              <input value={topic} onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Morning routines that actually work"
                className="input-base w-full" />
            </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button key={p.id} onClick={() => setPlatform(p.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${platform === p.id ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{p.label}</button>
              ))}
            </div>
            <button
              onClick={() => topic.trim() ? planM.mutate() : toast.error("Enter a topic")}
              disabled={planM.isPending}
              className="rounded-lg gradient-primary text-white px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-60"
            >
              {planM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {plan ? "Regenerate plan" : "Generate AI plan"}
            </button>
          </div>
        )}

        {step === "review" && plan && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Edit any section, regenerate individual sections, then continue to generate finals.</p>
            <PlanEditor plan={plan} onChange={(next) => {
              setPlan(next);
              saveDraft({ module: "caption", originalPrompt: topic, aiPlan: plan, editedPlan: next, result: null, exports: [], updatedAt: Date.now() });
            }} />
          </div>
        )}

        {step === "generate" && plan && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">The edited plan already contains your caption variants, hooks, CTAs and hashtags. Continue to preview or regenerate any section from the Review step.</p>
            <button onClick={() => setStep("preview")}
              className="rounded-lg gradient-primary text-white px-5 py-2 text-sm inline-flex items-center gap-2">
              <Wand2 className="w-4 h-4" /> Preview final output
            </button>
          </div>
        )}

        {step === "preview" && result && (
          <div className="space-y-4">
            <Section title="Caption variants">
              {result.captions.map((c, i) => (
                <div key={i} className="border border-white/10 rounded-lg p-3 flex items-start justify-between gap-3">
                  <p className="text-sm whitespace-pre-wrap flex-1">{c}</p>
                  <button onClick={() => copy(c)} className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" />Copy</button>
                </div>
              ))}
            </Section>
            <div className="grid md:grid-cols-2 gap-3">
              <Section title="Hooks">
                <ul className="space-y-1 text-sm">{result.hooks.map((h, i) => <li key={i}>→ {h}</li>)}</ul>
              </Section>
              <Section title="CTAs">
                <ul className="space-y-1 text-sm">{result.ctas.map((c, i) => <li key={i}>★ {c}</li>)}</ul>
              </Section>
            </div>
            <Section title="Hashtags">
              <div className="flex flex-wrap gap-1.5">{result.hashtags.map((h) => <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>)}</div>
            </Section>
          </div>
        )}

        {step === "export" && result && (
          <div className="space-y-4">
            <AssetActions
              onAction={(a) => {
                if (a === "duplicate") { setPlan(null); setStep("plan"); toast.success("Duplicated — start a new draft"); }
                else if (a === "edit") setStep("review");
                else if (a === "regenerate") planM.mutate();
                else if (a === "save") { toast.success("Saved locally"); }
                else if (a === "export") {
                  const text = [
                    ...result.captions.map((c, i) => `# Caption ${i + 1}\n${c}`),
                    "\n# Hooks\n" + result.hooks.join("\n"),
                    "\n# CTAs\n" + result.ctas.join("\n"),
                    "\n# Hashtags\n" + result.hashtags.join(" "),
                  ].join("\n\n");
                  const blob = new Blob([text], { type: "text/markdown" });
                  const url = URL.createObjectURL(blob);
                  const a2 = document.createElement("a");
                  a2.href = url; a2.download = `captions-${Date.now()}.md`; a2.click();
                  URL.revokeObjectURL(url);
                } else if (a === "publish") toast.info("Connect a channel in Publishing settings");
                else if (a === "history") toast.info("History is stored per project on the server");
              }}
            />
            <button onClick={() => { clearDraft("caption"); setPlan(null); setStep("plan"); toast.success("New draft"); }}
              className="text-xs text-muted-foreground underline">Start a new caption</button>
          </div>
        )}
      </GenerationWizard>

      <ProjectsSection
        contentTypes={["caption_only", "seo_pack"]}
        title="Your caption & SEO projects"
        cacheKey="captions"
        showTypeFilter
        showStatusFilter
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-4">
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</h2>
      {children}
    </div>
  );
}
