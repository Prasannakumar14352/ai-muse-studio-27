// Promo Video Studio — 5-step wizard (Details → Brand → Plan → Generate → Review).
// AI plan via planPromoVideoFn, images via /api/generate-image, video via
// client-side renderVideo. Persists project row + plan JSON in projects.metadata
// and mirrors the wizard state in sessionStorage for refresh survival.

import { createFileRoute, Link } from "@tanstack/react-router";
import { celebrate } from "@/components/celebrate";
import { confirmDialog } from "@/components/confirm-dialog";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Megaphone, Sparkles, ChevronLeft, ChevronRight, Upload, Wand2,
  Play, Download, Copy, RotateCcw, CheckCircle2, X, Loader2, ImagePlus, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";
import { supabase } from "@/integrations/supabase/client";
import { ProjectsSection } from "@/components/projects-section";
import { useQueryClient } from "@tanstack/react-query";
import { convertRenderToMp4 } from "@/lib/transcode-client";
import { saveOutput } from "@/lib/local-store";
import { useAccess, getAvailableCredits } from "@/lib/access";
import { findLanguage } from "@/lib/languages";
import { useCreditGuard } from "@/lib/use-credit-guard";
import {
  PROMO_FORMATS,
  PROMO_FORMATS_BY_ID,
  creatorFlowPreset,
  planPromoVideoFn,
  regeneratePromoSceneFn,
  type PromoBrief,
  type PromoFormatId,
  type PromoPlan,
  type PromoScene,
} from "@/lib/promo-video.functions";
import { fetchGeneratedImage } from "@/lib/image-stream";
import { shrinkForVision } from "@/lib/image-shrink";
import { LanguagePicker } from "@/components/language-picker";
import { renderVideo, type RenderScene, type CameraMotion, type TransitionStyle } from "@/lib/video-renderer";

export const Route = createFileRoute("/_authenticated/promo-videos")({
  head: () => ({
    meta: [
      { title: "Promo Video Studio — CreatorFlow AI" },
      { name: "description", content: "Create high-converting promotional videos for your product, brand or service across Reels, Shorts, TikTok, YouTube and social ads." },
    ],
  }),
  component: PromoVideosPage,
});

// ---------- Constants ----------

const GOAL_OPTIONS = [
  "Brand Awareness", "Website Visits", "Leads", "Sign-ups",
  "App Downloads", "Product Sales", "Event Registrations",
];
const TONE_OPTIONS = [
  "Professional", "Cinematic", "Energetic", "Luxury",
  "Emotional", "Educational", "Funny", "Bold", "Minimal",
];
const DURATION_OPTIONS = [10, 15, 30, 45, 60, 90];
const VOICE_OPTIONS: Array<{ value: PromoBrief["voiceover"]; label: string }> = [
  { value: "none", label: "No voiceover" },
  { value: "auto", label: "AI-picked voice" },
  { value: "male", label: "Male voice" },
  { value: "female", label: "Female voice" },
];

const DRAFT_KEY = "cf.promo-video.draft.v1";
const STEPS = ["Details", "Brand", "Plan", "Generate", "Review"] as const;
type StepId = 0 | 1 | 2 | 3 | 4;

function emptyBrief(): PromoBrief {
  return {
    productName: "",
    topic: "",
    description: "",
    audience: "",
    goal: "Sign-ups",
    format: "instagram_reel",
    durationSec: 30,
    tone: "Energetic",
    language: "English",
    ctaUrl: "",
    ctaText: "",
    offer: "",
    voiceover: "auto",
    captions: true,
    music: true,
    brandColors: [],
    hasLogo: false,
    hasProductImages: false,
  };
}

type Draft = {
  brief: PromoBrief;
  logo: string | null;             // data URL
  productImages: string[];         // data URLs
  brandColors: string[];
  plan: PromoPlan | null;
  step: StepId;
  projectId: string | null;
  videoUrl: string | null;         // blob URL, ephemeral (not persisted)
  sceneImages: (string | null)[];  // data URLs
};

function loadDraft(): Draft {
  if (typeof window === "undefined") return newDraft();
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return newDraft();
    const parsed = JSON.parse(raw) as Draft;
    // videoUrl blob URLs don't survive refresh — drop them.
    return { ...newDraft(), ...parsed, videoUrl: null };
  } catch {
    return newDraft();
  }
}
function newDraft(): Draft {
  return {
    brief: emptyBrief(),
    logo: null,
    productImages: [],
    brandColors: [],
    plan: null,
    step: 0,
    projectId: null,
    videoUrl: null,
    sceneImages: [],
  };
}
function saveDraft(d: Draft) {
  try {
    const { videoUrl: _v, ...rest } = d;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
  } catch { /* quota — ignore */ }
}

// ---------- Page ----------

function PromoVideosPage() {
  const queryClient = useQueryClient();
  const { data: access } = useAccess();
  const [draft, setDraft] = useState<Draft>(() => loadDraft());
  const { runWithCredits, InsufficientDialog } = useCreditGuard();
  const planFn = useServerFn(planPromoVideoFn);
  const regenSceneFn = useServerFn(regeneratePromoSceneFn);
  const [planning, setPlanning] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Idempotency keys — one UUID per intentional Generate click. Kept in refs
  // so React re-renders never mint a new key mid-flight. Cleared on success
  // or terminal failure so the next click starts a fresh operation. Retries
  // of the same in-flight request reuse the same key → server dedupes via
  // credit_ledger.idempotency_key and never double-charges / double-creates.
  const planKeyRef = useRef<string | null>(null);
  const renderKeyRef = useRef<string | null>(null);
  const sceneKeyRefs = useRef<Map<number, string>>(new Map());
  const newKey = () =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const GENERIC_ERR = "Couldn’t start generation. Please try again.";


  useEffect(() => { saveDraft(draft); }, [draft]);

  const fmt = PROMO_FORMATS_BY_ID[draft.brief.format];
  const setBrief = useCallback(
    (patch: Partial<PromoBrief>) => setDraft((d) => ({ ...d, brief: { ...d.brief, ...patch } })),
    [],
  );

  const goto = useCallback((s: StepId) => setDraft((d) => ({ ...d, step: s })), []);

  const applyPreset = () => {
    setDraft((d) => ({ ...d, brief: { ...d.brief, ...creatorFlowPreset() } as PromoBrief }));
    toast.success("CreatorFlow AI preset loaded — feel free to edit");
  };

  const resetAll = async () => {
    const ok = await confirmDialog({
      title: "Discard this promo?",
      description: "Your brief, plan and photos for this promo will be cleared so you can start over.",
      confirmText: "Discard",
      tone: "destructive",
    });
    if (!ok) return;
    setDraft(newDraft());
    sessionStorage.removeItem(DRAFT_KEY);
  };

  // ---- Estimates ----
  const estimatedSceneCount = Math.max(3, Math.min(9, Math.round(draft.brief.durationSec / 5)));
  // Plan (2) + scene step (2 per scene) + each scene image, which /api/generate-image
  // charges itself: 1 credit normally, HD price when real product photos are used.
  const sceneImageCost = draft.productImages.length ? 8 : 1;
  const estimatedCredits = 2 + estimatedSceneCount * (2 + sceneImageCost);

  // ---- Step actions ----
  const detailsReady =
    !!draft.brief.productName.trim() && !!draft.brief.topic.trim() && draft.brief.durationSec >= 5;

  const runPlanning = async () => {
    if (!detailsReady || planning) return;
    setPlanning(true);
    if (!planKeyRef.current) planKeyRef.current = newKey();
    try {
      const plan = await runWithCredits(
        {
          action: "promo_plan",
          amount: 2,
          description: `Promo plan — ${draft.brief.productName}`.slice(0, 200),
          inputHash: planKeyRef.current,
        },
        () => planFn({ data: draft.brief }) as Promise<PromoPlan>,
      );
      setDraft((d) => ({ ...d, plan, step: 2, sceneImages: new Array(plan.scenes.length).fill(null) }));
      planKeyRef.current = null; // success → new operation gets a fresh key
      toast.success("AI plan ready — review or edit before generating");
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "insufficient_credits") {
        // Modal already surfaced by useCreditGuard; keep key for retry.
      } else {
        console.error("[promo-video] planning failed", e);
        planKeyRef.current = null; // terminal failure → next click is a new op
        toast.error(GENERIC_ERR);
      }
    } finally {
      setPlanning(false);
    }
  };


  const updateScene = (i: number, patch: Partial<PromoScene>) => {
    setDraft((d) => {
      if (!d.plan) return d;
      const scenes = d.plan.scenes.slice();
      scenes[i] = { ...scenes[i], ...patch };
      return { ...d, plan: { ...d.plan, scenes } };
    });
  };

  const regenerateScene = async (i: number, instruction?: string) => {
    if (!draft.plan || regeneratingIdx !== null) return;
    setRegeneratingIdx(i);
    if (!sceneKeyRefs.current.get(i)) sceneKeyRefs.current.set(i, newKey());
    const key = sceneKeyRefs.current.get(i)!;
    try {
      const next = await runWithCredits(
        {
          action: "promo_scene_regen",
          amount: 1,
          description: `Rewrite scene ${i + 1}`,
          inputHash: key,
        },
        () => regenSceneFn({ data: { brief: draft.brief, scene: draft.plan!.scenes[i], instruction } }) as Promise<PromoScene>,
      );
      updateScene(i, next);
      sceneKeyRefs.current.delete(i);
      toast.success(`Scene ${i + 1} rewritten`);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "insufficient_credits") {
        // keep key for retry after top-up
      } else {
        console.error("[promo-video] scene regen failed", e);
        sceneKeyRefs.current.delete(i);
        toast.error(GENERIC_ERR);
      }
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const runGeneration = async () => {
    if (!draft.plan || !access?.userId || rendering) return;
    setRendering(true);
    setRenderProgress(0);
    abortRef.current = new AbortController();
    if (!renderKeyRef.current) renderKeyRef.current = newKey();
    try {
      await runWithCredits(
        {
          action: "promo_video",
          amount: draft.plan.scenes.length * 2,
          description: `Promo video — ${draft.plan.title}`.slice(0, 200),
          inputHash: renderKeyRef.current,
        },
        () => renderPipeline(),
      );
      renderKeyRef.current = null; // success
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === "insufficient_credits") {
        // keep key for retry
      } else {
        console.error("[promo-video] generation failed", e);
        renderKeyRef.current = null; // terminal failure → next click new op
        toast.error(GENERIC_ERR);
      }
    } finally {
      setRendering(false);
      abortRef.current = null;
    }
  };


  const renderPipeline = async () => {
    if (!draft.plan || !access?.userId) throw new Error("Missing plan");
    const plan = draft.plan;
    const fmtLocal = PROMO_FORMATS_BY_ID[plan.format];
    const isVertical = fmtLocal.aspect === "9:16";
    const ratio = fmtLocal.aspect;

    // 1) Generate a still per scene (skip if already have one).
    const stills: (string | null)[] = draft.sceneImages.slice();
    while (stills.length < plan.scenes.length) stills.push(null);
    const totalSteps = plan.scenes.length + 1; // + render itself
    let done = 0;
    for (let i = 0; i < plan.scenes.length; i++) {
      if (abortRef.current?.signal.aborted) throw new Error("Cancelled");
      if (stills[i]) { done++; setRenderProgress(done / totalSteps * 0.7); continue; }
      const s = plan.scenes[i];
      // Real product photos: every scene shows the seller's actual product.
      const refs = draft.productImages.slice(0, 3);
      const productLock = refs.length
        ? `Use the exact product shown in the reference photo${refs.length > 1 ? "s" : ""} — keep its shape, colours, printed design, text and logo exactly as they are; do not redesign it. Place it naturally in this scene: `
        : "";
      const prompt = `${productLock}${s.visual_prompt}. ${fmtLocal.composition} Cinematic, photorealistic, HDR, DSLR quality, ${draft.brief.tone.toLowerCase()} mood. Product/brand focus: ${draft.brief.productName}. On-screen safe zone: ${fmtLocal.safeZone}. No text or captions in the image.`;
      const res = await fetchGeneratedImage({
        prompt, ratio, quality: "medium", signal: abortRef.current?.signal,
        ...(refs.length ? { referenceImages: refs } : {}),
      });
      // Out of credits mid-render: stop instead of rendering a video with blank scenes.
      if (!res.image && res.status === 402) throw new Error(res.error ?? "Not enough credits for the scene images.");
      if (res.image) stills[i] = res.image;
      done++;
      setRenderProgress(done / totalSteps * 0.7);
      setDraft((d) => ({ ...d, sceneImages: stills.slice() }));
    }

    // 2) Render video from stills using the shared canvas pipeline.
    const scenes: RenderScene[] = plan.scenes.map((s, idx) => ({
      n: idx + 1,
      visual: s.visual_prompt,
      voiceover: s.voiceover,
      duration: String(s.duration_sec),
      on_screen_text: s.on_screen_text,
      motion: (s.motion as CameraMotion | undefined) ?? "zoomIn",
      transition: (s.transition as TransitionStyle | undefined) ?? "fade",
    }));

    const result = await renderVideo({
      title: plan.title,
      platform: isVertical ? "instagram" : "youtube",
      contentType: isVertical ? "short_reel" : "product_promo",
      scenes,
      sceneImages: stills,
      showOnScreenText: draft.brief.captions,
      signal: abortRef.current?.signal,
      onProgress: (p) => setRenderProgress(0.7 + p * 0.3),
    });

    const videoUrl = URL.createObjectURL(result.blob);

    // 3) Persist project row.
    const { data: project, error: pErr } = await supabase.from("projects").insert({
      user_id: access.userId,
      title: plan.title,
      content_type: "promo_video",
      topic: draft.brief.topic,
      audience: draft.brief.audience ?? null,
      platform: fmtLocal.platform,
      tone: draft.brief.tone,
      style: null,
      voice: draft.brief.voiceover,
      music: draft.brief.music ? plan.music_mood : null,
      status: "generated",
      aspect_ratio: fmtLocal.aspect,
      duration_sec: draft.brief.durationSec,
      language: draft.brief.language,
      cta: plan.cta,
      objective: draft.brief.goal,
      format: "promo_video",
      metadata: {
        brief: draft.brief,
        plan,
        format: fmtLocal,
        preview_url: null, // blob URL only lives in memory
        scene_still_count: stills.filter(Boolean).length,
      },
    }).select().single();
    if (pErr) throw pErr;

    // 4) Upload the video so it's still there after a refresh and on the project page.
    //    (Before, the video only lived in this browser tab and was lost on reload.)
    let savedUrl: string | null = null;
    try {
      setRenderProgress(0.99);
      const ext = result.extension || "webm";
      const path = `${access.userId}/${project.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("renders").upload(path, result.blob, {
        contentType: result.mimeType || result.blob.type || "video/webm", upsert: true,
      });
      if (upErr) throw upErr;
      const mp4 = await convertRenderToMp4(path, isVertical ? "vertical" : fmtLocal.aspect === "1:1" ? "square" : "landscape", { deleteSource: true });
      const finalPath = mp4?.path ?? path;
      savedUrl = mp4?.url
        ?? (await supabase.storage.from("renders").createSignedUrl(finalPath, 60 * 60 * 24 * 7)).data?.signedUrl
        ?? null;
      await supabase.from("projects").update({
        metadata: { ...(project.metadata as Record<string, unknown> ?? {}), render_path: finalPath },
      }).eq("id", project.id);
    } catch (e) {
      console.warn("[promo] upload failed", e);
      toast.warning("Your promo is ready here, but saving it to Projects failed — download it now so you don't lose it.");
    }
    try {
      await saveOutput(project.id, {
        title: plan.title,
        hook: plan.scenes[0]?.on_screen_text ?? "",
        script: plan.scenes.map((s) => s.voiceover).filter(Boolean).join("\n"),
        scenes: scenes.map((sc) => ({ n: sc.n, visual: sc.visual, voiceover: sc.voiceover, duration: sc.duration, on_screen_text: sc.on_screen_text })),
        video_url: savedUrl,
      });
    } catch { /* local save is best-effort */ }

    setDraft((d) => ({ ...d, videoUrl: savedUrl ?? videoUrl, projectId: project.id, step: 4 }));
    void queryClient.invalidateQueries({ queryKey: ["projects-section", "promo-videos"] });
    celebrate({
      title: "Your promo video is ready!",
      subtitle: `${draft.brief.productName || "Your promo"} · ${savedUrl ? "saved to Projects." : "download it now."}`,
      videoUrl: savedUrl ?? videoUrl,
      downloadName: `${(plan.title || "promo").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp4`,
      primaryLabel: "See my promo",
    });
  };

  const cancelRender = () => { abortRef.current?.abort(); };

  const stepValid = (s: StepId): boolean => {
    if (s === 0) return detailsReady;
    if (s === 1) return true;
    if (s === 2) return !!draft.plan;
    if (s === 3) return !!draft.plan;
    if (s === 4) return !!draft.videoUrl || !!draft.projectId;
    return false;
  };

  // The signed-in layout (_authenticated/route.tsx) already provides the sidebar and top bar.
  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Business Promo</h1>
            <p className="text-muted-foreground mt-1.5">A promo video built around your real product photos — you approve the plan before anything is made.</p>
          </div>
          {(draft.step > 0 || draft.brief.productName) && (
            <Button variant="ghost" size="sm" onClick={resetAll}>Start over</Button>
          )}
        </div>

        <Stepper current={draft.step} onGoto={(s) => stepValid(s) && goto(s)} canGo={stepValid} />

        <div className={draft.step <= 2 ? "grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start" : ""}>
        <div className="min-w-0 space-y-6">
        {draft.step === 0 && (
          <DetailsStep
            brief={draft.brief}
            setBrief={setBrief}
            onNext={() => goto(1)}
            onPreset={access?.isAdmin ? applyPreset : undefined}
            estimatedCredits={estimatedCredits}
            estimatedSceneCount={estimatedSceneCount}
          />
        )}

        {draft.step === 1 && (
          <BrandStep
            draft={draft}
            setDraft={setDraft}
            onBack={() => goto(0)}
            onNext={runPlanning}
            planning={planning}
            estimatedCredits={estimatedCredits}
          />
        )}

        {draft.step === 2 && draft.plan && (
          <PlanStep
            plan={draft.plan}
            fmt={fmt}
            onEditScene={updateScene}
            onRegen={regenerateScene}
            regeneratingIdx={regeneratingIdx}
            onBack={() => goto(1)}
            onNext={() => { goto(3); runGeneration(); }}
            onReplan={runPlanning}
            replanning={planning}
          />
        )}

        {draft.step === 3 && (
          <GenerateStep
            progress={renderProgress}
            rendering={rendering}
            onCancel={cancelRender}
            onRetry={runGeneration}
            plan={draft.plan}
            sceneImages={draft.sceneImages}
          />
        )}

        {draft.step === 4 && draft.plan && (
          <ReviewStep
            plan={draft.plan}
            videoUrl={draft.videoUrl}
            sceneImages={draft.sceneImages}
            fmt={fmt}
            onRerender={runGeneration}
            onBack={() => goto(2)}
            onReset={resetAll}
          />
        )}
        </div>

        {draft.step <= 2 && (
          <aside className="lg:sticky lg:top-20 space-y-4">
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="font-semibold">Your promo</div>
              <div className="flex items-center gap-3">
                {draft.productImages[0] ? (
                  <img src={draft.productImages[0]} alt="" className="h-14 w-14 rounded-xl object-cover border border-border" />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-xl bg-secondary border border-dashed border-border text-muted-foreground"><Megaphone className="h-5 w-5" /></div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{draft.brief.productName || "Your product"}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{draft.brief.topic || "What you're promoting"}</div>
                </div>
              </div>
              <PromoRow label="Format" value={fmt ? `${fmt.label} · ${fmt.aspect}` : "—"} />
              <PromoRow label="Length" value={`${draft.brief.durationSec}s · ~${estimatedSceneCount} scenes`} />
              <PromoRow label="Language" value={findLanguage(draft.brief.language)?.id ?? draft.brief.language} />
              <PromoRow label="Voiceover" value={VOICE_OPTIONS.find((v) => v.value === draft.brief.voiceover)?.label ?? String(draft.brief.voiceover)} />
              <PromoRow label="Product photos" value={draft.productImages.length ? `${draft.productImages.length} added ✓` : "None yet"} />
              <PromoRow label="Logo" value={draft.logo ? "Added ✓" : "None"} />
              <div className="h-px bg-border" />
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">Estimated total</span>
                <span className="text-2xl font-bold text-primary [font-family:'Space_Grotesk',Inter,sans-serif]">≈ {estimatedCredits} cr</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Plan 2 cr · {estimatedSceneCount} scenes × {2 + sceneImageCost} cr{draft.productImages.length ? " (HD images with your photos)" : ""}
              </div>
              {(() => {
                const available = access ? getAvailableCredits(access) : null;
                if (available === null || !Number.isFinite(available)) return null;
                const ok = available >= estimatedCredits;
                return (
                  <div className={`rounded-xl px-3 py-2 text-xs font-medium ${ok ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {ok ? `✓ You have ${available.toLocaleString()} credits — enough` : `You have ${available.toLocaleString()} credits — top up before generating`}
                  </div>
                );
              })()}
            </div>
            <div className="glass rounded-2xl p-4 text-xs text-muted-foreground leading-relaxed">
              <div className="font-semibold text-sky-400 mb-1">💡 Tip</div>
              Add 3 clear product photos on the Brand step — every scene then shows your real product instead of an AI look-alike.
            </div>
          </aside>
        )}
        </div>

        {/* Promos made before — open one to watch, download or render it again */}
        <ProjectsSection
          contentTypes={["promo_video"]}
          title="Your promo videos"
          cacheKey="promo-videos"
          emptyLabel="Your finished promos will appear here"
          thumbnailAspect={fmt?.aspect === "9:16" ? "portrait" : "landscape"}
        />
      </div>
      {InsufficientDialog}
    </>
  );
}

// ---------- Stepper ----------

function Stepper({ current, onGoto, canGo }: { current: StepId; onGoto: (s: StepId) => void; canGo: (s: StepId) => boolean }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Progress">
      {STEPS.map((label, i) => {
        const on = i === current;
        const done = i < current;
        const reachable = canGo(i as StepId);
        return (
          <li key={label} className="flex items-center gap-2 shrink-0">
            {i > 0 && <span className={`h-0.5 w-5 sm:w-10 rounded-full ${done || on ? "bg-emerald-500/70" : "bg-border"}`} aria-hidden />}
            <button
              type="button"
              onClick={() => onGoto(i as StepId)}
              disabled={!reachable && !on}
              aria-current={on ? "step" : undefined}
              className="flex items-center gap-2 disabled:cursor-not-allowed"
            >
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                done ? "bg-emerald-500 text-white" : on ? "gradient-primary text-white shadow-[var(--shadow-glow)]" : "bg-secondary text-muted-foreground"
              }`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-sm font-medium ${done || on ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function PromoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

// ---------- Step 1: Details ----------

function DetailsStep({
  brief, setBrief, onNext, onPreset, estimatedCredits, estimatedSceneCount,
}: {
  brief: PromoBrief;
  setBrief: (p: Partial<PromoBrief>) => void;
  onNext: () => void;
  /** Admin-only: fill the form with CreatorFlow AI's own details. */
  onPreset?: () => void;
  estimatedCredits: number;
  estimatedSceneCount: number;
}) {
  const ready = !!brief.productName.trim() && !!brief.topic.trim();
  return (
    <Card className="p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary">
            <Megaphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Details</h2>
            <p className="text-xs text-muted-foreground">Tell us what to promote and where it will run.</p>
          </div>
        </div>
        {onPreset && <Button size="sm" variant="outline" onClick={onPreset} className="gap-2">
          <Sparkles className="h-3.5 w-3.5" /> Promote CreatorFlow AI
        </Button>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Product / brand / service *" htmlFor="productName">
          <Input id="productName" value={brief.productName} onChange={(e) => setBrief({ productName: e.target.value })} placeholder="e.g. Acme Fitness App" maxLength={100} />
        </Field>
        <Field label="Topic / promotion objective *" htmlFor="topic">
          <Input id="topic" value={brief.topic} onChange={(e) => setBrief({ topic: e.target.value })} placeholder="e.g. 30-day summer shred challenge" maxLength={200} />
        </Field>
        <Field label="Description / key offer" htmlFor="description" className="md:col-span-2">
          <Textarea id="description" value={brief.description ?? ""} onChange={(e) => setBrief({ description: e.target.value })} placeholder="What makes it valuable? Features, transformation, results…" rows={3} maxLength={800} />
        </Field>
        <Field label="Target audience" htmlFor="audience">
          <Input id="audience" value={brief.audience ?? ""} onChange={(e) => setBrief({ audience: e.target.value })} placeholder="e.g. busy professionals 25–40" maxLength={160} />
        </Field>
        <Field label="Campaign goal">
          <CreatorFlowSelect value={brief.goal} onValueChange={(v) => setBrief({ goal: v })} options={GOAL_OPTIONS} ariaLabel="Campaign goal" />
        </Field>
        <Field label="Platform / format">
          <CreatorFlowSelect
            value={brief.format}
            onValueChange={(v) => setBrief({ format: v as PromoFormatId })}
            options={PROMO_FORMATS.map((f) => ({ value: f.id, label: `${f.label} — ${f.aspect} ${f.width}×${f.height}` }))}
            ariaLabel="Platform / format"
          />
        </Field>
        <Field label="Duration (seconds)">
          <CreatorFlowSelect
            value={String(brief.durationSec)}
            onValueChange={(v) => setBrief({ durationSec: Number(v) })}
            options={DURATION_OPTIONS.map((d) => ({ value: String(d), label: `${d}s` }))}
            ariaLabel="Duration"
          />
        </Field>
        <Field label="Tone">
          <CreatorFlowSelect value={brief.tone} onValueChange={(v) => setBrief({ tone: v })} options={TONE_OPTIONS} ariaLabel="Tone" />
        </Field>
        <Field label="Language">
          <LanguagePicker value={brief.language} onChange={(v) => setBrief({ language: v })} />
        </Field>
        <Field label="Voiceover">
          <CreatorFlowSelect
            value={brief.voiceover}
            onValueChange={(v) => setBrief({ voiceover: v as PromoBrief["voiceover"] })}
            options={VOICE_OPTIONS}
            ariaLabel="Voiceover"
          />
        </Field>
        <Field label="Website / CTA URL" htmlFor="ctaUrl">
          <Input id="ctaUrl" value={brief.ctaUrl ?? ""} onChange={(e) => setBrief({ ctaUrl: e.target.value })} placeholder="https://…" maxLength={300} />
        </Field>
        <Field label="CTA text (optional)" htmlFor="ctaText">
          <Input id="ctaText" value={brief.ctaText ?? ""} onChange={(e) => setBrief({ ctaText: e.target.value })} placeholder="Auto-generated if empty" maxLength={80} />
        </Field>
        <Field label="Offer / price / discount" htmlFor="offer">
          <Input id="offer" value={brief.offer ?? ""} onChange={(e) => setBrief({ offer: e.target.value })} placeholder="e.g. 40% off — this week only" maxLength={160} />
        </Field>
        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary p-3">
          <div>
            <div className="text-sm font-medium">Captions on video</div>
            <div className="text-xs text-muted-foreground">Burned-in text overlays per scene</div>
          </div>
          <Switch checked={brief.captions} onCheckedChange={(v) => setBrief({ captions: v })} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-secondary p-3">
          <div>
            <div className="text-sm font-medium">Background music</div>
            <div className="text-xs text-muted-foreground">Auto-suggest a mood</div>
          </div>
          <Switch checked={brief.music} onCheckedChange={(v) => setBrief({ music: v })} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          ~{estimatedSceneCount} scenes · est. <span className="text-foreground font-medium">{estimatedCredits} credits</span>
        </p>
        <Button onClick={onNext} disabled={!ready} className="gap-2">
          Next: Brand assets <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function Field({ label, htmlFor, className, children }: { label: string; htmlFor?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// ---------- Step 2: Brand ----------

function BrandStep({
  draft, setDraft, onBack, onNext, planning, estimatedCredits,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onBack: () => void;
  onNext: () => void;
  planning: boolean;
  estimatedCredits: number;
}) {
  const readFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Read failed"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
  const onLogo = async (f: File | null) => {
    if (!f) return;
    if (f.size > 3_000_000) { toast.error("Logo must be under 3 MB"); return; }
    const url = await readFile(f);
    setDraft((d) => ({ ...d, logo: url, brief: { ...d.brief, hasLogo: true } }));
  };
  const onAddProductImage = async (files: FileList | null) => {
    if (!files) return;
    const next: string[] = [];
    for (const f of Array.from(files).slice(0, 6)) {
      if (f.size > 10_000_000) { toast.error(`${f.name} exceeds 10 MB — skipped`); continue; }
      // Phone photos are several MB; 1024 px is plenty for the AI and keeps
      // requests under the server's upload limit.
      next.push(await shrinkForVision(await readFile(f), 1024, 0.85));
    }
    setDraft((d) => {
      const merged = [...d.productImages, ...next].slice(0, 8);
      return { ...d, productImages: merged, brief: { ...d.brief, hasProductImages: merged.length > 0 } };
    });
  };
  const removeProductImage = (i: number) => setDraft((d) => {
    const merged = d.productImages.filter((_, idx) => idx !== i);
    return { ...d, productImages: merged, brief: { ...d.brief, hasProductImages: merged.length > 0 } };
  });

  const addColor = (v: string) => setDraft((d) => ({ ...d, brandColors: [...d.brandColors, v].slice(0, 5), brief: { ...d.brief, brandColors: [...d.brandColors, v].slice(0, 5) } }));

  return (
    <Card className="p-5 sm:p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Brand assets</h2>
        <p className="text-xs text-muted-foreground">Optional — add clear photos of your real product (mug, T-shirt, keychain…) and every scene will show it exactly as it is. Scenes with product photos use HD images, so they cost more credits.</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Logo</Label>
          <div className="rounded-xl border border-dashed border-border bg-white/[0.02] p-4">
            {draft.logo ? (
              <div className="flex items-center gap-3">
                <img src={draft.logo} alt="Logo" className="h-16 w-16 rounded-lg object-contain bg-white/5" />
                <Button size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, logo: null, brief: { ...d.brief, hasLogo: false } }))}>
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-3 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" /> Upload PNG or SVG (≤ 3 MB)
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Brand colors ({draft.brandColors.length}/5)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {draft.brandColors.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border pl-1 pr-2 py-0.5 text-xs">
                <span className="h-4 w-4 rounded-full border border-border" style={{ background: c }} />
                {c}
                <button aria-label="Remove" className="opacity-70 hover:opacity-100" onClick={() => setDraft((d) => ({ ...d, brandColors: d.brandColors.filter((_, x) => x !== i) }))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {draft.brandColors.length < 5 && (
              <input
                type="color"
                onChange={(e) => addColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                aria-label="Add brand color"
              />
            )}
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label className="text-xs text-muted-foreground">Product photos ({draft.productImages.length}/8) — the first 3 are used in every scene</Label>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {draft.productImages.map((src, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-white/5">
                <img src={src} alt={`Product ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  onClick={() => removeProductImage(i)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <Trash2 className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
            ))}
            {draft.productImages.length < 8 && (
              <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border border-dashed border-border bg-white/[0.02] text-xs text-muted-foreground hover:border-primary/40">
                <div className="flex flex-col items-center gap-1">
                  <ImagePlus className="h-5 w-5" /> Add
                </div>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onAddProductImage(e.target.files)} />
              </label>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Uploaded images are used only as visual reference — the AI keeps your product identity consistent across scenes.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="ghost" onClick={onBack} className="gap-2"><ChevronLeft className="h-4 w-4" /> Back</Button>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">Est. <span className="text-foreground font-medium">{estimatedCredits} credits</span></p>
          <Button onClick={onNext} disabled={planning} className="gap-2">
            {planning ? <><Loader2 className="h-4 w-4 animate-spin" /> Planning…</> : <><Wand2 className="h-4 w-4" /> Generate AI plan</>}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------- Step 3: Plan ----------

function PlanStep({
  plan, fmt, onEditScene, onRegen, regeneratingIdx, onBack, onNext, onReplan, replanning,
}: {
  plan: PromoPlan;
  fmt: typeof PROMO_FORMATS[number];
  onEditScene: (i: number, patch: Partial<PromoScene>) => void;
  onRegen: (i: number, instruction?: string) => void;
  regeneratingIdx: number | null;
  onBack: () => void;
  onNext: () => void;
  onReplan: () => void;
  replanning: boolean;
}) {
  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{plan.title}</h2>
            <p className="text-xs text-muted-foreground">
              {fmt.label} · {fmt.aspect} · {plan.duration_sec}s · {plan.scenes.length} scenes · music: {plan.music_mood}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={onReplan} disabled={replanning} className="gap-2">
            {replanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Regenerate whole plan
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <PlanBlock title="Hook" text={plan.hook} onChange={(v) => onEditSceneMeta(plan, "hook", v)} />
          <PlanBlock title="Problem" text={plan.problem} onChange={(v) => onEditSceneMeta(plan, "problem", v)} />
          <PlanBlock title="Intro" text={plan.intro} onChange={(v) => onEditSceneMeta(plan, "intro", v)} />
          <PlanBlock title="Proof / result" text={plan.proof} onChange={(v) => onEditSceneMeta(plan, "proof", v)} />
          <PlanBlock title="Offer" text={plan.offer} onChange={(v) => onEditSceneMeta(plan, "offer", v)} />
          <PlanBlock title="CTA" text={plan.cta} onChange={(v) => onEditSceneMeta(plan, "cta", v)} />
        </div>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Scenes ({plan.scenes.length})</h3>
        {plan.scenes.map((s, i) => (
          <Card key={i} className="p-4 space-y-3 bg-white/[0.02] backdrop-blur border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-border">#{s.n}</Badge>
                <Badge className="bg-gradient-to-r from-pink-500/20 to-orange-500/20 border border-pink-500/30 text-white">{s.role}</Badge>
                <span className="text-xs text-muted-foreground">{s.duration_sec}s · transition: {s.transition}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onRegen(i)} disabled={regeneratingIdx === i} className="gap-2">
                {regeneratingIdx === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Rewrite scene
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="On-screen text">
                <Input value={s.on_screen_text} onChange={(e) => onEditScene(i, { on_screen_text: e.target.value })} maxLength={140} />
              </Field>
              <Field label="Voiceover">
                <Input value={s.voiceover} onChange={(e) => onEditScene(i, { voiceover: e.target.value })} maxLength={240} />
              </Field>
              <Field label="Visual prompt" className="md:col-span-2">
                <Textarea rows={2} value={s.visual_prompt} onChange={(e) => onEditScene(i, { visual_prompt: e.target.value })} maxLength={600} />
              </Field>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="ghost" onClick={onBack} className="gap-2"><ChevronLeft className="h-4 w-4" /> Back</Button>
        <Button onClick={onNext} className="gap-2">
          Generate video <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// PlanStep uses a small helper to edit non-scene fields; we keep the setter local
// via a shim that mutates through onEditScene / regen instead of adding a new prop.
// Rather than plumbing another callback, PlanStep re-uses `onEditScene(-1, {…})`
// pattern... but that would be confusing. Instead, we bind directly to `plan` via
// a helper on window? No — clean approach: hoist an editor.
function onEditSceneMeta(_plan: PromoPlan, _field: keyof PromoPlan, _value: string) {
  // Read-only fields in this UI; users edit at scene granularity. Kept as a no-op
  // so the PlanBlock inputs act as review-only text for these meta beats.
}

function PlanBlock({ title, text, onChange }: { title: string; text: string; onChange: (v: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-secondary p-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <Textarea rows={2} value={text} onChange={(e) => onChange(e.target.value)} className="border-0 bg-transparent p-0 focus-visible:ring-0" />
    </div>
  );
}

// ---------- Step 4: Generate ----------

function GenerateStep({
  progress, rendering, onCancel, onRetry, plan, sceneImages,
}: {
  progress: number;
  rendering: boolean;
  onCancel: () => void;
  onRetry: () => void;
  plan: PromoPlan | null;
  sceneImages: (string | null)[];
}) {
  return (
    <Card className="p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Generating your promo</h2>
          <p className="text-xs text-muted-foreground">Rendering scenes → composing video. Do not close this tab.</p>
        </div>
        {rendering ? (
          <Button variant="outline" size="sm" onClick={onCancel} className="gap-2"><X className="h-4 w-4" /> Cancel</Button>
        ) : (
          <Button size="sm" onClick={onRetry} className="gap-2"><RotateCcw className="h-4 w-4" /> Retry</Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div className="h-full bg-gradient-to-r from-pink-500 to-orange-500 transition-all" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">{Math.round(progress * 100)}%</p>
      </div>

      {plan && (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
          {plan.scenes.map((s, i) => {
            const img = sceneImages[i];
            return (
              <div key={i} className="aspect-video overflow-hidden rounded-lg border border-border bg-white/5 relative">
                {img ? (
                  <img src={img} alt={`Scene ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center">
                    <Loader2 className={`h-4 w-4 text-muted-foreground ${rendering ? "animate-spin" : ""}`} />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1.5 py-0.5 text-[10px] text-white truncate">
                  #{s.n} {s.role}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ---------- Step 5: Review ----------

function ReviewStep({
  plan, videoUrl, sceneImages, fmt, onRerender, onBack, onReset,
}: {
  plan: PromoPlan;
  videoUrl: string | null;
  sceneImages: (string | null)[];
  fmt: typeof PROMO_FORMATS[number];
  onRerender: () => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const copy = (v: string, label: string) => {
    navigator.clipboard.writeText(v).then(() => toast.success(`${label} copied`)).catch(() => toast.error("Copy failed"));
  };
  const download = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `${plan.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "promo"}-${fmt.id}.mp4`;
    a.click();
  };
  const downloadThumb = () => {
    const src = sceneImages[0];
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `${plan.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "promo"}-thumbnail.png`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl overflow-hidden border border-border bg-black">
            {videoUrl ? (
              <video src={videoUrl} controls playsInline className="w-full max-h-[540px] bg-black" />
            ) : (
              <div className="grid aspect-video place-items-center text-sm text-muted-foreground">
                Your video is being finalised — hit Retry if you don't see it.
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{plan.title}</h2>
              <p className="text-xs text-muted-foreground">{fmt.label} · {fmt.aspect} · {plan.duration_sec}s</p>
            </div>
            <Button onClick={download} disabled={!videoUrl} className="w-full gap-2">
              <Download className="h-4 w-4" /> Download MP4
            </Button>
            <Button onClick={downloadThumb} disabled={!sceneImages[0]} variant="outline" className="w-full gap-2">
              <Download className="h-4 w-4" /> Download thumbnail
            </Button>
            <Button onClick={onRerender} variant="ghost" className="w-full gap-2">
              <RotateCcw className="h-4 w-4" /> Re-render with same plan
            </Button>
            <Link to="/videos" className="block">
              <Button variant="outline" className="w-full gap-2">
                <Play className="h-4 w-4" /> View in Projects
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <CopyBlock label="Caption" value={plan.caption} onCopy={copy} />
        <CopyBlock label="Title" value={plan.title} onCopy={copy} />
        <CopyBlock label="Description" value={plan.description} onCopy={copy} />
        <CopyBlock label="Hashtags" value={plan.hashtags.join(" ")} onCopy={copy} />
      </div>

      <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
        {plan.scenes.map((s, i) => {
          const img = sceneImages[i];
          return (
            <div key={i} className="overflow-hidden rounded-lg border border-border bg-white/5 aspect-video">
              {img ? <img src={img} alt={`Scene ${s.n}`} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[10px] text-muted-foreground">Scene {s.n}</div>}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="ghost" onClick={onBack} className="gap-2"><ChevronLeft className="h-4 w-4" /> Edit plan</Button>
        <Button variant="ghost" onClick={onReset} className="gap-2 text-muted-foreground"><Trash2 className="h-4 w-4" /> Start over</Button>
      </div>
    </div>
  );
}

function CopyBlock({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string, l: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-secondary p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onCopy(value, label)}>
          <Copy className="h-3 w-3" /> Copy
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm text-white/90">{value}</p>
    </div>
  );
}
