import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  runResearchFn, listResearchFn, deleteResearchFn,
  recommendationLabel,
  type ResearchFindings, type ResearchInputs,
} from "@/lib/research.functions";
import { ViralResearchView } from "@/components/viral-research-view";
import { ResearchReportView } from "@/components/research-report-view";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import { setResearchPrefill, type ResearchModuleId, type ResearchPrefill } from "@/lib/research-prefill";
import { saveDraft } from "@/lib/plan-store";
import { PreviewHandoffDialog } from "@/components/preview-handoff-dialog";
import { Search, Loader2, Trash2, Copy, RefreshCw, Sparkles, Image as ImageIcon, Video, Layers, Linkedin, Type, CalendarPlus, Target, Eye } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/research")({ component: ResearchPage });

const PLATFORMS = [
  { value: "youtube", label: "YouTube" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X (Twitter)" },
] as const;

const CHANNEL_SIZE = [
  { value: "new", label: "New (0-1K)" },
  { value: "small", label: "Small (1K-10K)" },
  { value: "growing", label: "Growing (10K-100K)" },
  { value: "established", label: "Established (100K+)" },
] as const;

const FORMATS = [
  { value: "long_video", label: "Long video" },
  { value: "short_video", label: "Short video" },
  { value: "reel", label: "Reel" },
  { value: "carousel", label: "Carousel" },
  { value: "image", label: "Image post" },
  { value: "linkedin_post", label: "LinkedIn post" },
] as const;

const COUNTRIES = ["Global", "United States", "United Kingdom", "India", "Canada", "Australia", "Germany", "France", "Brazil", "Japan"];

function ResearchPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useServerFn(listResearchFn);
  const run = useServerFn(runResearchFn);
  const del = useServerFn(deleteResearchFn);

  const { data: reports } = useQuery({ queryKey: ["research"], queryFn: () => list() });

  const [inputs, setInputs] = useState<ResearchInputs>({
    topic: "", platform: "youtube", country: "Global", audience: "", niche: "",
    channelSize: "small", contentFormat: "long_video", competitorUrl: "",
  });
  const [selected, setSelected] = useState<ResearchFindings | null>(null);

  const set = <K extends keyof ResearchInputs>(k: K, v: ResearchInputs[K]) => setInputs((p) => ({ ...p, [k]: v }));

  const m = useMutation({
    mutationFn: () => run({ data: { ...inputs } }),
    onSuccess: (r) => {
      setSelected(r.findings);
      qc.invalidateQueries({ queryKey: ["research"] });
      toast.success("Research complete");
    },
    onError: (e: Error) => toast.error(e.message || "Research failed"),
  });

  const duplicate = (r: { topic: string; platform: string | null; findings: ResearchFindings }) => {
    setInputs({ ...inputs, ...(r.findings.inputs ?? {}), topic: r.topic, platform: r.platform ?? inputs.platform });
    setSelected(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const rerun = (r: { topic: string; platform: string | null; findings: ResearchFindings }) => {
    setInputs({ ...inputs, ...(r.findings.inputs ?? {}), topic: r.topic, platform: r.platform ?? inputs.platform });
    setTimeout(() => m.mutate(), 30);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isLegacy = useMemo(() => !!selected && !selected.viralAnalysis, [selected]);
  const hasSelected = !!selected;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Search className="w-7 h-7 text-primary" /> Viral Research Engine
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Should you make this? Get a scored recommendation, angle, titles, hooks and one-click prefill into any creation module.
        </p>
      </header>

      {/* Inputs */}
      <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Topic or keyword</Label>
            <input className="input-base w-full" placeholder='e.g. "The Last Human Employee: The Day Work Disappeared Forever"'
              value={inputs.topic} onChange={(e) => set("topic", e.target.value)} />
          </div>
          <div>
            <Label>Platform</Label>
            <CreatorFlowSelect value={inputs.platform ?? "youtube"} onValueChange={(v) => set("platform", v)}
              options={PLATFORMS as unknown as { value: string; label: string }[]} />
          </div>
          <div>
            <Label>Target country / market</Label>
            <CreatorFlowSelect value={inputs.country ?? "Global"} onValueChange={(v) => set("country", v)} options={COUNTRIES} />
          </div>
          <div>
            <Label>Target audience</Label>
            <input className="input-base w-full" placeholder="e.g. mid-career knowledge workers, 28-45"
              value={inputs.audience ?? ""} onChange={(e) => set("audience", e.target.value)} />
          </div>
          <div>
            <Label>Niche</Label>
            <input className="input-base w-full" placeholder="e.g. AI + future of work"
              value={inputs.niche ?? ""} onChange={(e) => set("niche", e.target.value)} />
          </div>
          <div>
            <Label>Channel / account size</Label>
            <CreatorFlowSelect value={inputs.channelSize ?? "small"} onValueChange={(v) => set("channelSize", v as ResearchInputs["channelSize"])}
              options={CHANNEL_SIZE as unknown as { value: string; label: string }[]} />
          </div>
          <div>
            <Label>Content format</Label>
            <CreatorFlowSelect value={inputs.contentFormat ?? "long_video"} onValueChange={(v) => set("contentFormat", v)}
              options={FORMATS as unknown as { value: string; label: string }[]} />
          </div>
          <div className="md:col-span-2">
            <Label>Competitor / channel URL <span className="text-muted-foreground">(optional)</span></Label>
            <input className="input-base w-full" placeholder="https://www.youtube.com/@channel or a specific video URL"
              value={inputs.competitorUrl ?? ""} onChange={(e) => set("competitorUrl", e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-amber-300/80">
            Analysis is an AI strategic estimate. Live public data sources are not connected.
          </div>
          <button disabled={!inputs.topic || m.isPending} onClick={() => m.mutate()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 text-white font-semibold disabled:opacity-50 shadow-lg shadow-pink-500/20">
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Should I create this?
          </button>
        </div>
      </div>

      {/* Failure state */}
      {m.isError && (
        <div className="glass rounded-2xl border border-red-500/30 p-5 text-sm">
          <div className="font-semibold text-red-300">Research failed</div>
          <div className="text-muted-foreground mt-1">{(m.error as Error)?.message ?? "Unknown error"}</div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => m.mutate()} className="px-3 py-1.5 rounded-lg border border-white/10 text-sm inline-flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {hasSelected && !isLegacy && selected && (
        <>
          <ViralResearchView findings={selected} />
          <OneClickActions findings={selected} navigate={navigate} />
        </>
      )}

      {hasSelected && isLegacy && selected && (
        <>
          <div className="glass rounded-xl border border-amber-500/30 p-3 text-xs text-amber-200">
            This is a legacy report. Re-run to unlock the new viral analysis, scoring, and one-click actions.
          </div>
          <ResearchReportView findings={selected} />
        </>
      )}

      {/* History */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">History</h2>
        {(reports ?? []).map((r) => {
          const va = r.findings.viralAnalysis;
          return (
            <div key={r.id} className="glass rounded-2xl p-4 border border-white/10 flex items-center gap-3">
              <button onClick={() => setSelected(r.findings)} className="text-left flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{r.topic}</div>
                  {va && <ScorePill score={va.score} label={recommendationLabel(va.recommendation)} />}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[r.platform, r.findings.inputs?.country, r.findings.inputs?.audience].filter(Boolean).join(" · ") || "—"}
                  {" · "}
                  <span className="text-amber-300">{r.findings.evidenceMode === "live" ? "Live data" : "AI estimate"}</span>
                  {" · "}
                  {new Date(r.created_at).toLocaleDateString()}
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <IconBtn title="Re-run" onClick={() => rerun(r)}><RefreshCw className="w-4 h-4" /></IconBtn>
                <IconBtn title="Duplicate" onClick={() => duplicate(r)}><Copy className="w-4 h-4" /></IconBtn>
                <IconBtn title="Delete" tone="danger" onClick={async () => { await del({ data: { id: r.id } }); qc.invalidateQueries({ queryKey: ["research"] }); toast.success("Deleted"); }}>
                  <Trash2 className="w-4 h-4" />
                </IconBtn>
              </div>
            </div>
          );
        })}
        {!reports?.length && <div className="text-sm text-muted-foreground text-center py-8">No research reports yet.</div>}
      </section>
    </div>
  );
}

// ---------- One-click actions ----------

type ActionDef = {
  id: string;
  module: ResearchModuleId;
  label: string;
  route: string;
  icon: React.ReactNode;
  build: (f: ResearchFindings, researchId?: string | null) => Omit<ResearchPrefill, "at" | "handoffId" | "source">;
};

function buildActions(findings: ResearchFindings, researchId: string | null): ActionDef[] {
  const a = findings.actionable;
  const topic = findings.inputs?.topic ?? "";
  const platform = findings.inputs?.platform;
  const audience = findings.inputs?.audience;
  const angle = a?.bestAngle;
  const summary = findings.viralAnalysis?.verdict;
  const label = `Viral Research · ${topic || "Untitled"}`;
  const common = { sourceLabel: label, researchId, topic, angle, audience, platform };

  return [
    {
      id: "video", module: "video", label: "Generate Video", route: "/videos",
      icon: <Video className="w-4 h-4" />,
      build: () => ({
        ...common, module: "video",
        duration: 60, format: a?.suggestedFormat, aspectRatio: "16:9",
        titles: a?.titles, hooks: a?.hooks, cta: a?.cta,
        keywords: a?.keywords, hashtags: a?.hashtags,
        outline: a?.hooks, summary,
        thumbnailText: a?.thumbnailText, thumbnailConcepts: a?.thumbnailConcepts,
        tone: findings.inputs?.contentFormat,
      }),
    },
    {
      id: "short", module: "short", label: "Generate Short / Reel", route: "/videos",
      icon: <Video className="w-4 h-4" />,
      build: () => ({
        ...common, module: "short",
        duration: 45, format: "reel", aspectRatio: "9:16",
        titles: a?.titles, hooks: a?.hooks, cta: a?.cta,
        onScreenText: a?.hooks, outline: a?.hooks,
        voiceoverDirection: angle, summary,
        keywords: a?.keywords, hashtags: a?.hashtags,
      }),
    },
    {
      id: "thumbnail", module: "thumbnail", label: "Generate Thumbnail", route: "/thumbnails",
      icon: <ImageIcon className="w-4 h-4" />,
      build: () => ({
        ...common, module: "thumbnail",
        aspectRatio: platform === "youtube" ? "16:9" : "9:16",
        thumbnailText: a?.thumbnailText, thumbnailConcepts: a?.thumbnailConcepts,
        subject: angle, emotion: "curiosity", composition: "rule-of-thirds",
        colorDirection: "high-contrast warm", ctrTips: a?.hooks, titles: a?.titles,
      }),
    },
    {
      id: "carousel", module: "carousel", label: "Generate Carousel", route: "/create/carousel",
      icon: <Layers className="w-4 h-4" />,
      build: () => ({
        ...common, module: "carousel",
        aspectRatio: "4:5", slideCount: 7,
        slideOutline: a?.titles, keyPoints: a?.hooks,
        cta: a?.cta, keywords: a?.keywords, hashtags: a?.hashtags,
        imagePrompt: angle, summary,
      }),
    },
    {
      id: "linkedin", module: "linkedin", label: "Generate LinkedIn Post", route: "/linkedin-posts/new",
      icon: <Linkedin className="w-4 h-4" />,
      build: () => ({
        ...common, module: "linkedin", platform: "linkedin",
        hooks: a?.hooks, body: angle, keyPoints: a?.titles,
        cta: a?.cta, firstComment: a?.cta, hashtags: a?.hashtags,
        heroConcept: a?.thumbnailConcepts?.[0], includeImage: false, includeCarousel: false,
        tone: "Professional",
      }),
    },
    {
      id: "caption", module: "caption", label: "Generate Caption", route: "/captions",
      icon: <Type className="w-4 h-4" />,
      build: () => ({
        ...common, module: "caption",
        objective: angle, tone: "Conversational",
        cta: a?.cta, hashtags: a?.hashtags, keywords: a?.keywords,
        hooks: a?.hooks,
      }),
    },
    {
      id: "image", module: "image", label: "Generate Image", route: "/images",
      icon: <ImageIcon className="w-4 h-4" />,
      build: () => ({
        ...common, module: "image",
        imagePrompt: a?.thumbnailConcepts?.[0] ?? angle ?? topic,
        negativePrompt: "low quality, blurry, text artifacts, extra fingers",
        style: "cinematic", lighting: "dramatic",
        aspectRatio: "1:1", composition: "rule-of-thirds",
      }),
    },
    {
      id: "strategy", module: "strategy", label: "Save to AI Strategy", route: "/strategy",
      icon: <Target className="w-4 h-4" />,
      build: () => ({
        ...common, module: "strategy",
        opportunityScore: findings.viralAnalysis?.score,
        contentGap: a?.contentGap, bestAngle: angle,
        recommendedFormats: a?.suggestedFormat ? [a.suggestedFormat] : undefined,
        cta: a?.cta,
        evidence: findings.viralAnalysis?.reasons,
      }),
    },
    {
      id: "calendar", module: "calendar", label: "Add to Content Calendar", route: "/calendar",
      icon: <CalendarPlus className="w-4 h-4" />,
      build: () => ({
        ...common, module: "calendar",
        contentType: a?.suggestedFormat, urgency: a?.urgency,
        titles: a?.titles, cta: a?.cta,
      }),
    },
  ];
}

function OneClickActions({ findings, navigate }: { findings: ResearchFindings; navigate: ReturnType<typeof useNavigate> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ action: ActionDef; payload: Omit<ResearchPrefill, "at" | "handoffId" | "source">; autogen: boolean } | null>(null);
  const researchId = (findings as ResearchFindings & { id?: string }).id ?? null;
  const actions = useMemo(() => buildActions(findings, researchId), [findings, researchId]);

  // Modules that support the "Generate Now" fast path (have a Review & Edit
  // step with a prominent Generate button that reads from research prefill).
  const supportsAutogen = (m: ResearchModuleId) =>
    ["video", "short", "thumbnail", "carousel", "linkedin", "caption", "image"].includes(m);

  const nounFor = (action: ActionDef) =>
    action.label.replace(/^Generate |^Save to |^Add to /, "");

  const runAction = async (action: ActionDef, autogen: boolean) => {
    if (busyId) return;
    setBusyId(`${action.id}:${autogen ? "gen" : "draft"}`);
    const noun = nounFor(action);
    const toastId = toast.loading(autogen ? `Opening ${noun.toLowerCase()} generator…` : `Preparing ${noun.toLowerCase()} draft…`);
    try {
      const payload = { ...action.build(findings, researchId), autogen };
      const record = setResearchPrefill(payload);
      if (!record) throw new Error("Could not save handoff — storage unavailable");

      const wizardModule = action.module === "short" ? "video" : action.module;
      if (["video", "carousel", "image", "thumbnail", "linkedin", "caption"].includes(wizardModule)) {
        saveDraft({
          module: wizardModule as "video" | "carousel" | "image" | "thumbnail" | "linkedin" | "caption",
          originalPrompt: payload.angle ? `${payload.topic}\n\nAngle: ${payload.angle}` : payload.topic,
          aiPlan: null, editedPlan: null, result: null, exports: [], updatedAt: Date.now(),
        });
      }

      if (autogen) {
        toast.success("Opening generator — review & Generate Now", { id: toastId });
      } else {
        toast.success(`Opening ${noun.toLowerCase()} — prefilled with this research`, { id: toastId });
      }
      navigate({ to: action.route });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Handoff failed";
      toast.error(msg, { id: toastId });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="glass rounded-2xl border border-white/10 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">One-click actions</div>
      <p className="text-xs text-muted-foreground mb-3">
        <span className="text-foreground/80 font-medium">Create Draft</span> opens the destination module prefilled with this research.
        <span className="mx-1">·</span>
        <span className="text-foreground/80 font-medium">Generate Now</span> jumps straight to the Review &amp; Generate step. Credits are checked and reserved before any AI provider is called; failed generations are refunded automatically.
      </p>
      <div className="flex flex-col gap-2">
        {actions.map((action) => {
          const noun = nounFor(action);
          const canAutogen = supportsAutogen(action.module);
          const draftBusy = busyId === `${action.id}:draft`;
          const genBusy = busyId === `${action.id}:gen`;
          const anyBusy = !!busyId;
          return (
            <div key={action.id} className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 text-sm text-foreground/90 min-w-[180px]">
                <span className="text-primary">{action.icon}</span>
                <span className="truncate">{noun}</span>
              </div>
              <div className="inline-flex items-stretch rounded-xl border border-white/10 overflow-hidden">
                <button
                  type="button"
                  disabled={anyBusy}
                  onClick={() => runAction(action, false)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {draftBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {action.module === "strategy" ? `Save to ${noun}` : action.module === "calendar" ? `Add to ${noun}` : `Create ${noun} Draft`}
                </button>
                {canAutogen && (
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => runAction(action, true)}
                    className="inline-flex items-center gap-2 px-3 py-2 text-xs border-l border-white/10 bg-gradient-to-r from-orange-500/20 to-pink-500/20 hover:from-orange-500/30 hover:to-pink-500/30 text-pink-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {genBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    Generate {noun} Now
                  </button>
                )}
                <button
                  type="button"
                  title="Preview handoff"
                  aria-label={`Preview handoff for ${action.label}`}
                  disabled={anyBusy}
                  onClick={() => setPreview({ action, payload: action.build(findings, researchId), autogen: false })}
                  className="px-2 border-l border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <PreviewHandoffDialog
        open={!!preview}
        onClose={() => setPreview(null)}
        onConfirm={() => { const p = preview!; setPreview(null); void runAction(p.action, p.autogen); }}
        payload={preview?.payload ?? null}
        moduleLabel={preview?.action ? nounFor(preview.action) : ""}
      />
    </div>
  );
}

// ---------- Bits ----------

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{children}</div>;
}

function IconBtn({ children, onClick, title, tone }: { children: React.ReactNode; onClick: () => void; title: string; tone?: "danger" }) {
  return (
    <button title={title} onClick={onClick}
      className={`p-2 rounded-lg border border-white/10 ${tone === "danger" ? "text-red-400 hover:bg-red-500/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
      {children}
    </button>
  );
}



function ScorePill({ score, label }: { score: number; label: string }) {
  const s = Math.max(0, Math.min(100, score));
  const tone =
    s >= 85 ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
    s >= 70 ? "bg-orange-500/15 text-orange-300 border-orange-500/30" :
    s >= 55 ? "bg-amber-500/15 text-amber-300 border-amber-500/30" :
    s >= 40 ? "bg-red-500/15 text-red-300 border-red-500/30" :
              "bg-red-600/20 text-red-300 border-red-600/40";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${tone}`}>{s} · {label}</span>;
}
