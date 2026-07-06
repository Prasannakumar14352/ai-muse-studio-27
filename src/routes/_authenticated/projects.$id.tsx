import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStyleImage } from "@/lib/constants";
import { generateProject } from "@/lib/generators";
import { renderVideo, renderUgcVideo, type UgcStage } from "@/lib/video-renderer";
import { getOutput, saveOutput, type LocalOutput } from "@/lib/local-store";
import { toast } from "sonner";
import { Copy, Download, ArrowLeft, Loader2, Play, Pause, SkipForward, SkipBack, Film, RefreshCw, Video as VideoIcon, Sparkles, AlertTriangle, Bug, CheckCircle2, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$id")({ component: ProjectView });


function ProjectView() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const [{ data: project }, output] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        getOutput(id),
      ]);
      return { project, output: output as LocalOutput | null };
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data?.project) {
    return <div className="glass rounded-2xl p-12 text-center">Project not found. <Link to="/dashboard" className="text-[color:var(--neon-purple)]">Back to dashboard</Link></div>;
  }

  const { project, output } = data;
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState<null | "all" | "script" | "scenes" | "captions" | "images">(null);

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  function download() {
    const blob = new Blob([JSON.stringify({ project, output }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${project.title.replace(/[^\w]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function regenerate(part: "all" | "script" | "scenes" | "captions" | "images") {
    if (!project) return;
    setRegenerating(part);
    try {
      const fresh = generateProject({
        topic: project.topic ?? project.title,
        tone: project.tone ?? "Viral",
        platform: project.platform ?? "instagram",
        style: project.style ?? "cinematic",
        contentType: project.content_type ?? "short_reel",
      });
      const patch: Partial<LocalOutput> = {};
      if (part === "all" || part === "script") { patch.script = fresh.script; patch.hook = fresh.hook; patch.title = fresh.title; }
      if (part === "all" || part === "scenes") { patch.scenes = fresh.scenes; patch.thumbnail_ideas = fresh.thumbnail_ideas; }
      if (part === "all" || part === "captions") { patch.captions = fresh.captions; patch.hashtags = fresh.hashtags; }
      if (part === "all" || part === "images") { patch.image_prompts = fresh.image_prompts; }

      await saveOutput(project.id, patch);
      if (part === "all" || part === "script") {
        await supabase.from("projects").update({ title: fresh.title }).eq("id", project.id);
      }
      qc.invalidateQueries({ queryKey: ["project", id] });
      toast.success(`Regenerated ${part === "all" ? "everything" : part}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(null);
    }
  }


  const scenes = (output?.scenes as Array<{ n: number; visual: string; voiceover: string; duration: string }>) ?? [];
  const prompts = (output?.image_prompts as Array<{ n: number; prompt: string; style: string }>) ?? [];
  const thumbs = (output?.thumbnail_ideas as string[]) ?? [];

  return (
    <div className="space-y-6 max-w-6xl">
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      {/* Header */}
      <div className="glass rounded-2xl p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="gradient-primary text-white px-2.5 py-1 rounded-full">{project.content_type}</span>
          {project.platform && <span className="glass px-2.5 py-1 rounded-full">{project.platform}</span>}
          {project.tone && <span className="glass px-2.5 py-1 rounded-full">{project.tone}</span>}
          {project.style && <span className="glass px-2.5 py-1 rounded-full">{project.style}</span>}
        </div>
        <h1 className="mt-4 text-2xl md:text-3xl font-bold">{output?.title ?? project.title}</h1>
        {output?.hook && <p className="mt-3 text-lg text-muted-foreground italic">"{output.hook}"</p>}

        <div className="mt-6 flex flex-wrap gap-2">
          {output?.script && <button onClick={() => copy(output.script!, "Script")} className="rounded-lg glass px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5"><Copy className="w-4 h-4" /> Copy Script</button>}
          {output?.captions && <button onClick={() => copy(output.captions!, "Caption")} className="rounded-lg glass px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5"><Copy className="w-4 h-4" /> Copy Caption</button>}
          <button onClick={download} className="rounded-lg glass px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5"><Download className="w-4 h-4" /> Download JSON</button>
          <button
            onClick={() => regenerate("all")}
            disabled={!!regenerating}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2 shadow-[var(--shadow-glow)] disabled:opacity-60">
            {regenerating === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Regenerate All
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["script", "scenes", "captions", "images"] as const).map((k) => (
            <button key={k} onClick={() => regenerate(k)} disabled={!!regenerating}
              className="rounded-full glass px-3 py-1 text-xs hover:bg-white/5 flex items-center gap-1.5 disabled:opacity-60">
              {regenerating === k ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Re-run {k}
            </button>
          ))}
        </div>

        {/* Exact generator inputs — same inputs "Regenerate All" reuses */}
        <div className="mt-4 rounded-lg border border-border bg-black/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Exact inputs sent to the script / scenes / captions / hashtags generator
            </div>
            <button
              onClick={() => {
                const payload = {
                  topic: project.topic ?? project.title,
                  tone: project.tone ?? "Viral",
                  platform: project.platform ?? "instagram",
                  style: project.style ?? "cinematic",
                  contentType: project.content_type ?? "short_reel",
                };
                navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                toast.success("Inputs copied");
              }}
              className="text-xs text-muted-foreground hover:text-white flex items-center gap-1"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>
          <pre className="text-xs font-mono text-white/90 whitespace-pre-wrap break-words">
{JSON.stringify({
  topic: project.topic ?? project.title,
  tone: project.tone ?? "Viral",
  platform: project.platform ?? "instagram",
  style: project.style ?? "cinematic",
  contentType: project.content_type ?? "short_reel",
}, null, 2)}
          </pre>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Click <span className="text-white">Regenerate All</span> to re-run the script, scenes, captions, hashtags, and image prompts using these exact inputs — no edits required.
          </div>
        </div>
      </div>


      {/* Preview — carousels have their own preview page */}
      {project.content_type === "carousel" ? (
        <div className="glass rounded-2xl p-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-semibold">Carousel project</div>
            <div className="text-sm text-muted-foreground">Slide previews, per-slide regeneration and export live on the Carousels page.</div>
          </div>
          <Link to="/carousels" className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium">Open in Carousels</Link>
        </div>
      ) : (
        <VideoPreview
          scenes={scenes}
          title={output?.title ?? project.title}
          styleImage={getStyleImage(project.style)}
          styleId={project.style}
          platform={project.platform}
          contentType={project.content_type}
          music={project.music}
          projectId={project.id}
          userId={project.user_id}
          outputId={output?.id ?? null}
          existingVideoUrl={output?.video_url ?? null}
          existingDiagnostics={(output as { render_diagnostics?: unknown } | null)?.render_diagnostics ?? null}
          imagePrompts={prompts}
        />
      )}






      <div className="grid lg:grid-cols-2 gap-6">
        {/* Script */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-3">Full Script</h2>
          <pre className="text-sm whitespace-pre-wrap text-muted-foreground font-mono leading-relaxed">{output?.script}</pre>
        </div>

        {/* Scenes */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-3">Scene Breakdown</h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {scenes.map((s) => (
              <div key={s.n} className="border border-border/50 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="gradient-primary text-white px-2 py-0.5 rounded">Scene {s.n}</span>
                  <span className="text-muted-foreground">{s.duration}</span>
                </div>
                <div className="mt-2 text-sm">{s.visual}</div>
                <div className="mt-1 text-xs text-muted-foreground">🎙 {s.voiceover}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Image prompts */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-3">Image Prompts (B-roll)</h2>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {prompts.map((p) => (
              <div key={p.n} className="border border-border/50 rounded-lg p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">Shot #{p.n} · {p.style}</div>
                {p.prompt}
              </div>
            ))}
          </div>
        </div>

        {/* Captions & hashtags */}
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-3">Captions</h2>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">{output?.captions}</div>
          <h3 className="mt-4 font-semibold text-sm">Hashtags</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(output?.hashtags ?? []).map((h) => (
              <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>
            ))}
          </div>
        </div>

        {/* Thumbnails */}
        <div className="glass rounded-2xl p-6 lg:col-span-2">
          <h2 className="font-semibold mb-3">Thumbnail Ideas</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {thumbs.map((t, i) => (
              <div key={i} className="border border-border/50 rounded-lg p-4 text-sm">
                <div className="text-xs text-[color:var(--neon-pink)] mb-1">Concept {i + 1}</div>
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><div className="text-xs text-muted-foreground">Voice</div><div className="font-medium">{project.voice}</div></div>
        <div><div className="text-xs text-muted-foreground">Music</div><div className="font-medium">{project.music}</div></div>
        <div><div className="text-xs text-muted-foreground">Topic</div><div className="font-medium">{project.topic}</div></div>
        <div><div className="text-xs text-muted-foreground">Audience</div><div className="font-medium">{project.audience || "—"}</div></div>
      </div>
    </div>
  );
}

type Scene = { n: number; visual: string; voiceover: string; duration: string };

function VideoPreview({
  scenes, title, styleImage, styleId, platform, contentType, music,
  projectId, userId, outputId, existingVideoUrl, existingDiagnostics, imagePrompts,
}: {
  scenes: Scene[]; title: string; styleImage: string;
  styleId?: string | null;
  platform?: string | null; contentType?: string | null; music?: string | null;
  projectId: string; userId: string; outputId: string | null;
  existingVideoUrl: string | null; existingDiagnostics?: unknown;
  imagePrompts?: Array<{ n: number; prompt: string; style: string }>;
}) {
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(existingVideoUrl);
  const [ugcRendering, setUgcRendering] = useState(false);
  const [ugcStage, setUgcStage] = useState<UgcStage | null>(null);
  const [diagnostics, setDiagnostics] = useState<VideoDiagnostics | null>(
    existingDiagnostics && typeof existingDiagnostics === "object"
      ? (existingDiagnostics as VideoDiagnostics)
      : null,
  );
  const [showDiag, setShowDiag] = useState(false);
  const [autoRetryUsed, setAutoRetryUsed] = useState(false);
  const [canceled, setCanceled] = useState(false);
  const lastRenderKindRef = useRef<null | "storyboard" | "ugc">(null);
  const lastContainerRef = useRef<"webm" | "mp4" | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const isVertical = contentType === "short_reel" || platform === "tiktok" || platform === "instagram";
  const aspect = isVertical ? "aspect-[9/16] max-w-[340px]" : "aspect-video w-full";
  const totalScenes = scenes.length;

  useEffect(() => {
    setVideoUrl(existingVideoUrl);
    setAutoRetryUsed(false);
    setCanceled(false);
  }, [existingVideoUrl]);

  const currentDurationMs = useMemo(() => {
    const raw = scenes[idx]?.duration ?? "3s";
    const n = parseFloat(raw);
    return Math.max(1500, (isNaN(n) ? 3 : n) * 1000);
  }, [scenes, idx]);

  useEffect(() => {
    if (!playing || totalScenes === 0) return;
    startRef.current = performance.now();
    const tick = (t: number) => {
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / currentDurationMs);
      setProgress(p);
      if (p >= 1) {
        setIdx((i) => (i + 1) % totalScenes);
        setProgress(0);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, idx, currentDurationMs, totalScenes]);

  async function persistDiagnostics(next: VideoDiagnostics) {
    setDiagnostics(next);
    await saveOutput(projectId, { render_diagnostics: next }).catch(() => undefined);
  }

  function appendAttempt(base: VideoDiagnostics, entry: RetryEntry): VideoDiagnostics {
    return { ...base, retries: [...(base.retries ?? []), entry] };
  }

  async function uploadRender(blob: Blob, mimeType: string, extension: string, durationSec: number, container: "webm" | "mp4" | undefined) {
    const uploadStart = Date.now();
    const path = `${userId}/${projectId}-${Date.now()}.${extension}`;
    const { error: upErr } = await supabase.storage.from("renders").upload(path, blob, {
      contentType: mimeType, upsert: true,
    });
    if (upErr) {
      const next = appendAttempt(diagnostics ?? emptyDiag(), {
        at: new Date().toISOString(), phase: "upload", container, mimeType,
        blobSize: blob.size, error: upErr.message,
      });
      await persistDiagnostics({ ...next, uploadError: upErr.message, blobSize: blob.size, blobType: blob.type, mimeType });
      throw upErr;
    }
    const { data: signed } = await supabase.storage.from("renders").createSignedUrl(path, 60 * 60 * 24 * 7);
    const url = signed?.signedUrl ?? null;
    if (url) {
      await saveOutput(projectId, { video_url: url });
    }

    setVideoUrl(url);
    const base = diagnostics ?? emptyDiag();
    const next: VideoDiagnostics = {
      ...base,
      renderedAt: new Date().toISOString(),
      mimeType, extension, durationSec,
      blobSize: blob.size, blobType: blob.type,
      uploadDurationMs: Date.now() - uploadStart,
      signedUrl: url,
      codecSupport: probeCodecSupport(),
      renderError: null, uploadError: null, playbackError: null,
      retries: [...(base.retries ?? []), {
        at: new Date().toISOString(), phase: "render", container, mimeType,
        blobSize: blob.size, ok: true,
      }],
    };
    await persistDiagnostics(next);
    setAutoRetryUsed(false);
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    toast.success(`Rendered ${durationSec.toFixed(1)}s ${extension.toUpperCase()} — saved to your library.`);
  }

  async function handleRender(container?: "webm" | "mp4") {
    if (rendering || ugcRendering || totalScenes === 0) return;
    lastRenderKindRef.current = "storyboard";
    lastContainerRef.current = container;
    setRendering(true);
    setRenderProgress(0);
    setPlaying(false);
    setCanceled(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await renderVideo({
        title, platform, scenes, styleId, contentType,
        onProgress: setRenderProgress,
        signal: controller.signal,
        preferredContainer: container,
      });
      await uploadRender(result.blob, result.mimeType, result.extension, result.durationSec, container);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Render failed";
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) setCanceled(true);
      const next = appendAttempt(diagnostics ?? emptyDiag(), {
        at: new Date().toISOString(), phase: isAbort ? "canceled" : "render",
        container, error: msg,
      });
      await persistDiagnostics({ ...next, renderError: isAbort ? null : msg });
      toast[isAbort ? "message" : "error"](isAbort ? "Render canceled" : msg);
    } finally {
      setRendering(false);
      abortRef.current = null;
    }
  }

  async function handleUgcRender(container?: "webm" | "mp4") {
    if (rendering || ugcRendering || totalScenes === 0) return;
    lastRenderKindRef.current = "ugc";
    lastContainerRef.current = container;
    setUgcRendering(true);
    setUgcStage({ kind: "images", done: 0, total: totalScenes });
    setPlaying(false);
    setCanceled(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await renderUgcVideo({
        title, platform, contentType, styleId, scenes,
        imagePrompts,
        voice: "alloy",
        onStage: setUgcStage,
        signal: controller.signal,
        preferredContainer: container,
      });
      await uploadRender(result.blob, result.mimeType, result.extension, result.durationSec, container);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "UGC render failed";
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) setCanceled(true);
      const next = appendAttempt(diagnostics ?? emptyDiag(), {
        at: new Date().toISOString(), phase: isAbort ? "canceled" : "render",
        container, error: msg,
      });
      await persistDiagnostics({ ...next, renderError: isAbort ? null : msg });
      toast[isAbort ? "message" : "error"](isAbort ? "Render canceled" : msg);
    } finally {
      setUgcRendering(false);
      setUgcStage(null);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    if (abortRef.current) {
      abortRef.current.abort();
      toast.message("Canceling render…");
    }
  }

  function onVideoError(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget;
    const err = el.error;
    const codeMap: Record<number, string> = {
      1: "MEDIA_ERR_ABORTED", 2: "MEDIA_ERR_NETWORK",
      3: "MEDIA_ERR_DECODE", 4: "MEDIA_ERR_SRC_NOT_SUPPORTED",
    };
    const detail = err ? `${codeMap[err.code] ?? "UNKNOWN"} — ${err.message || "no message"}` : "unknown error";
    const base = diagnostics ?? emptyDiag();
    const next: VideoDiagnostics = {
      ...base,
      playbackError: detail,
      codecSupport: probeCodecSupport(),
      networkState: el.networkState,
      readyState: el.readyState,
      currentSrc: el.currentSrc || null,
      retries: [...(base.retries ?? []), {
        at: new Date().toISOString(), phase: "playback",
        container: lastContainerRef.current, error: detail,
      }],
    };
    void persistDiagnostics(next);

    // Codec fallback: swap container (webm ↔ mp4) and re-render once.
    if (!autoRetryUsed && lastRenderKindRef.current && !rendering && !ugcRendering) {
      setAutoRetryUsed(true);
      const wasMp4 = base.extension === "mp4" || lastContainerRef.current === "mp4";
      const nextContainer: "webm" | "mp4" = wasMp4 ? "webm" : "mp4";
      toast.message(`Preview failed to decode ${base.mimeType ?? ""} — retrying as ${nextContainer.toUpperCase()}…`);
      if (lastRenderKindRef.current === "ugc") handleUgcRender(nextContainer);
      else handleRender(nextContainer);
    } else {
      toast.error(`Video preview failed: ${detail}`);
      setShowDiag(true);
    }
  }

  function onVideoLoaded(e: React.SyntheticEvent<HTMLVideoElement>) {
    const el = e.currentTarget;
    const base = diagnostics ?? emptyDiag();
    void persistDiagnostics({
      ...base,
      playbackError: null,
      readyState: el.readyState,
      networkState: el.networkState,
      currentSrc: el.currentSrc || null,
      videoWidth: el.videoWidth, videoHeight: el.videoHeight,
      playableDurationSec: isFinite(el.duration) ? el.duration : null,
    });
  }

  if (totalScenes === 0) return null;
  const scene = scenes[idx];

  const stages = buildStages(ugcStage, ugcRendering, rendering, renderProgress);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Film className="w-4 h-4 text-[color:var(--neon-pink)]" /> Video Preview</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isVertical ? "9:16 vertical" : "16:9 landscape"} · {totalScenes} scenes · {music ?? "No music"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {videoUrl && (
            <a href={videoUrl} download className="rounded-lg glass hover:bg-white/5 px-4 py-2 text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" /> Download video
            </a>
          )}
          <button
            onClick={() => handleRender()}
            disabled={rendering || ugcRendering}
            className="rounded-lg glass hover:bg-white/5 px-4 py-2 text-sm font-medium disabled:opacity-60 flex items-center gap-2">
            {rendering
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Storyboard {Math.round(renderProgress * 100)}%</>
              : <><VideoIcon className="w-4 h-4" /> Storyboard only</>}
          </button>
          <button
            onClick={() => handleUgcRender()}
            disabled={rendering || ugcRendering}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium shadow-[var(--shadow-glow)] disabled:opacity-60 flex items-center gap-2">
            {ugcRendering
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Rendering…</>
              : <><Sparkles className="w-4 h-4" /> {videoUrl ? "Re-generate UGC video" : "Generate UGC video"}</>}
          </button>
          {(rendering || ugcRendering) && (
            <button
              onClick={handleCancel}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 px-4 py-2 text-sm font-medium flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          )}
        </div>
      </div>

      {canceled && !rendering && !ugcRendering && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 px-4 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Render was canceled. Progress rail below shows the stages reached before cancel.
        </div>
      )}

      {(rendering || ugcRendering) && (
        <div className="mb-4 rounded-xl border border-border bg-black/30 p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>Real-time render progress</span>
            <span>{stages.filter((s) => s.state === "done").length}/{stages.length} stages</span>
          </div>
          <div className="space-y-2">
            {stages.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <div className="w-5 flex-shrink-0">
                  {s.state === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                   s.state === "active" ? <Loader2 className="w-4 h-4 animate-spin text-[color:var(--neon-pink)]" /> :
                   <div className="w-2 h-2 rounded-full bg-white/20 mx-auto" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs">
                    <span className={s.state === "pending" ? "text-muted-foreground" : "text-white"}>{s.label}</span>
                    <span className="text-muted-foreground">{s.detail}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full ${s.state === "done" ? "bg-emerald-400" : "gradient-primary"} transition-all`}
                      style={{ width: `${Math.round(s.progress * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {videoUrl ? (
        <video
          key={videoUrl}
          controls
          src={videoUrl}
          onError={onVideoError}
          onLoadedMetadata={onVideoLoaded}
          className={`${aspect} mx-auto rounded-xl bg-black w-full`}
        />
      ) : (
        <div className={`relative ${aspect} mx-auto rounded-xl overflow-hidden bg-black`}>
          <img
            key={idx}
            src={styleImage}
            alt={scene.visual}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: `scale(${1.05 + progress * 0.08})`, transition: "transform 100ms linear" }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

          <div className="absolute top-0 left-0 right-0 p-3 flex gap-1">
            {scenes.map((_, i) => (
              <div key={i} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                <div className="h-full bg-white" style={{ width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%` }} />
              </div>
            ))}
          </div>

          <div className="absolute top-6 left-4 right-4">
            <div className="text-[10px] uppercase tracking-widest text-white/70">{platform ?? "preview"}</div>
            <div className="text-sm text-white font-semibold line-clamp-1">{title}</div>
          </div>

          <div className="absolute bottom-16 left-4 right-4 text-white">
            <div className="inline-block text-[10px] uppercase tracking-widest bg-white/15 backdrop-blur px-2 py-0.5 rounded">
              Scene {scene.n} · {scene.duration}
            </div>
            <div className="mt-2 text-lg md:text-xl font-semibold leading-snug drop-shadow-lg">{scene.visual}</div>
            <div className="mt-1 text-xs md:text-sm text-white/80 italic">🎙 {scene.voiceover}</div>
          </div>

          <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3">
            <button
              onClick={() => { setIdx((i) => (i - 1 + totalScenes) % totalScenes); setProgress(0); }}
              className="w-9 h-9 rounded-full bg-white/10 backdrop-blur hover:bg-white/20 flex items-center justify-center text-white">
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="w-11 h-11 rounded-full gradient-primary text-white flex items-center justify-center shadow-lg">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <button
              onClick={() => { setIdx((i) => (i + 1) % totalScenes); setProgress(0); }}
              className="w-9 h-9 rounded-full bg-white/10 backdrop-blur hover:bg-white/20 flex items-center justify-center text-white">
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Video diagnostics panel */}
      {(videoUrl || diagnostics) && (
        <div className="mt-4 rounded-xl border border-border bg-black/30">
          <button
            onClick={() => setShowDiag((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs"
          >
            <span className="flex items-center gap-2">
              {diagnostics?.playbackError || diagnostics?.renderError || diagnostics?.uploadError
                ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                : <Bug className="w-3.5 h-3.5" />}
              Video diagnostics
              {diagnostics?.playbackError && <span className="text-rose-400">· playback error</span>}
              {autoRetryUsed && <span className="text-amber-400">· auto-retried</span>}
            </span>
            <span className="text-muted-foreground">{showDiag ? "Hide" : "Show"}</span>
          </button>
          {showDiag && (
            <div className="px-4 pb-4 text-xs space-y-2">
              <pre className="bg-black/50 rounded p-3 overflow-auto text-white/85 font-mono">
{JSON.stringify(diagnostics ?? { note: "No diagnostics recorded yet." }, null, 2)}
              </pre>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(diagnostics ?? {}, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `video-diagnostics-${Date.now()}.json`; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={!diagnostics}
                  className="rounded-lg glass border border-border px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Download className="w-3 h-3" /> Export diagnostics
                </button>
                {videoUrl && (
                  <button
                    onClick={() => {
                      setAutoRetryUsed(false);
                      if (lastRenderKindRef.current === "ugc") handleUgcRender();
                      else handleRender();
                    }}
                    disabled={rendering || ugcRendering}
                    className="rounded-lg gradient-primary text-white px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <RefreshCw className="w-3 h-3" /> Re-render now
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- diagnostics helpers ----------

type RetryEntry = {
  at: string;
  phase: "render" | "upload" | "playback" | "canceled";
  container?: "webm" | "mp4";
  mimeType?: string;
  blobSize?: number;
  error?: string;
  ok?: boolean;
};

type VideoDiagnostics = {
  renderedAt: string | null;
  mimeType: string | null;
  extension: string | null;
  durationSec: number | null;
  blobSize: number | null;
  blobType: string | null;
  uploadDurationMs: number | null;
  uploadError: string | null;
  renderError: string | null;
  playbackError: string | null;
  signedUrl: string | null;
  currentSrc: string | null;
  networkState: number | null;
  readyState: number | null;
  videoWidth: number | null;
  videoHeight: number | null;
  playableDurationSec: number | null;
  codecSupport: Record<string, string> | null;
  retries?: RetryEntry[];
};

function emptyDiag(): VideoDiagnostics {
  return {
    renderedAt: null, mimeType: null, extension: null, durationSec: null,
    blobSize: null, blobType: null, uploadDurationMs: null,
    uploadError: null, renderError: null, playbackError: null,
    signedUrl: null, currentSrc: null,
    networkState: null, readyState: null,
    videoWidth: null, videoHeight: null, playableDurationSec: null,
    codecSupport: null, retries: [],
  };
}

function probeCodecSupport(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const v = document.createElement("video");
  const types = [
    "video/webm; codecs=\"vp9, opus\"",
    "video/webm; codecs=\"vp8, vorbis\"",
    "video/webm",
    "video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\"",
    "video/mp4",
  ];
  const out: Record<string, string> = {};
  for (const t of types) out[t] = v.canPlayType(t) || "no";
  return out;
}

// ---------- stage rail ----------

type StageRow = { key: string; label: string; state: "pending" | "active" | "done"; progress: number; detail: string };

function buildStages(
  ugc: UgcStage | null,
  ugcRendering: boolean,
  storyboardRendering: boolean,
  storyboardProgress: number,
): StageRow[] {
  if (storyboardRendering) {
    return [
      { key: "record", label: "Recording canvas", state: storyboardProgress >= 1 ? "done" : "active", progress: storyboardProgress, detail: `${Math.round(storyboardProgress * 100)}%` },
      { key: "export", label: "Exporting file", state: storyboardProgress >= 1 ? "active" : "pending", progress: storyboardProgress >= 1 ? 0.5 : 0, detail: storyboardProgress >= 1 ? "encoding…" : "waiting" },
    ];
  }
  const order = ["script", "scenes", "images", "audio", "record", "export"] as const;
  const labels: Record<string, string> = {
    script: "Script",
    scenes: "Scene breakdown",
    images: "Scene images",
    audio: "Voiceovers",
    record: "Recording",
    export: "Export & upload",
  };
  const status: Record<string, StageRow> = {};
  for (const k of order) status[k] = { key: k, label: labels[k], state: "pending", progress: 0, detail: "" };
  // Script + scenes are already done by the time we reach here (generator ran on project create).
  status.script = { ...status.script, state: "done", progress: 1, detail: "ready" };
  status.scenes = { ...status.scenes, state: "done", progress: 1, detail: "ready" };

  if (!ugcRendering || !ugc) return order.map((k) => status[k]);

  if (ugc.kind === "images") {
    status.images = { ...status.images, state: ugc.done === ugc.total ? "done" : "active", progress: ugc.total ? ugc.done / ugc.total : 0, detail: `${ugc.done}/${ugc.total}` };
  } else {
    status.images = { ...status.images, state: "done", progress: 1, detail: "done" };
  }
  if (ugc.kind === "audio") {
    status.audio = { ...status.audio, state: ugc.done === ugc.total ? "done" : "active", progress: ugc.total ? ugc.done / ugc.total : 0, detail: `${ugc.done}/${ugc.total}` };
  } else if (ugc.kind === "render" || ugc.kind === "upload") {
    status.audio = { ...status.audio, state: "done", progress: 1, detail: "done" };
  }
  if (ugc.kind === "render") {
    status.record = { ...status.record, state: ugc.progress >= 1 ? "done" : "active", progress: ugc.progress, detail: `${Math.round(ugc.progress * 100)}%` };
  } else if (ugc.kind === "upload") {
    status.record = { ...status.record, state: "done", progress: 1, detail: "done" };
  }
  if (ugc.kind === "upload") {
    status.export = { ...status.export, state: "active", progress: 0.6, detail: "uploading…" };
  }
  return order.map((k) => status[k]);
}
