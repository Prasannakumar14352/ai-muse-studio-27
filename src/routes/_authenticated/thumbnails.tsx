import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { toPng, toJpeg } from "html-to-image";
import {
  Loader2, Wand2, Download, RefreshCw, Trash2, Sparkles,
  Image as ImageIcon, Eye, ChevronDown, ChevronRight, Copy,
  Upload, Maximize2, Eraser, Scissors, X, Palette as PaletteIcon,
  Sliders, BarChart3, Rocket, ArrowLeft, Wand,
} from "lucide-react";
import { useAccess, canGenerate } from "@/lib/access";
import { useQueryClient } from "@tanstack/react-query";
import { fetchGeneratedImage } from "@/lib/image-stream";
import {
  saveGeneratedThumbnail, getGeneratedThumbnails, deleteGeneratedThumbnail,
  loadThumbnailImageURL, type LocalThumbnail,
} from "@/lib/thumbnailLocalStore";
import {
  PLATFORMS, ASPECT_RATIOS, EXTENDED_STYLES, SUBJECTS, EXPRESSIONS,
  BACKGROUNDS, LIGHTINGS, PALETTES, CTR_OPTIONS, QUALITIES,
  defaultBrief,
  type ThumbnailBrief, type PlannedBrief, type ThumbnailQualityReport,
  type ConceptCount, type AspectRatioId, CONCEPT_COUNTS,
} from "@/lib/thumbnail-presets";
import {
  THUMBNAIL_FORMATS, getFormat, formatFromAspectRatio,
  type ThumbnailFormatId,
} from "@/lib/thumbnail-formats";
import {
  planThumbnailBrief, analyzeThumbnailQuality, reverseEngineerThumbnail,
} from "@/lib/thumbnail-planner.functions";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";
import { useAutogen } from "@/lib/use-autogen";
import { composeTextOverlay, needsTextOverlay } from "@/lib/text-overlay";
import { promptDialog } from "@/components/prompt-dialog";

export const Route = createFileRoute("/_authenticated/thumbnails")({
  head: () => ({
    meta: [
      { title: "AI Thumbnail Studio — CreatorFlow AI" },
      { name: "description", content: "Plan, generate, edit, and export high-CTR thumbnails with a professional 2-step AI workflow." },
    ],
  }),
  component: ThumbnailsPage,
});

type GeneratedItem = {
  id: string;
  image: string;         // data URL
  prompt: string;
  ratio: string;
  createdAt: number;
  quality?: ThumbnailQualityReport;
  /** Clean image without the overlaid text (regional scripts are drawn by the app, not the AI). */
  baseImage?: string;
  /** Text drawn on top of baseImage. */
  overlayText?: string;
};

type Mode = "create" | "reverse";
type Step = 1 | 2 | 3;

/** If the text is in a regional script, draw it with a real font on top of the AI image. */
async function withOverlay(image: string, text: string | undefined, force = false): Promise<Pick<GeneratedItem, "image" | "baseImage" | "overlayText">> {
  if (!text || (!force && !needsTextOverlay(text))) return { image };
  try {
    return { image: await composeTextOverlay(image, text), baseImage: image, overlayText: text };
  } catch (e) {
    console.warn("text overlay failed", e);
    return { image };
  }
}

function ThumbnailsPage() {
  const [handoff, setHandoff] = useState<ResearchPrefill | null>(() => consumeResearchPrefill("thumbnail"));
  const [mode, setMode] = useState<Mode>("create");
  const [step, setStep] = useState<Step>(1);
  const [brief, setBrief] = useState<ThumbnailBrief>(() => {
    const b = defaultBrief();
    if (handoff) {
      if (handoff.topic) b.title = handoff.topic;
      if (handoff.angle) b.prompt = handoff.angle;
      if (handoff.thumbnailText) { b.textMode = "custom"; b.customText = handoff.thumbnailText; }
      if (handoff.aspectRatio && (["16:9","9:16","4:5","1:1","3:4","2:3"] as string[]).includes(handoff.aspectRatio)) {
        b.aspectRatio = handoff.aspectRatio as typeof b.aspectRatio;
      }
      if (handoff.subject) b.customSubject = handoff.subject;
    }
    return b;
  });
  const [plan, setPlan] = useState<PlannedBrief | null>(null);
  const [planning, setPlanning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [items, setItems] = useState<GeneratedItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [library, setLibrary] = useState<LocalThumbnail[]>([]);
  const [libraryUrls, setLibraryUrls] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const qc = useQueryClient();
  const { data: access } = useAccess();

  useEffect(() => { void refreshLibrary(); }, []);
  async function refreshLibrary() {
    const t = await getGeneratedThumbnails();
    setLibrary(t);
    const urls: Record<string, string> = {};
    for (const x of t) { const u = await loadThumbnailImageURL(x); if (u) urls[x.id] = u; }
    setLibraryUrls(urls);
  }

  const selectedItem = useMemo(() => items.find((x) => x.id === selectedId) ?? null, [items, selectedId]);

  // Auto-sync aspect ratio to platform default when platform changes and ratio still matches previous default.
  function updateBrief<K extends keyof ThumbnailBrief>(key: K, value: ThumbnailBrief[K]) {
    setBrief((b) => {
      const next = { ...b, [key]: value };
      if (key === "platform") {
        const p = PLATFORMS.find((x) => x.id === value);
        if (p) next.aspectRatio = p.defaultRatio;
      }
      return next;
    });
  }

  async function runPlanning() {
    if (!brief.title.trim() && !brief.prompt.trim()) {
      toast.error("Enter a video title or prompt"); return;
    }
    setPlanning(true);
    try {
      const p = await planThumbnailBrief({ data: { brief } });
      setPlan(p);
      setStep(2);
      toast.success("AI plan ready — review and edit before generating");
    } catch (e) {
      console.warn(e);
      toast.error("Couldn't generate plan");
    } finally {
      setPlanning(false);
    }
  }

  // Auto-run pipeline when arriving via "Generate Thumbnail Now" from Research:
  // step 1 → planning → step 2 → generation → step 3.
  useAutogen(handoff, async () => {
    if (!brief.title.trim() && !brief.prompt.trim()) return;
    toast.message("Generation started", { description: "Auto-planning + generating from Viral Research…" });
    await runPlanning();
    // runPlanning sets `plan`; wait a tick for state to commit before firing gen.
    setTimeout(() => { void runGeneration(); }, 400);
  });

  async function runGeneration() {
    if (!plan) return;
    const count = CONCEPT_COUNTS.includes(brief.conceptCount) ? brief.conceptCount : 4;
    // Matches server pricing in /api/generate-image: HD (Ultra) 6, otherwise 1.
    const costPer = QUALITIES.find((x) => x.id === brief.quality)?.imageQuality === "high" ? 6 : 1;
    if (access && !canGenerate(access, count * costPer)) {
      toast.error(`Not enough credits (~${count * costPer} required)`); return;
    }
    setGenerating(true);
    setStep(3);
    setItems([]);
    setProgress({ done: 0, total: count });
    const q = QUALITIES.find((x) => x.id === brief.quality)!;
    const format = getFormat(formatFromAspectRatio(brief.aspectRatio, brief.platform));

    for (let i = 0; i < count; i++) {
      const seedTag = ` [variation ${i + 1}/${count}]`;
      const positive = `${plan.positivePrompt}\nAvoid: ${plan.negativePrompt}${seedTag}`;
      try {
        const { image, error } = await fetchGeneratedImage({
          prompt: positive,
          ratio: format.generatorRatio,
          background: "opaque",
          quality: q.imageQuality,
          image: brief.subjectImage,
          referenceImages: brief.referenceImages,
        });
        if (image) {
          const item: GeneratedItem = {
            id: crypto.randomUUID(),
            ...(await withOverlay(image, plan.thumbnailText || brief.customText, plan.textOverlay)),
            prompt: positive,
            ratio: format.ratio,
            createdAt: Date.now(),
          };
          setItems((prev) => [...prev, item]);
          if (!selectedId) setSelectedId(item.id);
        } else if (error) {
          toast.error(`Concept ${i + 1}: ${error}`);
        }
      } catch (e) {
        console.warn(e);
      }
      setProgress({ done: i + 1, total: count });
    }
    qc.invalidateQueries({ queryKey: ["access"] });
    setGenerating(false);
    toast.success(`Generated ${count} ${count === 1 ? "concept" : "concepts"}`);
  }

  async function regenerateItem(item: GeneratedItem) {
    const { image, error } = await fetchGeneratedImage({
      prompt: item.prompt + " [reroll]",
      ratio: (item.ratio === "16:9" || item.ratio === "9:16" || item.ratio === "1:1" ? item.ratio : "1:1"),
      background: "opaque",
      quality: QUALITIES.find((x) => x.id === brief.quality)!.imageQuality,
    });
    if (image) {
      const next = await withOverlay(image, item.overlayText, !!item.baseImage);
      setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, ...next, quality: undefined } : x));
      qc.invalidateQueries({ queryKey: ["access"] });
      toast.success("Regenerated");
    } else {
      toast.error(error ?? "Regenerate failed");
    }
  }

  async function editItem(item: GeneratedItem, instruction: string, label: string, newText?: string) {
    // Regional-script text is drawn by the app: replacing it is a local redraw (free, always spelled right).
    if (newText !== undefined && (needsTextOverlay(newText) || item.baseImage)) {
      let base = item.baseImage;
      if (!base) {
        // Text was drawn by the AI into this image: erase it first so the new text isn't layered over garbled letters.
        toast.loading("Removing old text…", { id: `edit-${item.id}` });
        const cleaned = await fetchGeneratedImage({
          prompt: "Remove ALL text, letters, numbers, captions and logos from this image. Fill those areas seamlessly with the surrounding background. Change nothing else.",
          image: item.image,
          ratio: (item.ratio === "16:9" || item.ratio === "9:16" || item.ratio === "1:1" ? item.ratio : "1:1"),
          background: "opaque",
          quality: "high",
        });
        toast.dismiss(`edit-${item.id}`);
        if (!cleaned.image) {
          toast.error(cleaned.error ?? "Could not remove the old text");
          return;
        }
        base = cleaned.image;
        qc.invalidateQueries({ queryKey: ["access"] });
      }
      const next = needsTextOverlay(newText)
        ? await withOverlay(base, newText)
        : { image: await composeTextOverlay(base, newText), baseImage: base, overlayText: newText };
      setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, ...next, quality: undefined } : x));
      toast.success("Text updated");
      return;
    }
    toast.loading(`${label}…`, { id: `edit-${item.id}` });
    const { image, error } = await fetchGeneratedImage({
      prompt: instruction,
      // Edit the clean image so the AI doesn't garble overlaid regional text; redraw it after.
      image: item.baseImage ?? item.image,
      ratio: (item.ratio === "16:9" || item.ratio === "9:16" || item.ratio === "1:1" ? item.ratio : "1:1"),
      background: "opaque",
      quality: "high",
    });
    toast.dismiss(`edit-${item.id}`);
    if (image) {
      const next = await withOverlay(image, item.overlayText, !!item.baseImage);
      setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, ...next, quality: undefined } : x));
      qc.invalidateQueries({ queryKey: ["access"] });
      toast.success(`${label} done`);
    } else {
      toast.error(error ?? `${label} failed`);
    }
  }

  function duplicateItem(item: GeneratedItem) {
    const copy: GeneratedItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now(), quality: undefined };
    setItems((prev) => [...prev, copy]);
    toast.success("Duplicated");
  }

  function removeItem(item: GeneratedItem) {
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    if (selectedId === item.id) setSelectedId(null);
  }

  async function analyzeItem(item: GeneratedItem) {
    toast.loading("Analyzing…", { id: `q-${item.id}` });
    try {
      const q = await analyzeThumbnailQuality({ data: {
        imageDataUrl: item.image, title: brief.title, text: plan?.thumbnailText ?? brief.customText,
      }});
      setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, quality: q } : x));
      toast.success("Quality analyzed", { id: `q-${item.id}` });
    } catch (e) {
      console.warn(e);
      toast.error("Analyze failed", { id: `q-${item.id}` });
    }
  }

  async function download(item: GeneratedItem, fmt: "png" | "jpg" | "webp") {
    // Render into an offscreen canvas at the FORMAT's target output size.
    const format = getFormat(formatFromAspectRatio(brief.aspectRatio, brief.platform));
    const img = new Image();
    img.src = item.image;
    await new Promise((r) => { img.onload = r; img.onerror = r; });
    const canvas = document.createElement("canvas");
    canvas.width = format.outputWidth;
    canvas.height = format.outputHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const mime = fmt === "jpg" ? "image/jpeg" : fmt === "webp" ? "image/webp" : "image/png";
    const url = canvas.toDataURL(mime, 0.95);
    const a = document.createElement("a");
    a.href = url;
    a.download = `thumbnail-${format.shortLabel.toLowerCase()}-${item.id.slice(0, 8)}.${fmt}`;
    a.click();
    toast.success(`Downloaded ${fmt.toUpperCase()} (${canvas.width}×${canvas.height})`);
    // silence unused import
    void toPng; void toJpeg;
  }

  async function saveItemToLibrary(item: GeneratedItem) {
    try {
      await saveGeneratedThumbnail({
        title: brief.title || "Untitled",
        concept: plan?.thumbnailText ?? "Concept",
        headline: plan?.thumbnailText ?? brief.customText ?? "",
        niche: null,
        topic: brief.title,
        styleId: brief.styleId,
        styleLabel: EXTENDED_STYLES.find((s) => s.id === brief.styleId)?.label ?? brief.styleId,
        image: item.image,
      });
      await refreshLibrary();
      toast.success("Saved to library");
    } catch (e) {
      console.warn(e); toast.error("Save failed");
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">
            AI <span className="gradient-text">Thumbnail Studio</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Plan, generate, edit and export professional high-CTR thumbnails for every platform.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMode("create")}
            className={`px-3 py-1.5 rounded-lg text-sm ${mode === "create" ? "gradient-primary text-white" : "glass border border-border"}`}>
            Create
          </button>
          <button onClick={() => setMode("reverse")}
            className={`px-3 py-1.5 rounded-lg text-sm ${mode === "reverse" ? "gradient-primary text-white" : "glass border border-border"}`}>
            Reverse Engineer
          </button>
        </div>
      </div>

      {mode === "create" && (
        <StepIndicator step={step} onStep={(s) => { if (s < step) setStep(s); }} />
      )}

      {mode === "create" && step === 1 && (
        <PlanningWizard brief={brief} update={updateBrief} onNext={runPlanning} planning={planning} />
      )}

      {mode === "create" && step === 2 && plan && (
        <PlanReview plan={plan} setPlan={setPlan} brief={brief} onBack={() => setStep(1)} onGenerate={runGeneration} />
      )}

      {mode === "create" && step === 3 && (
        <GenerationGrid
          items={items} selectedId={selectedId} setSelectedId={setSelectedId}
          progress={progress} generating={generating}
          onRegenerate={regenerateItem} onDuplicate={duplicateItem} onRemove={removeItem}
          onAnalyze={analyzeItem} onDownload={download} onSave={saveItemToLibrary}
          onEdit={editItem} onBack={() => setStep(2)}
          selectedItem={selectedItem}
        />
      )}

      {mode === "reverse" && (
        <ReverseEngineerPanel onUseBrief={(b) => { setBrief(b); setMode("create"); setStep(1); toast.success("Brief loaded — review & plan"); }} />
      )}

      {/* Library */}
      {library.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <ImageIcon className="w-4 h-4" /> Your saved thumbnails
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {library.map((t) => (
              <div key={t.id} className="glass rounded-xl overflow-hidden">
                <div className="aspect-video bg-black">
                  {libraryUrls[t.id] && <img src={libraryUrls[t.id]} alt={t.headline} className="w-full h-full object-cover" />}
                </div>
                <div className="p-3">
                  <div className="text-xs font-semibold line-clamp-1">{t.title || t.headline}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">{t.styleLabel}</div>
                  <div className="mt-2 flex gap-1.5">
                    {libraryUrls[t.id] && (
                      <a href={libraryUrls[t.id]} download={`thumbnail-${t.id}.${t.extension}`}
                        className="flex-1 rounded-lg gradient-primary text-white py-1.5 text-xs flex items-center justify-center gap-1">
                        <Download className="w-3 h-3" /> Download
                      </a>
                    )}
                    <button aria-label="Delete" onClick={async () => { await deleteGeneratedThumbnail(t.id); await refreshLibrary(); }}
                      className="rounded-lg glass border border-border hover:bg-rose-500/20 text-rose-300 py-1.5 px-2 text-xs">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Step indicator ---------- */

function StepIndicator({ step, onStep }: { step: Step; onStep: (s: Step) => void }) {
  const steps = [
    { n: 1 as const, label: "Plan" },
    { n: 2 as const, label: "AI Brief" },
    { n: 3 as const, label: "Generate" },
  ];
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <button onClick={() => onStep(s.n)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs transition ${
              step === s.n ? "gradient-primary text-white" : step > s.n ? "glass border border-border" : "glass border border-border opacity-50"
            }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step >= s.n ? "bg-white/20" : "bg-white/10"}`}>{s.n}</span>
            {s.label}
          </button>
          {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

/* ---------- Step 1: Planning wizard ---------- */

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass rounded-2xl border border-border overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-white/5">
        <div className="flex items-center gap-2 text-sm font-semibold"><Icon className="w-4 h-4 text-primary" /> {title}</div>
        <ChevronDown className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="p-4 pt-0 space-y-3">{children}</div>}
    </div>
  );
}

function Chips<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string; hint?: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} title={o.hint}
          className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
            value === o.id ? "gradient-primary text-white border-transparent" : "glass border-border hover:border-white/20"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PlanningWizard({ brief, update, onNext, planning }: {
  brief: ThumbnailBrief;
  update: <K extends keyof ThumbnailBrief>(k: K, v: ThumbnailBrief[K]) => void;
  onNext: () => void; planning: boolean;
}) {
  const activeFormatId = formatFromAspectRatio(brief.aspectRatio, brief.platform);
  function selectFormat(id: ThumbnailFormatId) {
    const f = getFormat(id);
    // Sync aspect ratio + platform to the chosen format.
    update("aspectRatio", f.generatorRatio as AspectRatioId);
    // Best-effort platform sync (optional, purely cosmetic for chips below).
    if (id === "youtube_shorts_9_16") update("platform", "youtube_shorts");
    else if (id === "youtube_16_9")   update("platform", "youtube");
    else if (id === "instagram_1_1")  update("platform", "instagram");
    else if (id === "facebook_1_91_1")update("platform", "facebook");
    else if (id === "linkedin_1_91_1")update("platform", "linkedin");
    else if (id === "pinterest_2_3")  update("platform", "pinterest");
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="lg:col-span-2">
        <FormatSelector activeId={activeFormatId} onSelect={selectFormat} />
      </div>

      <Section title="Video & Prompt" icon={Wand}>
        <label className="block text-xs text-muted-foreground">Video title / topic</label>
        <input value={brief.title} onChange={(e) => update("title", e.target.value)}
          placeholder="e.g. The Last Human Employee"
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
        <label className="block text-xs text-muted-foreground">Thumbnail prompt (optional)</label>
        <textarea rows={3} value={brief.prompt} onChange={(e) => update("prompt", e.target.value)}
          placeholder="Extra creative direction (optional)"
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
      </Section>

      <Section title="More platforms & aspect ratios" icon={Sliders} defaultOpen={false}>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Platform</div>
          <Chips options={PLATFORMS} value={brief.platform} onChange={(v) => update("platform", v)} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Aspect ratio</div>
          <Chips options={ASPECT_RATIOS} value={brief.aspectRatio} onChange={(v) => update("aspectRatio", v as AspectRatioId)} />
        </div>
        {brief.aspectRatio === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={brief.customWidth ?? 1280} onChange={(e) => update("customWidth", Number(e.target.value))}
              className="bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" placeholder="Width" />
            <input type="number" value={brief.customHeight ?? 720} onChange={(e) => update("customHeight", Number(e.target.value))}
              className="bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" placeholder="Height" />
          </div>
        )}
      </Section>

      <Section title="Primary subject image (optional)" icon={Upload} defaultOpen={false}>
        <p className="text-[11px] text-muted-foreground">
          Upload a face/subject to preserve identity exactly. Additional images below act as
          object / environment references only.
        </p>
        <SubjectUploader
          value={brief.subjectImage}
          onChange={(v) => update("subjectImage", v)}
        />
        <ReferenceUploader
          value={brief.referenceImages ?? []}
          onChange={(v) => update("referenceImages", v)}
        />
      </Section>

      <Section title="AI Optimizer overrides (optional)" icon={Wand2} defaultOpen={false}>
        <p className="text-[11px] text-muted-foreground">
          Leave blank to let the AI Thumbnail Optimizer infer these automatically for your niche.
        </p>
        <input value={brief.overrideSubjectAction ?? ""} onChange={(e) => update("overrideSubjectAction", e.target.value)}
          placeholder="Subject action / pose (auto if empty)"
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
        <input value={brief.overrideBackground ?? ""} onChange={(e) => update("overrideBackground", e.target.value)}
          placeholder="Background description (auto if empty)"
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
        <input value={brief.overrideCameraAngle ?? ""} onChange={(e) => update("overrideCameraAngle", e.target.value)}
          placeholder="Camera angle (auto if empty)"
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
      </Section>


      <Section title="Style" icon={PaletteIcon}>
        <Chips options={EXTENDED_STYLES.map((s) => ({ id: s.id, label: s.label, hint: s.hint }))}
          value={brief.styleId} onChange={(v) => update("styleId", v)} />
      </Section>

      <Section title="Text Overlay" icon={Sparkles}>
        <Chips options={[
          { id: "auto", label: "Auto (AI writes)" },
          { id: "custom", label: "Custom" },
          { id: "none", label: "None" },
        ]} value={brief.textMode} onChange={(v) => update("textMode", v)} />
        {brief.textMode === "custom" && (
          <input value={brief.customText} onChange={(e) => update("customText", e.target.value.toUpperCase().slice(0, 40))}
            placeholder="LIKE THIS"
            className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
        )}
      </Section>

      <Section title="Main Subject & Expression" icon={Wand}>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Subject</div>
          <Chips options={SUBJECTS} value={brief.subjectId} onChange={(v) => update("subjectId", v)} />
        </div>
        {brief.subjectId === "custom" && (
          <input value={brief.customSubject} onChange={(e) => update("customSubject", e.target.value)}
            placeholder="Describe subject"
            className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
        )}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Face expression</div>
          <Chips options={EXPRESSIONS} value={brief.expression} onChange={(v) => update("expression", v)} />
        </div>
      </Section>

      <Section title="Background & Lighting" icon={PaletteIcon}>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Background</div>
          <Chips options={BACKGROUNDS} value={brief.background} onChange={(v) => update("background", v)} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Lighting</div>
          <Chips options={LIGHTINGS} value={brief.lighting} onChange={(v) => update("lighting", v)} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Color palette</div>
          <Chips options={PALETTES} value={brief.palette} onChange={(v) => update("palette", v)} />
        </div>
      </Section>

      <Section title="CTR Optimization" icon={Rocket}>
        <div className="grid grid-cols-2 gap-1.5">
          {CTR_OPTIONS.map((o) => {
            const on = brief.ctrOptions.includes(o.id);
            return (
              <label key={o.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer ${on ? "border-primary/60 bg-primary/10" : "glass border-border"}`}>
                <input type="checkbox" checked={on} onChange={(e) => {
                  update("ctrOptions", e.target.checked
                    ? [...brief.ctrOptions, o.id]
                    : brief.ctrOptions.filter((x) => x !== o.id));
                }} className="accent-[color:var(--neon-purple)]" />
                {o.label}
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Brand Kit" icon={PaletteIcon} defaultOpen={false}>
        {(["useLogo", "useColors", "useFont", "useWatermark"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={brief.brand[k]} onChange={(e) => update("brand", { ...brief.brand, [k]: e.target.checked })}
              className="accent-[color:var(--neon-purple)]" />
            {k === "useLogo" ? "Apply logo" : k === "useColors" ? "Apply brand colors" : k === "useFont" ? "Use brand font" : "Add watermark"}
          </label>
        ))}
      </Section>

      <Section title="Concepts & Quality" icon={Sliders}>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Number of concepts</div>
          <div className="flex gap-1.5">
            {CONCEPT_COUNTS.map((n) => (
              <button key={n} onClick={() => update("conceptCount", n as ConceptCount)}
                className={`px-3 py-1 rounded-full text-xs border ${brief.conceptCount === n ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Quality</div>
          <Chips options={QUALITIES} value={brief.quality} onChange={(v) => update("quality", v)} />
        </div>
      </Section>

      <div className="lg:col-span-2 flex justify-end">
        <button onClick={onNext} disabled={planning}
          className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-40">
          {planning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {planning ? "Planning…" : "Generate AI plan"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Step 2: AI Plan review ---------- */

function PlanReview({ plan, setPlan, brief, onBack, onGenerate }: {
  plan: PlannedBrief; setPlan: (p: PlannedBrief) => void; brief: ThumbnailBrief;
  onBack: () => void; onGenerate: () => void;
}) {
  function field<K extends keyof PlannedBrief>(k: K, v: PlannedBrief[K]) { setPlan({ ...plan, [k]: v }); }
  return (
    <div className="glass rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI Plan — review & edit before generating</div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-white flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to planning</button>
      </div>

      <PlanField label="Scene description" value={plan.sceneDescription} onChange={(v) => field("sceneDescription", v)} />
      <PlanField label="Positive prompt (image gen)" value={plan.positivePrompt} onChange={(v) => field("positivePrompt", v)} rows={4} />
      <PlanField label="Negative prompt (avoid)" value={plan.negativePrompt} onChange={(v) => field("negativePrompt", v)} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PlanField label="Thumbnail text" value={plan.thumbnailText} onChange={(v) => field("thumbnailText", v.toUpperCase().slice(0, 40))} />
        <PlanField label="Composition" value={plan.composition} onChange={(v) => field("composition", v)} />
        <PlanField label="Camera angle" value={plan.cameraAngle} onChange={(v) => field("cameraAngle", v)} />
        <PlanField label="Lighting" value={plan.lighting} onChange={(v) => field("lighting", v)} />
        <PlanField label="Color palette" value={plan.colorPalette} onChange={(v) => field("colorPalette", v)} />
      </div>

      {plan.ctrTips.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">CTR tips</div>
          <ul className="space-y-1">
            {plan.ctrTips.map((t, i) => (
              <li key={i} className="text-xs flex items-start gap-2"><Rocket className="w-3 h-3 mt-0.5 text-primary" />{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onGenerate}
          className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)]">
          <Wand2 className="w-4 h-4" /> Generate {brief.conceptCount} {brief.conceptCount === 1 ? "concept" : "concepts"}
        </button>
      </div>
    </div>
  );
}

function PlanField({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {rows ? (
        <textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm" />
      )}
    </div>
  );
}

/* ---------- Step 3: Generation grid ---------- */

function GenerationGrid(props: {
  items: GeneratedItem[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  progress: { done: number; total: number };
  generating: boolean;
  onRegenerate: (item: GeneratedItem) => void;
  onDuplicate: (item: GeneratedItem) => void;
  onRemove: (item: GeneratedItem) => void;
  onAnalyze: (item: GeneratedItem) => void;
  onDownload: (item: GeneratedItem, fmt: "png" | "jpg" | "webp") => void;
  onSave: (item: GeneratedItem) => void;
  onEdit: (item: GeneratedItem, instruction: string, label: string, newText?: string) => void;
  onBack: () => void;
  selectedItem: GeneratedItem | null;
}) {
  const { items, selectedId, setSelectedId, progress, generating, selectedItem } = props;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={props.onBack} className="text-xs text-muted-foreground hover:text-white flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Back to plan</button>
        {generating && (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Generating {progress.done}/{progress.total}…
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((it) => (
          <button key={it.id} onClick={() => setSelectedId(it.id)}
            className={`text-left glass rounded-xl overflow-hidden border transition ${
              selectedId === it.id ? "border-[color:var(--neon-purple)] ring-2 ring-[color:var(--neon-purple)]/40" : "border-border hover:border-white/20"
            }`}>
            <div className="aspect-video bg-black">
              <img src={it.image} alt="concept" className="w-full h-full object-cover" />
            </div>
            <div className="p-2 flex items-center justify-between">
              <div className="text-[11px] text-muted-foreground">
                {it.quality ? `CTR ${it.quality.ctrScore}` : "Not analyzed"}
              </div>
              <div className="flex gap-1">
                <button onClick={(e) => { e.stopPropagation(); props.onRegenerate(it); }} className="p-1 hover:text-white text-muted-foreground" title="Regenerate">
                  <RefreshCw className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); props.onDuplicate(it); }} className="p-1 hover:text-white text-muted-foreground" title="Duplicate">
                  <Copy className="w-3 h-3" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); props.onRemove(it); }} className="p-1 hover:text-rose-300 text-muted-foreground" title="Remove">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </button>
        ))}
        {generating && Array.from({ length: Math.max(0, progress.total - items.length) }).map((_, i) => (
          <div key={`sk-${i}`} className="aspect-video glass rounded-xl border border-border flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ))}
      </div>

      {selectedItem && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="glass rounded-2xl border border-border p-4 space-y-3">
            <div className="rounded-xl overflow-hidden bg-black">
              <img src={selectedItem.image} alt="selected" className="w-full h-auto" />
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={Maximize2} label="Upscale"
                onClick={() => props.onEdit(selectedItem, "Upscale this thumbnail to higher resolution, add sharpness and clarity, preserve all details.", "Upscale")} />
              <ActionButton icon={Scissors} label="Remove BG"
                onClick={() => props.onEdit(selectedItem, "Remove the background entirely, keep only the main subject with clean edges on a transparent-looking white background.", "Remove background")} />
              <ActionButton icon={Eraser} label="Magic Eraser"
                onClick={() => props.onEdit(selectedItem, "Clean up the image: remove small distracting background objects, clutter and stray marks. Keep every person, face and the main subject exactly the same. Fill removed areas naturally to match the surroundings.", "Magic eraser")} />
              <ActionButton icon={Wand} label="Replace Subject"
                onClick={async () => { const v = await promptDialog({ title: "Replace subject", description: "Describe who or what should be the main subject.", placeholder: "e.g. a young woman in a red saree, amazed expression", multiline: true, confirmText: "Replace subject" }); if (v) props.onEdit(selectedItem, `Replace the main subject with: ${v}. Match lighting and composition.`, "Replace subject"); }} />
              <ActionButton icon={Wand} label="Replace Face"
                onClick={async () => { const v = await promptDialog({ title: "Replace face", description: "Describe the new face or expression.", placeholder: "e.g. shocked, mouth open, wide eyes", suggestions: ["Shocked", "Excited", "Curious", "Scared", "Laughing"], confirmText: "Replace face" }); if (v) props.onEdit(selectedItem, `Replace only the face with: ${v}. Preserve everything else.`, "Replace face"); }} />
              <ActionButton icon={Wand} label="Replace Text"
                onClick={async () => { const v = await promptDialog({ title: "Replace text", description: "Type the thumbnail text in any language.", placeholder: "e.g. 2100లో THEATRE / ఇలా ఉంటుందా?", defaultValue: selectedItem.overlayText ?? "", hint: selectedItem.baseImage ? "Use \" / \" to split into a top and bottom line. Drawn with a proper font for any language — instant and free." : "Use \" / \" to split into a top and bottom line. The old AI-drawn text is erased first (one HD edit, 6 credits), then your text is drawn with a proper font.", confirmText: "Update text" }); if (v) props.onEdit(selectedItem, `Replace the overlay text with "${v.toUpperCase()}" in the same style.`, "Replace text", v.toUpperCase()); }} />
              <ActionButton icon={Wand} label="Replace BG"
                onClick={async () => { const v = await promptDialog({ title: "Replace background", description: "Describe the new background.", placeholder: "e.g. neon city street at night, rain reflections", multiline: true, confirmText: "Replace background" }); if (v) props.onEdit(selectedItem, `Replace only the background with: ${v}. Keep subject and text intact.`, "Replace background"); }} />
              <ActionButton icon={BarChart3} label="Analyze" onClick={() => props.onAnalyze(selectedItem)} />
              <ActionButton icon={Copy} label="Save to library" onClick={() => props.onSave(selectedItem)} />
              <ActionButton icon={Download} label="PNG" onClick={() => props.onDownload(selectedItem, "png")} primary />
              <ActionButton icon={Download} label="JPG" onClick={() => props.onDownload(selectedItem, "jpg")} />
              <ActionButton icon={Download} label="WebP" onClick={() => props.onDownload(selectedItem, "webp")} />
            </div>
          </div>
          <div className="glass rounded-2xl border border-border p-4 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <BarChart3 className="w-3 h-3" /> Quality analysis
            </div>
            {selectedItem.quality ? (
              <div className="space-y-2">
                <ScoreRow label="CTR score"          value={selectedItem.quality.ctrScore} />
                <ScoreRow label="Readability"        value={selectedItem.quality.readability} />
                <ScoreRow label="Contrast"           value={selectedItem.quality.contrast} />
                <ScoreRow label="Mobile visibility"  value={selectedItem.quality.mobileVisibility} />
                <ScoreRow label="Face detection"     value={selectedItem.quality.faceDetection} />
                <ScoreRow label="Text balance"       value={selectedItem.quality.textBalance} />
                <ScoreRow label="Brand consistency"  value={selectedItem.quality.brandConsistency} />
                {selectedItem.quality.notes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {selectedItem.quality.notes.map((n, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                        <Rocket className="w-3 h-3 mt-0.5 text-primary" /> {n}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <button onClick={() => props.onAnalyze(selectedItem)}
                className="w-full rounded-lg glass border border-border py-2 text-xs flex items-center justify-center gap-1">
                <Eye className="w-3 h-3" /> Analyze quality
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, primary = false }: {
  icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; primary?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 ${primary ? "gradient-primary text-white" : "glass border border-border hover:border-white/20"}`}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-1.5 rounded bg-white/10 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* ---------- Reverse engineer ---------- */

function ReverseEngineerPanel({ onUseBrief }: { onUseBrief: (b: ThumbnailBrief) => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof reverseEngineerThumbnail>> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onFile(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { setImage(String(reader.result)); setResult(null); };
    reader.readAsDataURL(f);
  }

  async function analyze() {
    if (!image) return;
    setBusy(true);
    try {
      const r = await reverseEngineerThumbnail({ data: { imageDataUrl: image } });
      setResult(r);
    } catch (e) {
      console.warn(e); toast.error("Reverse-engineer failed");
    } finally { setBusy(false); }
  }

  function useThisStyle() {
    if (!result) return;
    const b = defaultBrief();
    b.prompt = result.prompt;
    onUseBrief(b);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="glass rounded-2xl border border-border p-5 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Upload a thumbnail</div>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="hidden" />
        <button onClick={() => fileRef.current?.click()}
          className="w-full rounded-lg glass border border-dashed border-border py-8 text-sm text-muted-foreground hover:border-white/20 flex flex-col items-center justify-center gap-2">
          <Upload className="w-5 h-5" />
          {image ? "Replace image" : "Click to upload an image"}
        </button>
        {image && (
          <div className="rounded-xl overflow-hidden bg-black">
            <img src={image} alt="uploaded" className="w-full h-auto" />
          </div>
        )}
        <button onClick={analyze} disabled={!image || busy}
          className="w-full rounded-lg gradient-primary text-white py-2 text-sm flex items-center justify-center gap-2 disabled:opacity-40">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? "Analyzing…" : "Analyze image"}
        </button>
      </div>

      <div className="glass rounded-2xl border border-border p-5 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4 text-primary" /> Analysis</div>
        {!result ? (
          <div className="text-xs text-muted-foreground">Upload a thumbnail and click Analyze.</div>
        ) : (
          <>
            <Row label="Style"        value={result.style} />
            <Row label="Composition"  value={result.composition} />
            <Row label="Lighting"     value={result.lighting} />
            <Row label="Camera angle" value={result.cameraAngle} />
            <Row label="Text placement" value={result.textPlacement} />
            {result.colors.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Colors</div>
                <div className="flex gap-1">
                  {result.colors.map((c, i) => (
                    <div key={i} title={c} className="w-8 h-8 rounded border border-white/10" style={{ background: c }} />
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Prompt to recreate</div>
              <textarea readOnly value={result.prompt} rows={4}
                className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-xs font-mono" />
            </div>
            <div className="flex gap-2">
              <button onClick={useThisStyle}
                className="flex-1 rounded-lg gradient-primary text-white py-2 text-xs flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3" /> Use this style
              </button>
              <button aria-label="Copy" onClick={() => { navigator.clipboard.writeText(result.prompt); toast.success("Prompt copied"); }}
                className="rounded-lg glass border border-border py-2 px-3 text-xs">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs">{value}</div>
    </div>
  );
}

/* ---------- Prominent Format selector (extensible) ---------- */

function FormatSelector({ activeId, onSelect }: {
  activeId: ThumbnailFormatId; onSelect: (id: ThumbnailFormatId) => void;
}) {
  const primary = THUMBNAIL_FORMATS.filter((f) => f.primary);
  const secondary = THUMBNAIL_FORMATS.filter((f) => !f.primary);
  return (
    <div className="glass rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sliders className="w-4 h-4 text-primary" /> Choose format
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {primary.map((f) => {
          const active = activeId === f.id;
          return (
            <button key={f.id} onClick={() => onSelect(f.id)}
              className={`text-left rounded-xl border p-4 transition ${
                active
                  ? "border-[color:var(--neon-purple)] bg-primary/10 ring-2 ring-[color:var(--neon-purple)]/40"
                  : "glass border-border hover:border-white/20"
              }`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{f.label}</div>
                <div className="text-[11px] text-muted-foreground">{f.outputWidth}×{f.outputHeight}</div>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{f.description}</div>
              <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Subject ~{f.subjectCoverage}% · {f.mobileOptimized ? "Mobile-optimized" : "Landscape"}
              </div>
            </button>
          );
        })}
      </div>
      <div>
        <div className="text-[11px] text-muted-foreground mb-1.5">Other formats</div>
        <div className="flex flex-wrap gap-1.5">
          {secondary.map((f) => (
            <button key={f.id} onClick={() => onSelect(f.id)}
              title={`${f.outputWidth}×${f.outputHeight}`}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                activeId === f.id ? "gradient-primary text-white border-transparent" : "glass border-border hover:border-white/20"
              }`}>
              {f.shortLabel} · {f.ratio}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Subject / reference image uploaders ---------- */

function SubjectUploader({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  function pick(f: File | null) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => onChange(String(r.result));
    r.readAsDataURL(f);
  }
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      {value ? (
        <div className="flex items-center gap-2">
          <img src={value} alt="subject" className="w-16 h-16 rounded-lg object-cover border border-border" />
          <button onClick={() => ref.current?.click()} className="text-xs glass border border-border rounded-lg px-2 py-1">
            Replace
          </button>
          <button onClick={() => onChange(undefined)} className="text-xs glass border border-border rounded-lg px-2 py-1 text-rose-300">
            Remove
          </button>
        </div>
      ) : (
        <button onClick={() => ref.current?.click()}
          className="w-full rounded-lg glass border border-dashed border-border py-3 text-xs text-muted-foreground hover:border-white/20 flex items-center justify-center gap-2">
          <Upload className="w-4 h-4" /> Upload primary subject (face)
        </button>
      )}
    </div>
  );
}

function ReferenceUploader({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  function pick(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    Promise.all(arr.map((f) => new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(f);
    }))).then((imgs) => onChange([...value, ...imgs].slice(0, 6)));
  }
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => pick(e.target.files)} />
      <div className="flex flex-wrap gap-2">
        {value.map((src, i) => (
          <div key={i} className="relative">
            <img src={src} alt={`ref-${i}`} className="w-14 h-14 rounded-lg object-cover border border-border" />
            <button aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute -top-1 -right-1 bg-rose-500/80 text-white rounded-full p-0.5">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button aria-label="Upload" onClick={() => ref.current?.click()}
          className="w-14 h-14 rounded-lg glass border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-white/20">
          <Upload className="w-4 h-4" />
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground">
        Reference images (objects, environments, context) — not used to alter the subject's face.
      </div>
    </div>
  );
}

