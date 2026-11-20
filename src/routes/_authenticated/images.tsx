import { createFileRoute } from "@tanstack/react-router";
import { PublishButton } from "@/components/publish-actions";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { STYLES } from "@/lib/constants";
import { AS_DESCRIBED_STYLE, promptNeedsHd, detectPromptStyle, styleClashes } from "@/lib/image-prompt-hints";
import { pushImageGenLog, listImageGenLogs } from "@/lib/local-store";
import {
  readPromptHistory,
  pushPromptHistory,
  clearPromptHistory,
  type ImagePromptHistoryEntry,
} from "@/lib/image-prompt-history";

import { useAccess, canGenerate } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import { useProjectDelete } from "@/hooks/use-project-delete";
import {
  Loader2, Wand2, Download, Image as ImageIcon, RefreshCw, Bug, Copy, Trash2, FileDown,
  Maximize2, X, ChevronLeft, ChevronRight, Plus, ArrowLeft, Upload, Sparkles, Scissors,
  Eraser, Expand, PaintBucket, History, ChevronDown,
} from "lucide-react";
import type { GenerateImageRequest } from "@/lib/image-stream";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";
import { useAutogen } from "@/lib/use-autogen";
import { promptDialog } from "@/components/prompt-dialog";

/** Matches ACTION_COSTS.image_hd on the server. */
const HD_CREDITS = 8;

export const Route = createFileRoute("/_authenticated/images")({ component: ImagesPage });

const RATIOS = ["1:1", "9:16", "16:9", "4:5"];
const BATCH_OPTIONS = [1, 2, 4, 8];
const LS_STATE = "creatorflow:images:v4";

type ResultItem = { id: string; prompt: string; style: string; ratio: string; image: string };

type DebugInfo = {
  requestedAt: string;
  durationMs: number;
  request: Record<string, unknown>;
  errors: string[];
  successCount: number;
  failureCount: number;
};

type EditOp = NonNullable<GenerateImageRequest["operation"]>;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

function ImagesPage() {
  const [handoff, setHandoff] = useState<ResearchPrefill | null>(() => consumeResearchPrefill("image"));
  const [prompt, setPrompt] = useState(handoff?.imagePrompt ?? handoff?.topic ?? "");
  const [negativePrompt, setNegativePrompt] = useState(handoff?.negativePrompt ?? "");
  const [style, setStyle] = useState(handoff?.style ?? "cinematic");
  const [quality, setQuality] = useState<"standard" | "hd">("standard");
  const [ratio, setRatio] = useState(handoff?.aspectRatio ?? "1:1");
  const [batch, setBatch] = useState(4);
  const [seed, setSeed] = useState<number | "">("");
  const [cfg, setCfg] = useState(7);
  const [styleStrength, setStyleStrength] = useState(70);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [styleImages, setStyleImages] = useState<string[]>([]);
  // HD (Nano Banana) also runs whenever reference/style images are attached.
  const usesHdModel = quality === "hd" || referenceImages.length > 0 || styleImages.length > 0;
  const perImageCredits = usesHdModel ? HD_CREDITS : 1;
  const hdHint = useMemo(() => promptNeedsHd(prompt), [prompt]);
  const promptStyle = useMemo(() => detectPromptStyle(prompt), [prompt]);
  const styleClash = styleClashes(style, promptStyle?.id ?? null);
  const selectedStyleLabel = STYLES.find((x) => x.id === style)?.label ?? style;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ImagePromptHistoryEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ prompt: string; style: string; ratio: string } | null>(null);
  const [debug, setDebug] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [view, setView] = useState<"landing" | "input">(handoff ? "input" : "landing");
  const qc = useQueryClient();
  const { data: access } = useAccess();

  // Read the session user directly: waiting on useAccess left the first load
  // showing "No images yet" until something else refetched it.
  const { data: results = [], isPending: libraryLoading } = useQuery({
    queryKey: ["images-library"],
    staleTime: 30_000,
    queryFn: async (): Promise<ResultItem[]> => {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user.id;
      if (!userId) throw new Error("Not signed in yet");
      const { data, error } = await supabase
        .from("projects")
        .select("id, topic, style, thumbnail_url, aspect_ratio, created_at")
        .eq("user_id", userId)
        .eq("content_type", "ai_image")
        .not("thumbnail_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? [])
        .filter((r) => !!r.thumbnail_url)
        .map((r) => ({
          id: r.id as string,
          prompt: (r.topic as string) ?? "",
          style: (r.style as string) ?? "cinematic",
          ratio: (r.aspect_ratio as string | null) ?? "1:1",
          image: r.thumbnail_url as string,
        }));
    },
  });

  useEffect(() => {
    if (viewerIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewerIdx(null);
      if (e.key === "ArrowRight") setViewerIdx((i) => (i === null ? i : Math.min(results.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setViewerIdx((i) => (i === null ? i : Math.max(0, i - 1)));
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [viewerIdx, results.length]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_STATE);
      if (raw) {
        const s = JSON.parse(raw) as Partial<{
          prompt: string; negativePrompt: string; style: string; ratio: string;
          batch: number; seed: number | ""; cfg: number; styleStrength: number;
          lastRun: typeof lastRun; debug: DebugInfo | null; quality: "standard" | "hd";
        }>;
        if (s.prompt) setPrompt(s.prompt);
        if (s.negativePrompt) setNegativePrompt(s.negativePrompt);
        if (s.style) setStyle(s.style);
        // quality is not restored: every visit starts on Standard (HD costs more per image).
        if (s.ratio) setRatio(s.ratio);
        if (s.batch) setBatch(s.batch);
        if (s.seed !== undefined) setSeed(s.seed);
        if (typeof s.cfg === "number") setCfg(s.cfg);
        if (typeof s.styleStrength === "number") setStyleStrength(s.styleStrength);
        if (s.lastRun) setLastRun(s.lastRun);
        if (s.debug) setDebug(s.debug);
      }
    } catch { /* ignore */ }
    setHistory(readPromptHistory());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_STATE, JSON.stringify({
        prompt, negativePrompt, style, ratio, batch, seed, cfg, styleStrength, lastRun, debug, quality,
      }));
    } catch { /* ignore */ }
  }, [prompt, negativePrompt, style, ratio, batch, seed, cfg, styleStrength, lastRun, debug, quality, hydrated]);

  async function addUploads(kind: "ref" | "style", files: FileList | null) {
    if (!files || !files.length) return;
    try {
      const urls = await Promise.all(Array.from(files).slice(0, 4).map(fileToDataUrl));
      if (kind === "ref") setReferenceImages((prev) => [...prev, ...urls].slice(0, 4));
      else setStyleImages((prev) => [...prev, ...urls].slice(0, 4));
    } catch {
      toast.error("Could not read image");
    }
  }

  async function runGeneration(p: string, s: string, r: string, count: number) {
    const required = count * perImageCredits;
    if (access && !canGenerate(access, required)) {
      const available = access.unlimited ? Number.POSITIVE_INFINITY : (access.monthlyRemaining + access.balance + access.lifetimeCredits);
      const { fireCreditGate } = await import("@/components/global-credit-gate");
      fireCreditGate({ required, available, shortage: Math.max(0, required - available), planType: access.planType });
      return;
    }
    if (!access?.userId) { toast.error("Sign in required"); return; }

    setLoading(true);
    // "As described" adds no style prefix — the prompt's own style wins.
    const styleLabel = s === AS_DESCRIBED_STYLE ? "" : (STYLES.find((x) => x.id === s)?.label ?? s);
    const startedAt = Date.now();
    const errors: string[] = [];
    const baseReq: GenerateImageRequest = {
      prompt: p,
      style: styleLabel || undefined,
      ratio: r,
      quality: quality === "hd" ? "high" : undefined,
      negativePrompt: negativePrompt.trim() || undefined,
      seed: seed === "" ? undefined : Number(seed),
      cfg,
      styleStrength,
      referenceImages: referenceImages.length ? referenceImages : undefined,
      styleImages: styleImages.length ? styleImages : undefined,
    };

    try {
      const { fetchGeneratedImage } = await import("@/lib/image-stream");
      const settled = await Promise.allSettled(
        Array.from({ length: count }).map(async (_, i) => {
          const req: GenerateImageRequest = { ...baseReq };
          // Vary seed per-item when a base seed is supplied so batch items differ.
          if (typeof req.seed === "number") req.seed = req.seed + i;
          const { image, error, status } = await fetchGeneratedImage(req);
          if (!image) throw new Error(error || `HTTP ${status}`);
          return { image };
        }),
      );

      const ok: { image: string }[] = [];
      settled.forEach((x) => {
        if (x.status === "fulfilled") ok.push(x.value);
        else errors.push(x.reason instanceof Error ? x.reason.message : String(x.reason));
      });

      if (ok.length) {
        setLastRun({ prompt: p, style: s, ratio: r });
        setView("landing");
        pushPromptHistory({
          prompt: p, negativePrompt: baseReq.negativePrompt, style: s, ratio: r,
          seed: baseReq.seed, cfg, styleStrength, batch: count,
        });
        setHistory(readPromptHistory());
        const title = p.trim().slice(0, 80) || `AI image (${styleLabel || "custom"})`;
        const rows = ok.map((res) => ({
          user_id: access.userId, title, content_type: "ai_image",
          topic: p, style: s, status: "generated", thumbnail_url: res.image, aspect_ratio: r,
        }));
        // Keep a copy in the Media Library (account storage), not just here.
        void import("@/lib/save-to-library").then(({ saveUrlToLibrary }) => Promise.all(ok.map((res) =>
          saveUrlToLibrary({ url: res.image, kind: "image", title, tags: ["image", r], metadata: { ratio: r, style: s } })
            .catch((e) => console.warn("[library] image save failed", e)))));
        const { error: pErr } = await supabase.from("projects").insert(rows);
        if (pErr) toast.error("Saved images could not be persisted");
        qc.invalidateQueries({ queryKey: ["images-library"] });
        qc.invalidateQueries({ queryKey: ["projects-section"] });
        qc.invalidateQueries({ queryKey: ["recent-projects"] });
        qc.invalidateQueries({ queryKey: ["module-counts"] });
        qc.invalidateQueries({ queryKey: ["access"] });
        toast.success(`Generated ${ok.length} of ${count} concepts`);
      } else {
        toast.error(errors[0] || "Generation failed");
      }

      const info: DebugInfo = {
        requestedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        request: { ...baseReq, referenceImages: baseReq.referenceImages?.length, styleImages: baseReq.styleImages?.length, batch: count },
        errors, successCount: ok.length, failureCount: errors.length,
      };
      setDebug(info);
      await pushImageGenLog({
        prompt: p, style: s, ratio: r,
        full_prompt: `${styleLabel ? `${styleLabel} style. ` : ""}${p}`,
        request: info.request as Record<string, unknown>,
        response: {},
        errors: info.errors, success_count: info.successCount,
        failure_count: info.failureCount, duration_ms: info.durationMs,
      });
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    if (!prompt.trim()) return toast.error("Enter a prompt");
    await runGeneration(prompt, style, ratio, batch);
  }

  useAutogen(handoff, () => {
    if (prompt.trim()) {
      toast.message("Generation started", { description: "Auto-generating from Viral Research…" });
      void generate();
    }
  });

  async function regenerateExact() {
    if (!lastRun) return toast.error("Generate an image first");
    await runGeneration(lastRun.prompt, lastRun.style, lastRun.ratio, batch);
  }

  async function editExisting(row: ResultItem, op: EditOp, opts?: { maskHint?: string; direction?: GenerateImageRequest["outpaintDirection"] }) {
    if (!access?.userId) return toast.error("Sign in required");
    if (access && !canGenerate(access, 1)) return toast.error("Not enough credits");
    setEditingId(row.id);
    try {
      const { fetchGeneratedImage } = await import("@/lib/image-stream");
      const { image, error } = await fetchGeneratedImage({
        prompt: row.prompt || "edit this image",
        style: STYLES.find((x) => x.id === row.style)?.label ?? row.style,
        ratio: row.ratio,
        image: row.image,
        operation: op,
        maskHint: opts?.maskHint,
        outpaintDirection: opts?.direction,
      });
      if (!image) throw new Error(error || "Edit failed");
      const { error: pErr } = await supabase.from("projects").insert({
        user_id: access.userId,
        title: `${op}: ${row.prompt.slice(0, 60)}`,
        content_type: "ai_image",
        topic: row.prompt, style: row.style, status: "generated",
        thumbnail_url: image,
      });
      if (pErr) toast.error("Save failed");
      qc.invalidateQueries({ queryKey: ["images-library"] });
      qc.invalidateQueries({ queryKey: ["module-counts"] });
      toast.success(`${op} complete`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setEditingId(null);
    }
  }

  async function loadHistory() {
    const logs = await listImageGenLogs();
    if (logs.length === 0) return toast.info("No saved debug logs yet");
    downloadJson(`creatorflow-image-debug-history-${Date.now()}.json`, logs);
    toast.success(`Downloaded ${logs.length} logs`);
  }

  function downloadCurrentDebug() {
    if (!debug) return toast.error("No debug data yet");
    downloadJson(`creatorflow-image-debug-${Date.now()}.json`, debug);
  }

  /** "New generation" starts from a blank prompt. Style, ratio, quality and batch are kept;
   *  earlier prompts stay one click away in Prompt history. */
  function startNewGeneration() {
    setPrompt("");
    setNegativePrompt("");
    setReferenceImages([]);
    setStyleImages([]);
    setSeed("");
    setView("input");
  }

  function applyHistoryEntry(h: ImagePromptHistoryEntry) {
    setPrompt(h.prompt);
    setNegativePrompt(h.negativePrompt ?? "");
    if (h.style) setStyle(h.style);
    if (h.ratio) setRatio(h.ratio);
    if (typeof h.cfg === "number") setCfg(h.cfg);
    if (typeof h.styleStrength === "number") setStyleStrength(h.styleStrength);
    if (h.seed !== undefined) setSeed(h.seed);
    if (h.batch) setBatch(h.batch);
    setShowHistory(false);
    setView("input");
    toast.success("Loaded from history");
  }

  const deleteProject = useProjectDelete();
  async function deleteImage(id: string) {
    const row = results.find((r) => r.id === id);
    await deleteProject({ id, title: row?.prompt || "Generated image" });
  }

  async function clearSession() {
    if (!access?.userId) return;
    const { error } = await supabase.from("projects").delete()
      .eq("user_id", access.userId).eq("content_type", "ai_image");
    if (error) { toast.error("Clear failed"); return; }
    setLastRun(null); setDebug(null);
    localStorage.removeItem(LS_STATE);
    qc.invalidateQueries({ queryKey: ["images-library"] });
    qc.invalidateQueries({ queryKey: ["module-counts"] });
    qc.invalidateQueries({ queryKey: ["projects-section"] });
    qc.invalidateQueries({ queryKey: ["recent-projects"] });
    toast.success("Cleared all generated images");
  }

  useMemo(() => results.length, [results.length]);

  const aspectClass: Record<string, string> = {
    "1:1": "aspect-square", "9:16": "aspect-[9/16]", "16:9": "aspect-video", "4:5": "aspect-[4/5]",
  };
  const styleLabelPreview = style === AS_DESCRIBED_STYLE ? "" : (STYLES.find((s) => s.id === style)?.label ?? style);
  const previewFullPrompt = prompt ? `${styleLabelPreview ? `${styleLabelPreview} style. ` : ""}${prompt}${negativePrompt.trim() ? ` Avoid: ${negativePrompt.trim()}.` : ""}` : "";

  return (
    <div className="space-y-6 max-w-6xl">
      <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />
      <div className="flex items-start justify-between gap-4">
        <div>
          {view === "input" ? (
            <>
              <h1 className="text-3xl md:text-4xl font-bold">AI <span className="gradient-text">Image</span> Studio</h1>
              <p className="text-muted-foreground mt-1">Describe. Refine. Generate. Edit.</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl md:text-4xl font-bold">Your <span className="gradient-text">Images</span></h1>
              <p className="text-muted-foreground mt-1">AI-generated images and concepts.</p>
            </>
          )}
        </div>
        {view === "landing" && (
          <button onClick={startNewGeneration}
            className="rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> New generation
          </button>
        )}
      </div>

      {view === "input" && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={() => setView("landing")}
              className="text-sm text-muted-foreground hover:text-white flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to your images
            </button>
            <button onClick={() => setShowHistory((v) => !v)}
              className="text-xs text-muted-foreground hover:text-white flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> Prompt history ({history.length})
            </button>
          </div>

          {showHistory && (
            <div className="glass rounded-2xl p-4 max-h-64 overflow-auto">
              {history.length === 0 ? (
                <div className="text-xs text-muted-foreground">No prompts yet.</div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Last {history.length} prompts</div>
                    <button onClick={() => { clearPromptHistory(); setHistory([]); }}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  </div>
                  {history.map((h) => (
                    <button key={h.id} onClick={() => applyHistoryEntry(h)}
                      className="w-full text-left glass border border-border rounded-lg px-3 py-2 hover:border-white/20 transition">
                      <div className="text-xs text-white/90 line-clamp-2">{h.prompt}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 flex gap-2">
                        <span>{h.style ?? "—"}</span>
                        <span>·</span><span>{h.ratio ?? "1:1"}</span>
                        {typeof h.seed === "number" && (<><span>·</span><span>seed {h.seed}</span></>)}
                        {typeof h.cfg === "number" && (<><span>·</span><span>cfg {h.cfg}</span></>)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="glass rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Positive prompt</label>
              <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder="A lone astronaut watching Earth rise from a lunar cliff, ultra detailed..."
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Negative prompt (avoid)</label>
              <textarea rows={2} value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, watermark, extra fingers, low quality..."
                className="w-full bg-input/50 border border-border rounded-lg px-4 py-3 focus:outline-none focus:border-[color:var(--neon-purple)]" />
            </div>

            <div>
              <div className="text-sm text-muted-foreground mb-2">Style</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setStyle(AS_DESCRIBED_STYLE)}
                  title="Use only the style written in your prompt"
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${style === AS_DESCRIBED_STYLE ? "gradient-primary text-white border-transparent" : "glass border-border hover:border-white/20"}`}>
                  As described
                </button>
                {STYLES.map((s) => (
                  <button key={s.id} onClick={() => setStyle(s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${style === s.id ? "gradient-primary text-white border-transparent" : "glass border-border hover:border-white/20"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              {styleClash && promptStyle && (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex flex-wrap items-center gap-2">
                  <span>Your prompt asks for a <strong>{promptStyle.phrase}</strong> look, but the <strong>{selectedStyleLabel}</strong> style is selected — the AI gets mixed instructions.</span>
                  <button onClick={() => setStyle(promptStyle.id)} className="rounded-md bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 font-medium">
                    Use {STYLES.find((x) => x.id === promptStyle.id)?.label ?? promptStyle.phrase}
                  </button>
                  <button onClick={() => setStyle(AS_DESCRIBED_STYLE)} className="rounded-md bg-white/10 hover:bg-white/15 px-2 py-1 font-medium">
                    Use "As described"
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Ratio</div>
                  <div className="flex gap-2">
                    {RATIOS.map((r) => (
                      <button key={r} onClick={() => setRatio(r)}
                        className={`px-3 py-1.5 rounded-lg text-xs border ${ratio === r ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{r}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Quality</div>
                  <div className="flex gap-2">
                    <button onClick={() => setQuality("standard")} title="Fast draft model — best for scenes without text. 1 credit per image."
                      className={`px-3 py-1.5 rounded-lg text-xs border ${quality === "standard" ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>Standard</button>
                    <button onClick={() => setQuality("hd")} title={`Accurate text, several characters, detailed scenes. ${HD_CREDITS} credits per image.`}
                      className={`px-3 py-1.5 rounded-lg text-xs border ${quality === "hd" ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>HD</button>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Batch</div>
                  <div className="flex gap-2">
                    {BATCH_OPTIONS.map((n) => (
                      <button key={n} onClick={() => setBatch(n)}
                        className={`px-3 py-1.5 rounded-lg text-xs border ${batch === n ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{n}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={regenerateExact} disabled={loading || !lastRun}
                  title={lastRun ? "Rerun with the exact last prompt & settings" : "Generate once first"}
                  className="rounded-lg glass border border-border px-4 py-2.5 text-sm font-medium flex items-center gap-2 disabled:opacity-40">
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Regenerate
                </button>
                <button onClick={generate} disabled={loading}
                  className="rounded-lg gradient-primary text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)]">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Generate {batch}
                  <span className="ml-1 inline-flex items-center rounded-full bg-white/15 border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
                    {batch * perImageCredits} credit{batch * perImageCredits === 1 ? "" : "s"}
                  </span>
                </button>
              </div>
            </div>

            {hdHint.needs && !usesHdModel && (
              <div className="rounded-lg border border-[color:var(--neon-purple)]/40 bg-[color:var(--neon-purple)]/10 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
                <span>{hdHint.reason} Standard often misspells words or drops people and props.</span>
                <button onClick={() => setQuality("hd")} className="rounded-md gradient-primary text-white px-2 py-1 font-medium">
                  Switch to HD ({HD_CREDITS} credits each)
                </button>
              </div>
            )}

            {/* Advanced */}
            <button onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-muted-foreground hover:text-white flex items-center gap-1 pt-2">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
              Advanced controls
            </button>

            {showAdvanced && (
              <div className="space-y-4 pt-2 border-t border-border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Seed</label>
                    <div className="flex gap-2 mt-1">
                      <input type="number" value={seed} onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="random"
                        className="w-full bg-input/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[color:var(--neon-purple)]" />
                      <button onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
                        className="rounded-lg glass border border-border px-3 text-xs">Roll</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">CFG (prompt adherence) — {cfg}</label>
                    <input type="range" min={1} max={20} value={cfg} onChange={(e) => setCfg(Number(e.target.value))}
                      className="w-full mt-3 accent-[color:var(--neon-purple)]" />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Style strength — {styleStrength}%</label>
                    <input type="range" min={0} max={100} value={styleStrength} onChange={(e) => setStyleStrength(Number(e.target.value))}
                      className="w-full mt-3 accent-[color:var(--neon-purple)]" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <UploadPanel
                    title="Reference images (subject)"
                    hint="Guide the subject, pose, or composition."
                    images={referenceImages}
                    onAdd={(f) => addUploads("ref", f)}
                    onRemove={(i) => setReferenceImages((prev) => prev.filter((_, k) => k !== i))}
                  />
                  <UploadPanel
                    title="Style images"
                    hint="Guide the color palette, lighting, and look."
                    images={styleImages}
                    onAdd={(f) => addUploads("style", f)}
                    onRemove={(i) => setStyleImages((prev) => prev.filter((_, k) => k !== i))}
                  />
                </div>
              </div>
            )}

            {prompt && (
              <div className="rounded-lg border border-border bg-black/30 p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Full prompt the AI receives
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(previewFullPrompt); toast.success("Prompt copied"); }}
                    className="text-xs text-muted-foreground hover:text-white flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <code className="block text-xs font-mono text-white/90 whitespace-pre-wrap break-words">
                  {previewFullPrompt}
                </code>
              </div>
            )}
          </div>

          {access?.isAdmin && (
          <div className="glass rounded-2xl">
            <button onClick={() => setShowDebug((v) => !v)} className="w-full flex items-center justify-between px-6 py-3 text-sm">
              <span className="flex items-center gap-2">
                <Bug className="w-4 h-4" /> Debug panel
                {debug && (
                  <span className="text-xs text-muted-foreground">
                    · {debug.successCount}/{debug.successCount + debug.failureCount} ok · {debug.durationMs}ms
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{showDebug ? "Hide" : "Show"}</span>
            </button>
            {showDebug && (
              <div className="px-6 pb-6 space-y-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <button onClick={downloadCurrentDebug} disabled={!debug}
                    className="rounded-lg gradient-primary text-white px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40">
                    <FileDown className="w-3 h-3" /> Download debug JSON
                  </button>
                  <button onClick={loadHistory}
                    className="rounded-lg glass border border-border px-3 py-1.5 flex items-center gap-1.5">
                    <Download className="w-3 h-3" /> Download saved history (last 20)
                  </button>
                </div>
                {debug && (
                  <>
                    <pre className="bg-black/40 rounded p-3 overflow-auto">{JSON.stringify(debug.request, null, 2)}</pre>
                    {debug.errors.length > 0 && (
                      <ul className="space-y-1">
                        {debug.errors.map((e, i) => (
                          <li key={i} className="text-rose-400 font-mono break-all">{e}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          )}
        </>
      )}

      {view === "landing" && (
        <>
          {libraryLoading ? (
            <div className="glass rounded-2xl p-16 flex items-center justify-center border border-border text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading your images…
            </div>
          ) : results.length === 0 ? (
            <div className="glass rounded-2xl p-16 flex flex-col items-center justify-center text-center border border-border">
              <div className="w-14 h-14 rounded-full glass flex items-center justify-center mb-4 border border-border">
                <ImageIcon className="w-6 h-6 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold">No images yet</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Generate your first AI image — describe a scene, pick a style, and get multiple concepts instantly.
              </p>
              <button onClick={startNewGeneration}
                className="mt-5 rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4" /> New generation
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{results.length} generated {results.length === 1 ? "image" : "images"}</div>
                <button onClick={clearSession} className="text-xs text-muted-foreground hover:text-rose-400 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Clear saved session
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {results.map((r, i) => (
                  <ImageCard
                    key={r.id}
                    row={r}
                    aspectClass={aspectClass[r.ratio]}
                    onOpen={() => setViewerIdx(i)}
                    onDelete={() => deleteImage(r.id)}
                    onEdit={(op, opts) => editExisting(r, op, opts)}
                    busy={editingId === r.id}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {viewerIdx !== null && results[viewerIdx] && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewerIdx(null)}>
          <button onClick={(e) => { e.stopPropagation(); setViewerIdx(null); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
          {viewerIdx > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setViewerIdx((i) => (i === null ? i : i - 1)); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" aria-label="Previous">
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {viewerIdx < results.length - 1 && (
            <button onClick={(e) => { e.stopPropagation(); setViewerIdx((i) => (i === null ? i : i + 1)); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center" aria-label="Next">
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <div className="max-w-[92vw] max-h-[92vh] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={results[viewerIdx].image} alt={results[viewerIdx].prompt}
              className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg shadow-2xl" />
            <div className="text-xs text-white/70 text-center max-w-2xl">
              <div className="mb-1">{results[viewerIdx].style === AS_DESCRIBED_STYLE ? "as described" : results[viewerIdx].style} · {results[viewerIdx].ratio} · {viewerIdx + 1}/{results.length}</div>
              <div className="line-clamp-2">{results[viewerIdx].prompt}</div>
            </div>
            <div className="flex gap-2">
            <a href={results[viewerIdx].image} download={`creatorflow-${results[viewerIdx].id}.png`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-xs font-medium flex items-center gap-2">
              <Download className="w-3 h-3" /> Download
            </a>
            <PublishButton
              className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-4 py-2 text-xs font-medium flex items-center gap-2"
              content={{
                projectId: results[viewerIdx].id,
                title: results[viewerIdx].prompt.slice(0, 80) || "AI image",
                media: [{ url: results[viewerIdx].image, kind: "image", name: "image.png" }],
              }}
            />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadPanel({
  title, hint, images, onAdd, onRemove,
}: {
  title: string; hint: string; images: string[];
  onAdd: (files: FileList | null) => void;
  onRemove: (idx: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-black/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold text-white">{title}</div>
          <div className="text-[10px] text-muted-foreground">{hint}</div>
        </div>
        <label className="rounded-md glass border border-border px-2 py-1 text-xs flex items-center gap-1 cursor-pointer hover:border-white/20">
          <Upload className="w-3 h-3" /> Upload
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { onAdd(e.target.files); e.currentTarget.value = ""; }} />
        </label>
      </div>
      {images.length === 0 ? (
        <div className="text-[10px] text-muted-foreground italic">No images. Up to 4.</div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative aspect-square rounded overflow-hidden border border-border">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button aria-label="Remove" onClick={() => onRemove(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded bg-black/70 text-white flex items-center justify-center hover:bg-rose-500/80">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageCard({
  row, aspectClass, onOpen, onDelete, onEdit, busy,
}: {
  row: ResultItem; aspectClass: string; onOpen: () => void; onDelete: () => void;
  onEdit: (op: EditOp, opts?: { maskHint?: string; direction?: GenerateImageRequest["outpaintDirection"] }) => void;
  busy: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  async function askAndEdit(op: EditOp) {
    if (op === "inpaint" || op === "eraser") {
      const hint = await promptDialog(op === "inpaint"
        ? { title: "Inpaint", description: "Describe what to change and what to replace it with.", placeholder: "e.g. replace the coffee cup with a glass of mango juice", multiline: true, confirmText: "Apply" }
        : { title: "Magic eraser", description: "Describe what to erase from the image.", placeholder: "e.g. the person in the background on the left", multiline: true, confirmText: "Erase" });
      if (!hint) return;
      onEdit(op, { maskHint: hint });
    } else if (op === "outpaint") {
      const dir = await promptDialog({ title: "Extend image", description: "Which side should the image be extended?", choices: ["all", "left", "right", "top", "bottom"], confirmText: "Extend" });
      if (!dir) return;
      const valid = ["left", "right", "top", "bottom", "all"] as const;
      const direction = (valid as readonly string[]).includes(dir) ? (dir as (typeof valid)[number]) : "all";
      onEdit(op, { direction });
    } else {
      onEdit(op);
    }
    setMenuOpen(false);
  }

  return (
    <div className="glass rounded-xl overflow-hidden group relative">
      <button onClick={onOpen}
        className={`${aspectClass} relative overflow-hidden flex items-end p-3 w-full text-left cursor-zoom-in`}
        aria-label="View full screen">
        <img src={row.image} alt={row.prompt} loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="relative text-white text-xs glass px-2 py-1 rounded">{row.style === AS_DESCRIBED_STYLE ? "as described" : row.style} · {row.ratio}</span>
        <span className="absolute top-2 right-2 rounded-md bg-black/60 backdrop-blur p-1.5 opacity-0 group-hover:opacity-100 transition">
          <Maximize2 className="w-3.5 h-3.5 text-white" />
        </span>
        {busy && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
        )}
      </button>
      <div className="p-3">
        <div className="text-xs text-muted-foreground line-clamp-2">{row.prompt}</div>
        <div className="mt-3 flex gap-1.5">
          <a href={row.image} download={`creatorflow-${row.id}.png`}
            className="flex-1 rounded-lg gradient-primary text-white py-1.5 text-xs flex items-center justify-center gap-1">
            <Download className="w-3 h-3" /> Download
          </a>
          <button onClick={() => setMenuOpen((v) => !v)} disabled={busy}
            className="rounded-lg glass border border-border py-1.5 px-2 text-xs flex items-center gap-1 disabled:opacity-40" title="AI edit">
            <Sparkles className="w-3 h-3" /> Edit
          </button>
          <button onClick={onDelete}
            className="rounded-lg glass hover:bg-rose-500/20 text-rose-300 py-1.5 px-2 text-xs flex items-center justify-center" title="Delete">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        {menuOpen && (
          <div className="mt-2 rounded-lg border border-border bg-black/70 p-1.5 grid grid-cols-2 gap-1">
            <MenuBtn icon={<Expand className="w-3 h-3" />} label="Upscale" onClick={() => askAndEdit("upscale")} />
            <MenuBtn icon={<Scissors className="w-3 h-3" />} label="Remove BG" onClick={() => askAndEdit("removeBg")} />
            <MenuBtn icon={<PaintBucket className="w-3 h-3" />} label="Inpaint" onClick={() => askAndEdit("inpaint")} />
            <MenuBtn icon={<Expand className="w-3 h-3 rotate-45" />} label="Outpaint" onClick={() => askAndEdit("outpaint")} />
            <MenuBtn icon={<Eraser className="w-3 h-3" />} label="Magic Eraser" onClick={() => askAndEdit("eraser")} />
          </div>
        )}
      </div>
    </div>
  );
}

function MenuBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="rounded-md glass border border-border px-2 py-1.5 text-[11px] flex items-center gap-1 hover:border-white/20 hover:bg-white/5">
      {icon} {label}
    </button>
  );
}

function downloadJson(name: string, obj: unknown) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
