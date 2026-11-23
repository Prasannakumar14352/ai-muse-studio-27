import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LanguagePicker } from "@/components/language-picker";
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
  // Drafts from Research store "topic\n\nAngle: …"; a one-line input would run them together.
  const [topic, setTopic] = useState(firstLine(handoff?.topic ?? initial?.originalPrompt ?? ""));
  // Topic the current plan was generated for — a changed topic needs a new plan.
  const [planTopic, setPlanTopic] = useState(firstLine(initial?.originalPrompt ?? ""));
  const [platform, setPlatform] = useState(handoff?.platform ?? "instagram");
  const [plan, setPlan] = useState<ContentPlan | null>(initial?.editedPlan ?? initial?.aiPlan ?? null);
  const [language, setLanguage] = useState<string>("auto");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const plan$ = useServerFn(planContentFn);
  const planM = useMutation({
    mutationFn: () => plan$({ data: { module: "caption", topic, context: `Platform: ${platform}`, strategyContext: getActiveStrategyContext(), language } }),
    onSuccess: (p) => {
      setPlan(p);
      setPlanTopic(topic.trim());
      setSavedId(null);
      saveDraft({ module: "caption", originalPrompt: topic, aiPlan: p, editedPlan: p, result: null, exports: [], updatedAt: Date.now() });
      setStep("review");
      toast.success("Plan ready — edit and continue");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useAutogen(handoff, () => {
    if ((handoff?.topic ?? topic).trim()) {
      toast.message("Generation started", { description: "Auto-generating from Viral Research…" });
      planM.mutate();
    }
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

  const topicChanged = !!plan && firstLine(topic) !== firstLine(planTopic);

  async function copy(text: string) { await navigator.clipboard.writeText(text); toast.success("Copied"); }

  /** Save the finished caption set to the account (shows in "Your caption projects"). */
  async function saveCaptions(): Promise<boolean> {
    if (!plan || !result) return false;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again");
      const payload = {
        user_id: u.user.id,
        title: firstLine(topic).slice(0, 120) || "Captions",
        topic,
        platform,
        content_type: "caption_only",
        status: "completed",
        language: language === "auto" ? null : language,
        metadata: { captions: result, plan } as never,
      };
      const q = savedId
        ? supabase.from("projects").update(payload).eq("id", savedId).select("id").single()
        : supabase.from("projects").insert(payload).select("id").single();
      const { data, error } = await q;
      if (error) throw error;
      setSavedId(data.id as string);
      qc.invalidateQueries({ queryKey: ["projects-section"] });
      toast.success("Captions saved to your account");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
      return false;
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />
      <ActiveStrategyBanner />
      <GenerationWizard
        step={step}
        onStepChange={setStep}
        title="Caption & Hashtag Wizard"
        subtitle="Plan → Review → Generate → Preview → Export."
        canAdvance={step === "plan" ? !!topic.trim() && !!plan && !topicChanged : step === "generate" ? !!savedId : true}
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
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Language</div>
              <LanguagePicker allowAuto value={language} onChange={setLanguage} />
            </div>
            <button
              onClick={() => topic.trim() ? planM.mutate() : toast.error("Enter a topic")}
              disabled={planM.isPending}
              className="rounded-lg gradient-primary text-white px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-60"
            >
              {planM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {plan ? "Regenerate plan" : "Generate AI plan"}
            </button>
            {topicChanged && (
              <p className="text-xs text-amber-400">The topic changed since this plan was made — regenerate the plan to continue.</p>
            )}
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

        {step === "generate" && plan && result && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your final set: {result.captions.length} captions, {result.hooks.length} hooks, {result.ctas.length} CTAs and {result.hashtags.length} hashtags.
              Generate saves them to your account so they're in "Your caption projects" on any device.
            </p>
            <button disabled={saving} onClick={async () => { if (await saveCaptions()) setStep("preview"); }}
              className="rounded-lg gradient-primary text-white px-5 py-2 text-sm inline-flex items-center gap-2 disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Generate & save captions
            </button>
          </div>
        )}

        {step === "preview" && result && (
          <div className="space-y-4">
            <Section title="Caption variants">
              {result.captions.map((c, i) => (
                <div key={i} className="border border-border rounded-lg p-3 flex items-start justify-between gap-3">
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
                else if (a === "save") { void saveCaptions(); }
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
            <button onClick={() => { clearDraft("caption"); setPlan(null); setPlanTopic(""); setSavedId(null); setStep("plan"); toast.success("New draft"); }}
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
    <div className="rounded-xl border border-border bg-card/40 p-4">
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{title}</h2>
      {children}
    </div>
  );
}

function firstLine(s: string): string {
  return (s.split(/\r?\n/).find((l) => l.trim()) ?? "").replace(/\s+/g, " ").trim();
}
