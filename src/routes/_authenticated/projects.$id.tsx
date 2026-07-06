import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { getStyleImage } from "@/lib/constants";
import { generateProject } from "@/lib/generators";
import { renderVideo, renderUgcVideo, generateSceneImage, type UgcStage } from "@/lib/video-renderer";
import { getOutput, saveOutput, type LocalOutput } from "@/lib/local-store";
import { isBlobKey, getDataURL } from "@/lib/blob-store";
import { toast } from "sonner";
import { Copy, Download, ArrowLeft, Loader2, Play, Pause, SkipForward, SkipBack, Film, RefreshCw, Video as VideoIcon, Sparkles, AlertTriangle, Bug, CheckCircle2, X, Package, Edit3, Save, Eye, EyeOff, ImageOff, Volume2, ChevronDown, ChevronRight, History, FileText, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$id")({ component: ProjectView });

// Force a browser download to the user's local machine, even when the URL is
// cross-origin (where the anchor `download` attribute is ignored).
// Trigger a real browser download synchronously inside the click handler.
// For Supabase Storage signed URLs, `?download=<name>` makes the server
// respond with Content-Disposition: attachment so the browser saves the
// file instead of navigating to it. Doing this synchronously (no await
// before .click()) preserves the user-gesture flag that browsers require
// to allow downloads.
function forceDownloadUrl(url: string, filename: string) {
  try {
    const u = new URL(url, window.location.href);
    u.searchParams.set("download", filename);
    const a = document.createElement("a");
    a.href = u.toString();
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.open(url, "_blank", "noopener");
    toast.message("Opened in a new tab — right-click → Save video as…");
  }
}


function ProjectView() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState<null | "all" | "script" | "scenes" | "captions" | "images">(null);
  const [bundling, setBundling] = useState(false);

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

  const project = data?.project ?? null;
  const output = data?.output ?? null;

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }

  function download() {
    const blob = new Blob([JSON.stringify({ project, output }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(project?.title ?? "project").replace(/[^\w]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }





  function formatPostText(): string {
    const caption = (output?.captions ?? "").trim();
    const tags = (output?.hashtags ?? [])
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .join(" ")
      .trim();
    // Two blank lines between caption and hashtags is the format most
    // Instagram/TikTok/Reels tools expect for a "ready to post" body.
    return [caption, tags].filter(Boolean).join("\n\n.\n.\n.\n");
  }

  async function copyPostText() {
    const text = formatPostText();
    if (!text) return toast.error("Nothing to copy yet — generate captions first");
    await navigator.clipboard.writeText(text);
    toast.success("Post text copied — ready to paste");
  }

  function slugify(s: string) {
    return (s || "post").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "post";
  }

  async function readyToPost() {
    if (!project || !output) return toast.error("Nothing to bundle yet");
    setBundling(true);
    try {
      const zip = new JSZip();
      const slug = slugify(project.title);

      // Human-readable post text (caption + hashtags)
      const postText = formatPostText();
      if (postText) zip.file("post.txt", postText);

      // Script + hook
      if (output.script) {
        const script = [output.hook ? `HOOK: ${output.hook}\n` : "", output.script].join("\n");
        zip.file("script.txt", script);
      }

      // Scene breakdown for reels
      if (output.scenes?.length) {
        const scenesText = output.scenes.map((s) => `SCENE ${s.n} (${s.duration})\nVisual: ${s.visual}\nVoiceover: ${s.voiceover}`).join("\n\n");
        zip.file("scenes.txt", scenesText);
      }

      // Image prompts
      if (output.image_prompts?.length) {
        zip.file("image-prompts.txt", output.image_prompts.map((p) => `#${p.n} [${p.style}]\n${p.prompt}`).join("\n\n"));
      }

      // Carousel per-slide script if present
      if (output.carousel_slides?.length) {
        const slides = output.carousel_slides.map((s) => `SLIDE ${s.n} — ${s.role}\n${s.headline}\n\n${s.body}\n\nVisual: ${s.visual}`).join("\n\n---\n\n");
        zip.file("carousel-script.txt", slides);
      }

      // Carousel slide images (resolve IDB blob keys → data URLs)
      const refs = output.carousel_images ?? [];
      for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        if (!ref) continue;
        try {
          const dataURL = isBlobKey(ref) ? await getDataURL(ref) : ref;
          if (!dataURL || !dataURL.startsWith("data:")) continue;
          const base64 = dataURL.replace(/^data:image\/\w+;base64,/, "");
          zip.file(`images/slide-${String(i + 1).padStart(2, "0")}.png`, base64, { base64: true });
        } catch { /* skip broken slide */ }
      }

      // Video render (short reels / long video)
      if (output.video_url) {
        try {
          const res = await fetch(output.video_url);
          if (res.ok) {
            const blob = await res.blob();
            const ext = blob.type.includes("mp4") ? "mp4" : "webm";
            zip.file(`video.${ext}`, blob);
          }
        } catch { /* signed url may have expired; skip */ }
      }

      // Diagnostics + full JSON snapshot for debugging
      if (output.render_diagnostics) {
        zip.file("diagnostics.json", JSON.stringify(output.render_diagnostics, null, 2));
      }
      zip.file("project.json", JSON.stringify({ project, output: { ...output, carousel_images: refs.map((r, i) => (r ? `images/slide-${String(i + 1).padStart(2, "0")}.png` : null)) } }, null, 2));

      // Manifest so downstream tooling knows what's inside
      zip.file("README.txt", [
        `${output.title ?? project.title}`,
        "",
        "Contents:",
        "- post.txt          Caption + hashtags in ready-to-paste format",
        "- script.txt        Hook + full script",
        "- scenes.txt        Scene-by-scene breakdown (reels)",
        "- image-prompts.txt B-roll / image prompts",
        "- carousel-script.txt Per-slide carousel copy",
        "- images/           Carousel slide PNGs",
        "- video.*           Rendered reel/long video",
        "- diagnostics.json  Render + slide diagnostics",
        "- project.json      Full metadata snapshot",
      ].join("\n"));

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${slug}-ready-to-post.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Ready-to-post bundle downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bundle failed");
    } finally {
      setBundling(false);
    }
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


  const scenes = (output?.scenes as Array<{ n: number; visual: string; voiceover: string; duration: string; on_screen_text?: string }>) ?? [];
  const prompts = (output?.image_prompts as Array<{ n: number; prompt: string; style: string }>) ?? [];
  const thumbs = (output?.thumbnail_ideas as string[]) ?? [];

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!project) {
    return <div className="glass rounded-2xl p-12 text-center">Project not found. <Link to="/dashboard" className="text-[color:var(--neon-purple)]">Back to dashboard</Link></div>;
  }

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
          <button
            data-testid="copy-post-text"
            onClick={copyPostText}
            disabled={!output?.captions && (output?.hashtags?.length ?? 0) === 0}
            className="rounded-lg glass px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5 disabled:opacity-60"
            title="Copy caption + hashtags in ready-to-paste format"
          >
            <Copy className="w-4 h-4" /> Copy post text
          </button>
          <button onClick={download} className="rounded-lg glass px-4 py-2 text-sm flex items-center gap-2 hover:bg-white/5"><Download className="w-4 h-4" /> Download JSON</button>
          <button
            data-testid="ready-to-post"
            onClick={readyToPost}
            disabled={bundling || !output}
            className="rounded-lg glass border border-[color:var(--neon-purple)]/50 hover:bg-white/5 px-4 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
            title="Bundle script, captions, hashtags, images, and diagnostics into one ZIP"
          >
            {bundling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            Ready to Post
          </button>
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
        <div className="glass rounded-2xl p-4 border border-[color:var(--neon-purple)]/30">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-[color:var(--neon-purple)] mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">Review before rendering</div>
              <div className="text-muted-foreground mt-0.5">
                Check the full script, scene breakdown, image prompts and your brand handles below.
                Edit anything you want, then scroll down and hit <span className="text-foreground font-medium">Re-generate UGC video</span> to render.
              </div>
            </div>
          </div>
        </div>
      )}

      {project.content_type !== "carousel" && (
        <BrandPrompt projectId={project.id} platform={project.platform ?? "instagram"} />
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Script */}
        <CollapsibleCard id={`sec:script:${project.id}`} title="Full Script" icon={<FileText className="w-4 h-4 text-[color:var(--neon-purple)]" />} className="lg:col-span-2">
          <pre className="text-sm whitespace-pre-wrap text-muted-foreground font-mono leading-relaxed">{output?.script}</pre>
        </CollapsibleCard>

        {/* Scenes */}
        <CollapsibleCard id={`sec:scenes:${project.id}`} title="Scene Breakdown" icon={<Film className="w-4 h-4 text-[color:var(--neon-purple)]" />}>
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
        </CollapsibleCard>

        {/* Image prompts */}
        <CollapsibleCard id={`sec:prompts:${project.id}`} title="Image Prompts (B-roll)" icon={<Wand2 className="w-4 h-4 text-[color:var(--neon-purple)]" />}>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {prompts.map((p) => (
              <div key={p.n} className="border border-border/50 rounded-lg p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1">Shot #{p.n} · {p.style}</div>
                {p.prompt}
              </div>
            ))}
          </div>
        </CollapsibleCard>

        {/* Captions & hashtags */}
        <CollapsibleCard id={`sec:captions:${project.id}`} title="Captions & Hashtags" icon={<Copy className="w-4 h-4 text-[color:var(--neon-purple)]" />}>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">{output?.captions}</div>
          <h3 className="mt-4 font-semibold text-sm">Hashtags</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(output?.hashtags ?? []).map((h) => (
              <span key={h} className="text-xs glass px-2 py-1 rounded-full">{h}</span>
            ))}
          </div>
        </CollapsibleCard>

        {/* Thumbnails */}
        <CollapsibleCard id={`sec:thumbs:${project.id}`} title="Thumbnail Ideas" icon={<Sparkles className="w-4 h-4 text-[color:var(--neon-pink)]" />} className="lg:col-span-2">
          <div className="grid md:grid-cols-2 gap-3">
            {thumbs.map((t, i) => (
              <div key={i} className="border border-border/50 rounded-lg p-4 text-sm">
                <div className="text-xs text-[color:var(--neon-pink)] mb-1">Concept {i + 1}</div>
                {t}
              </div>
            ))}
          </div>
        </CollapsibleCard>
      </div>

      {project.content_type !== "carousel" && (
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

      <div className="glass rounded-2xl p-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><div className="text-xs text-muted-foreground">Voice</div><div className="font-medium">{project.voice}</div></div>
        <div><div className="text-xs text-muted-foreground">Music</div><div className="font-medium">{project.music}</div></div>
        <div><div className="text-xs text-muted-foreground">Topic</div><div className="font-medium">{project.topic}</div></div>
        <div><div className="text-xs text-muted-foreground">Audience</div><div className="font-medium">{project.audience || "—"}</div></div>
      </div>
    </div>
  );
}

type Scene = { n: number; visual: string; voiceover: string; duration: string; on_screen_text?: string };

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

  // --- Scene editor + image validation + on-screen-text toggle -----------
  const [showOnScreenText, setShowOnScreenText] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedScenes, setEditedScenes] = useState<Scene[]>(scenes);
  const [scenesDirty, setScenesDirty] = useState(false);
  const [sceneImages, setSceneImages] = useState<Array<string | null>>(() => scenes.map(() => null));
  const [imageErrors, setImageErrors] = useState<Array<string | null>>(() => scenes.map(() => null));
  const [imgBusy, setImgBusy] = useState<Set<number>>(new Set());
  const [validating, setValidating] = useState(false);
  const [playingScene, setPlayingScene] = useState<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // --- Per-scene image prompts (editable) --------------------------------
  const [editedPrompts, setEditedPrompts] = useState<string[]>(() =>
    scenes.map((s, i) => imagePrompts?.[i]?.prompt || s.visual || ""),
  );

  // --- Script version history --------------------------------------------
  type ScriptVersion = { at: string; scenes: Scene[]; prompts: string[] };
  const historyKey = `cv:script-history:${projectId}`;
  const [history, setHistory] = useState<ScriptVersion[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(historyKey) || "[]") as ScriptVersion[]; } catch { return []; }
  });
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef<string>("");

  // --- Collapsible panel state -------------------------------------------
  const [openPrep, setOpenPrep] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [openBundle, setOpenBundle] = useState(false);
  const [openProgress, setOpenProgress] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);

  useEffect(() => {
    setEditedScenes(scenes);
    setEditedPrompts(scenes.map((s, i) => imagePrompts?.[i]?.prompt || s.visual || ""));
    setScenesDirty(false);
    setSceneImages((prev) => (prev.length === scenes.length ? prev : scenes.map(() => null)));
    setImageErrors((prev) => (prev.length === scenes.length ? prev : scenes.map(() => null)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.length]);

  // Autosave: debounce scene / prompt edits, save to output + push a version.
  useEffect(() => {
    if (!scenesDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveState("saving");
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const nextPrompts = editedPrompts.map((p, i) => ({
          n: i + 1,
          prompt: p,
          style: imagePrompts?.[i]?.style || styleId || "cinematic",
        }));
        await saveOutput(projectId, { scenes: editedScenes, image_prompts: nextPrompts });
        const snap: ScriptVersion = { at: new Date().toISOString(), scenes: editedScenes, prompts: editedPrompts };
        const sig = JSON.stringify([snap.scenes, snap.prompts]);
        if (sig !== lastSnapshotRef.current) {
          lastSnapshotRef.current = sig;
          setHistory((prev) => {
            const next = [snap, ...prev].slice(0, 20);
            try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* quota */ }
            return next;
          });
        }
        setScenesDirty(false);
        setAutoSaveState("saved");
        setTimeout(() => setAutoSaveState("idle"), 1500);
      } catch {
        setAutoSaveState("idle");
      }
    }, 1200);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedScenes, editedPrompts, scenesDirty]);

  function restoreVersion(v: ScriptVersion) {
    setEditedScenes(v.scenes);
    setEditedPrompts(v.prompts);
    setScenesDirty(true);
    toast.success("Restored — autosaving…");
  }


  const isVertical = contentType === "short_reel" || platform === "tiktok" || platform === "instagram";
  const aspect = isVertical ? "aspect-[9/16] max-w-[340px]" : "aspect-video w-full";
  const totalScenes = scenes.length;
  const ratio = isVertical ? "9:16" : "16:9";

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

  // Prefer the user's edits (already saved) over the underlying scenes prop.
  const effectiveScenes: Scene[] = scenesDirty ? editedScenes : scenes;

  async function saveEditedScenes() {
    try {
      await saveOutput(projectId, { scenes: editedScenes });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      setScenesDirty(false);
      setEditing(false);
      toast.success("Script updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  function styleForScene(i: number): string {
    return imagePrompts?.[i]?.style || styleId || "cinematic";
  }
  function promptForScene(i: number): string {
    return (editedPrompts[i] ?? "").trim() || imagePrompts?.[i]?.prompt || effectiveScenes[i]?.visual || "";
  }

  async function generateOne(i: number) {
    if (imgBusy.has(i)) return;
    setImgBusy((s) => { const n = new Set(s); n.add(i); return n; });
    setImageErrors((prev) => { const n = [...prev]; n[i] = null; return n; });
    try {
      const url = await generateSceneImage(promptForScene(i), styleForScene(i), ratio);
      if (!url) throw new Error("Image service returned nothing");
      setSceneImages((prev) => { const n = [...prev]; n[i] = url; return n; });
    } catch (e) {
      setImageErrors((prev) => { const n = [...prev]; n[i] = e instanceof Error ? e.message : String(e); return n; });
    } finally {
      setImgBusy((s) => { const n = new Set(s); n.delete(i); return n; });
    }
  }

  async function validateAllImages() {
    if (totalScenes === 0) return;
    setValidating(true);
    try {
      await Promise.all(effectiveScenes.map((_, i) => (sceneImages[i] ? Promise.resolve() : generateOne(i))));
      const remaining = sceneImages.filter((v, i) => !v && !imageErrors[i]).length;
      toast.success(remaining === 0 ? "All scene images validated" : "Some scenes still failed — retry them below");
    } finally {
      setValidating(false);
    }
  }

  async function retryFailed() {
    const failed = effectiveScenes.map((_, i) => i).filter((i) => !sceneImages[i]);
    if (failed.length === 0) { toast.message("Nothing to retry"); return; }
    await Promise.all(failed.map((i) => generateOne(i)));
  }

  async function playSceneVoiceover(i: number) {
    const text = (effectiveScenes[i]?.voiceover ?? "").trim();
    if (!text) { toast.error("No voiceover text for this scene"); return; }
    try {
      if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current = null; }
      setPlayingScene(i);
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "alloy" }),
      });
      if (!res.ok) throw new Error(await res.text() || `TTS ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioElRef.current = audio;
      audio.onended = () => { setPlayingScene(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlayingScene(null); URL.revokeObjectURL(url); toast.error("Playback failed"); };
      await audio.play();
    } catch (e) {
      setPlayingScene(null);
      toast.error(e instanceof Error ? e.message : "Voiceover failed");
    }
  }

  const missingImages = effectiveScenes.map((_, i) => !sceneImages[i]).filter(Boolean).length;
  const readyImages = totalScenes - missingImages;

  async function downloadFinalBundle() {
    if (bundleBusy) return;
    setBundleBusy(true);
    try {
      const zip = new JSZip();
      const slug = (title || "video").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "video";
      const out = await getOutput(projectId);
      const finalScenes = effectiveScenes;
      // Script text
      const scriptText = finalScenes.map((s) =>
        `Scene ${s.n} (${s.duration}) — ${s.visual}\nOn-screen: ${s.on_screen_text || "—"}\nVoiceover: ${s.voiceover}`
      ).join("\n\n---\n\n");
      zip.file("script.txt", scriptText);
      zip.file("captions.txt", out?.captions ?? "");
      zip.file("hashtags.txt", (out?.hashtags ?? []).join(" "));
      const audioNotes = finalScenes.map((s) => `Scene ${s.n}: voice="alloy" | duration≈${s.duration} | line: ${s.voiceover}`).join("\n");
      zip.file("audio-notes.txt", audioNotes);
      zip.file("bundle.json", JSON.stringify({
        title, platform, contentType, styleId,
        scenes: finalScenes,
        image_prompts: editedPrompts.map((p, i) => ({ n: i + 1, prompt: p, style: styleForScene(i) })),
        captions: out?.captions ?? "",
        hashtags: out?.hashtags ?? [],
        voice: "alloy",
        video_url: videoUrl,
      }, null, 2));
      if (videoUrl) {
        try {
          const res = await fetch(videoUrl);
          if (res.ok) {
            const blob = await res.blob();
            const ext = blob.type.includes("mp4") ? "mp4" : "webm";
            zip.file(`video.${ext}`, blob);
          }
        } catch { /* signed URL might be expired */ }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${slug}-final.zip`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Final bundle downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bundle failed");
    } finally {
      setBundleBusy(false);
    }
  }


  async function handleRender(container?: "webm" | "mp4") {
    if (rendering || ugcRendering || totalScenes === 0) return;
    lastRenderKindRef.current = "storyboard";
    lastContainerRef.current = container;
    setRendering(true);
    setOpenProgress(true);
    setRenderProgress(0);
    setPlaying(false);
    setCanceled(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await renderVideo({
        title, platform, scenes: effectiveScenes, styleId, contentType,
        showOnScreenText,
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
    // Validation gate: any missing image blocks the render until the user
    // regenerates it (or explicitly skips via the "Retry failed" flow).
    if (missingImages > 0) {
      toast.error(`${missingImages} scene image${missingImages === 1 ? "" : "s"} still missing — validate & retry above first.`);
      return;
    }
    lastRenderKindRef.current = "ugc";
    lastContainerRef.current = container;
    setUgcRendering(true);
    setUgcStage({ kind: "images", done: totalScenes, total: totalScenes });
    setPlaying(false);
    setCanceled(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await renderUgcVideo({
        title, platform, contentType, styleId, scenes: effectiveScenes,
        imagePrompts,
        preloadedImages: sceneImages,
        showOnScreenText,
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
  const scene = effectiveScenes[idx] ?? scenes[idx];

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
            <button onClick={() => forceDownloadUrl(videoUrl, `${(title || "video").replace(/[^\w]+/g, "-")}.mp4`)} className="rounded-lg glass hover:bg-white/5 px-4 py-2 text-sm font-medium flex items-center gap-2">
              <Download className="w-4 h-4" /> Download video
            </button>
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

      {/* --- Scene prep, script editor, per-scene preview -------------------- */}
      <div className="mb-4 rounded-xl border border-border bg-black/30">
        <button
          onClick={() => setOpenPrep((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
        >
          <span className="flex items-center gap-2">
            {openPrep ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Edit3 className="w-4 h-4 text-[color:var(--neon-purple)]" /> Scene prep & script editor
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-2">
            <span>{readyImages}/{totalScenes} images ready</span>
            {autoSaveState === "saving" && <span className="flex items-center gap-1 text-amber-300"><Loader2 className="w-3 h-3 animate-spin" /> autosaving</span>}
            {autoSaveState === "saved" && <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3 h-3" /> saved</span>}
          </span>
        </button>

        {openPrep && (
        <div className="p-4 pt-0 space-y-4">
        <div className="flex items-center justify-end gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-xs cursor-pointer glass border border-border rounded-full px-3 py-1.5">
              <input
                type="checkbox"
                checked={showOnScreenText}
                onChange={(e) => setShowOnScreenText(e.target.checked)}
                className="accent-[color:var(--neon-purple)]"
              />
              {showOnScreenText ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              On-screen text overlays
            </label>
            <button
              onClick={validateAllImages}
              disabled={validating || rendering || ugcRendering}
              className="rounded-lg glass border border-border hover:bg-white/5 px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-60"
              title="Generate an image for every scene, mark any that fail"
            >
              {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Validate images {validating && `(${readyImages}/${totalScenes})`}
            </button>
            <button
              onClick={retryFailed}
              disabled={missingImages === 0 || validating || rendering || ugcRendering}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 px-3 py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry failed ({missingImages})
            </button>
            <button
              onClick={() => setEditing((v) => !v)}
              className="rounded-lg glass border border-border hover:bg-white/5 px-3 py-1.5 text-xs flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" /> {editing ? "Close editor" : "Edit script"}
            </button>
        </div>

        {/* Per-scene image validation progress */}
        {(validating || imgBusy.size > 0) && (
          <div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>Image validation progress</span>
              <span>{readyImages}/{totalScenes}</span>
            </div>
            <div className="flex gap-1">
              {effectiveScenes.map((_, i) => {
                const state = sceneImages[i] ? "done" : imgBusy.has(i) ? "active" : imageErrors[i] ? "err" : "pending";
                const cls = state === "done" ? "bg-emerald-400" : state === "active" ? "gradient-primary animate-pulse" : state === "err" ? "bg-rose-500" : "bg-white/15";
                return <div key={i} className={`flex-1 h-1.5 rounded-full ${cls}`} title={`Scene ${i + 1}: ${state}`} />;
              })}
            </div>
          </div>
        )}

        {missingImages > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 px-3 py-2 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              {missingImages} of {totalScenes} scene image{missingImages === 1 ? "" : "s"} still need generation.
              Video render is blocked until every scene has a valid image — use <b>Validate images</b> or the per-scene <b>Generate</b> buttons below.
            </span>
          </div>
        )}

        {editing && (
          <div className="rounded-lg border border-border bg-black/40 p-3 space-y-3 max-h-[520px] overflow-y-auto">
            {editedScenes.map((s, i) => (
              <div key={s.n} className="border border-border/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="gradient-primary text-white px-2 py-0.5 rounded">Scene {s.n}</span>
                  <span className="text-muted-foreground">{s.duration}</span>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Voiceover</div>
                  <textarea
                    value={s.voiceover}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditedScenes((prev) => prev.map((row, idx2) => idx2 === i ? { ...row, voiceover: v } : row));
                      setScenesDirty(true);
                    }}
                    rows={2}
                    className="w-full bg-input/50 border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[color:var(--neon-purple)]"
                  />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">On-screen text (optional)</div>
                  <textarea
                    value={s.on_screen_text ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditedScenes((prev) => prev.map((row, idx2) => idx2 === i ? { ...row, on_screen_text: v } : row));
                      setScenesDirty(true);
                    }}
                    rows={1}
                    placeholder="Short caption burned onto the frame — leave empty for none"
                    className="w-full bg-input/50 border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-[color:var(--neon-purple)]"
                  />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Wand2 className="w-3 h-3" /> Image prompt</span>
                    <button
                      onClick={() => generateOne(i)}
                      disabled={imgBusy.has(i) || validating || rendering || ugcRendering}
                      className="text-[10px] rounded-md gradient-primary text-white px-2 py-0.5 flex items-center gap-1 disabled:opacity-60"
                    >
                      {imgBusy.has(i) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Regenerate image
                    </button>
                  </div>
                  <textarea
                    value={editedPrompts[i] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditedPrompts((prev) => { const n = [...prev]; n[i] = v; return n; });
                      setScenesDirty(true);
                    }}
                    rows={3}
                    placeholder="Full image prompt for this scene"
                    className="w-full bg-input/50 border border-border rounded-md px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[color:var(--neon-purple)]"
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-black/60 backdrop-blur pt-2">
              <div className="text-[11px] text-muted-foreground">
                {autoSaveState === "saving" ? "Autosaving…" : autoSaveState === "saved" ? "All changes saved" : "Edits autosave after 1.2s"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditedScenes(scenes); setEditedPrompts(scenes.map((s, i) => imagePrompts?.[i]?.prompt || s.visual || "")); setScenesDirty(false); }}
                  className="rounded-lg glass border border-border px-3 py-1.5 text-xs"
                >Revert unsaved</button>
                <button
                  onClick={saveEditedScenes}
                  className="rounded-lg gradient-primary text-white px-3 py-1.5 text-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" /> Save now
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {effectiveScenes.map((s, i) => {
            const img = sceneImages[i];
            const err = imageErrors[i];
            const busy = imgBusy.has(i);
            return (
              <div key={s.n} className="relative rounded-lg overflow-hidden border border-border bg-black/50 aspect-[9/16] flex flex-col">
                <div className="relative flex-1 bg-black">
                  {img ? (
                    <img src={img} alt={`Scene ${s.n}`} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : err ? <ImageOff className="w-5 h-5 text-rose-400" /> : <ImageOff className="w-5 h-5 opacity-40" />}
                    </div>
                  )}
                  {showOnScreenText && s.on_screen_text && (
                    <div className="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/70 to-transparent">
                      <div className="text-white text-[11px] font-bold leading-tight drop-shadow">{s.on_screen_text}</div>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
                    <div className="text-white text-[10px] font-medium leading-snug line-clamp-2 drop-shadow">{s.voiceover}</div>
                  </div>
                  <div className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-white/80">#{s.n}</div>
                  <div className={`absolute top-1 left-1 w-2 h-2 rounded-full ${img ? "bg-emerald-400" : busy ? "bg-amber-300 animate-pulse" : err ? "bg-rose-500" : "bg-white/30"}`} title={img ? "Ready" : busy ? "Generating" : err ? "Failed" : "Not generated"} />
                </div>
                <div className="flex items-center gap-1 p-1.5 bg-black/70 border-t border-border">
                  <button
                    onClick={() => generateOne(i)}
                    disabled={busy || validating || rendering || ugcRendering}
                    className="flex-1 text-[11px] rounded bg-white/10 hover:bg-white/20 px-1.5 py-1 flex items-center justify-center gap-1 disabled:opacity-50"
                    title={err ?? (img ? "Regenerate image" : "Generate image")}
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {img ? "Redo" : "Gen"}
                  </button>
                  <button
                    onClick={() => playSceneVoiceover(i)}
                    disabled={playingScene === i}
                    className="flex-1 text-[11px] rounded gradient-primary text-white px-1.5 py-1 flex items-center justify-center gap-1 disabled:opacity-70"
                    title="Play this scene's voiceover"
                  >
                    {playingScene === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                    Play
                  </button>
                </div>
                {err && (
                  <div className="absolute top-6 left-1 right-1 text-[9px] text-rose-300 bg-black/70 px-1.5 py-1 rounded" title={err}>
                    {err.slice(0, 60)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
        )}
      </div>

      {/* --- Version history ------------------------------------------------- */}
      <div className="mb-4 rounded-xl border border-border bg-black/30">
        <button
          onClick={() => setOpenHistory((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
        >
          <span className="flex items-center gap-2">
            {openHistory ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <History className="w-4 h-4 text-[color:var(--neon-purple)]" /> Script version history
          </span>
          <span className="text-xs text-muted-foreground">{history.length} snapshot{history.length === 1 ? "" : "s"}</span>
        </button>
        {openHistory && (
          <div className="px-4 pb-4">
            {history.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No versions yet. Edit the script above — each autosave creates a snapshot you can revert to.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {history.map((v, i) => (
                  <div key={v.at} className="flex items-center justify-between gap-2 text-xs border border-border/50 rounded-md px-3 py-2 bg-black/40">
                    <div className="min-w-0">
                      <div className="text-white/90">{i === 0 ? "Current" : `Version ${history.length - i}`}</div>
                      <div className="text-muted-foreground text-[10px]">{new Date(v.at).toLocaleString()} · {v.scenes.length} scenes</div>
                    </div>
                    <button
                      onClick={() => restoreVersion(v)}
                      disabled={i === 0}
                      className="rounded-md glass border border-border hover:bg-white/5 px-2.5 py-1 text-[11px] disabled:opacity-40"
                    >
                      {i === 0 ? "Latest" : "Restore"}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => { setHistory([]); try { localStorage.removeItem(historyKey); } catch { /* ignore */ } }}
                  className="text-[10px] text-muted-foreground hover:text-rose-400"
                >Clear history</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- Export bundle --------------------------------------------------- */}
      <div className="mb-4 rounded-xl border border-border bg-black/30">
        <button
          onClick={() => setOpenBundle((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
        >
          <span className="flex items-center gap-2">
            {openBundle ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Package className="w-4 h-4 text-[color:var(--neon-purple)]" /> Export & download
          </span>
          <span className="text-xs text-muted-foreground">{videoUrl ? "video ready" : "render video first"}</span>
        </button>
        {openBundle && (
          <div className="px-4 pb-4 space-y-3">
            <div className="text-xs text-muted-foreground">
              Downloads a ZIP with the rendered video, final script, captions, hashtags, image prompts, and audio notes.
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadFinalBundle}
                disabled={bundleBusy}
                className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-60"
              >
                {bundleBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                Download final bundle
              </button>
              {videoUrl && (
                <button onClick={() => forceDownloadUrl(videoUrl, `${(title || "video").replace(/[^\w]+/g, "-")}.mp4`)} className="rounded-lg glass border border-border hover:bg-white/5 px-4 py-2 text-sm flex items-center gap-2">
                  <VideoIcon className="w-4 h-4" /> Video only
                </button>
              )}
              <button
                onClick={() => {
                  const txt = effectiveScenes.map((s) => `Scene ${s.n} (${s.duration})\nOn-screen: ${s.on_screen_text || "—"}\nVoiceover: ${s.voiceover}`).join("\n\n---\n\n");
                  const blob = new Blob([txt], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = "script.txt"; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="rounded-lg glass border border-border hover:bg-white/5 px-4 py-2 text-sm flex items-center gap-2"
              >
                <FileText className="w-4 h-4" /> Script only
              </button>
            </div>
          </div>
        )}
      </div>




      {canceled && !rendering && !ugcRendering && (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200 px-4 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Render was canceled. Progress rail below shows the stages reached before cancel.
        </div>
      )}

      {(rendering || ugcRendering) && (
        <div className="mb-4 rounded-xl border border-border bg-black/30">
          <button
            onClick={() => setOpenProgress((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs"
          >
            <span className="flex items-center gap-2 text-white">
              {openProgress ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[color:var(--neon-pink)]" />
              Real-time render progress
            </span>
            <span className="text-muted-foreground">{stages.filter((s) => s.state === "done").length}/{stages.length} stages</span>
          </button>
          {openProgress && (
            <div className="px-4 pb-4 space-y-2">
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
              {/* Per-scene dot rail for image + audio stages */}
              {ugcRendering && ugcStage && (ugcStage.kind === "images" || ugcStage.kind === "audio") && (
                <div className="pt-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Per-scene {ugcStage.kind === "images" ? "image" : "voiceover"} status
                  </div>
                  <div className="flex gap-1">
                    {effectiveScenes.map((_, i) => {
                      const done = i < ugcStage.done;
                      const active = i === ugcStage.done;
                      const cls = done ? "bg-emerald-400" : active ? "gradient-primary animate-pulse" : "bg-white/15";
                      return <div key={i} className={`flex-1 h-1.5 rounded-full ${cls}`} title={`Scene ${i + 1}`} />;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
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

// -------------------- Collapsible card + brand prompt -------------------

function CollapsibleCard({
  id, title, icon, className, defaultOpen = false, children,
}: {
  id: string;
  title: string;
  icon?: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const storageKey = `cv:collapse:${id}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const v = window.localStorage.getItem(storageKey);
    return v == null ? defaultOpen : v === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem(storageKey, open ? "1" : "0"); } catch { /* quota */ }
  }, [open, storageKey]);
  return (
    <div className={`glass rounded-2xl p-6 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <h2 className="font-semibold flex items-center gap-2">{icon}{title}</h2>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

const PLATFORM_HANDLE_META: Record<string, { fieldLabel: string; placeholder: string; noun: string; prefix: string }> = {
  youtube:   { fieldLabel: "YouTube channel",  placeholder: "@yourchannel or channel name", noun: "YouTube channel",  prefix: "" },
  instagram: { fieldLabel: "Instagram handle", placeholder: "@yourhandle",                  noun: "Instagram handle", prefix: "@" },
  tiktok:    { fieldLabel: "TikTok handle",    placeholder: "@yourhandle",                  noun: "TikTok handle",    prefix: "@" },
  facebook:  { fieldLabel: "Facebook page",    placeholder: "Your Facebook page",           noun: "Facebook page",    prefix: "" },
  linkedin:  { fieldLabel: "LinkedIn handle",  placeholder: "your-linkedin-slug",           noun: "LinkedIn handle",  prefix: "" },
};

function BrandPrompt({ projectId, platform }: { projectId: string; platform: string }) {
  const meta = PLATFORM_HANDLE_META[platform] ?? PLATFORM_HANDLE_META.instagram;
  const storageKey = `cv:brand:${projectId}`;
  const collapseKey = `cv:collapse:brand:${projectId}`;
  const [brand, setBrand] = useState("");
  const [handle, setHandle] = useState("");
  const [saved, setSaved] = useState<{ brand: string; handle: string } | null>(null);
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(collapseKey) === "1";
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const v = JSON.parse(raw) as { brand?: string; handle?: string };
        setBrand(v.brand ?? "");
        setHandle(v.handle ?? "");
        if (v.brand || v.handle) setSaved({ brand: v.brand ?? "", handle: v.handle ?? "" });
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    try { window.localStorage.setItem(collapseKey, open ? "1" : "0"); } catch { /* quota */ }
  }, [open, collapseKey]);

  function save() {
    const normalizedHandle = handle.trim().replace(/^@+/, "");
    const value = { brand: brand.trim(), handle: normalizedHandle };
    try { window.localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* quota */ }
    setHandle(normalizedHandle);
    setSaved(value);
    toast.success("Brand saved — we'll bake it into future generations");
  }

  const hasSaved = !!(saved?.brand || saved?.handle);
  const displayHandle = saved?.handle ? `${meta.prefix}${saved.handle}` : "";
  const followLine = saved?.handle
    ? `Follow ${displayHandle} for more like this`
    : saved?.brand
      ? `Follow ${saved.brand} for more like this`
      : "";

  return (
    <div className="glass rounded-2xl p-6 border border-[color:var(--neon-purple)]/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[color:var(--neon-pink)]" />
          Your brand / {meta.noun}
          {hasSaved && <span className="text-xs text-muted-foreground font-normal">· {displayHandle || saved?.brand}</span>}
        </h2>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Whenever a script, caption or slide ends with a <em>"follow for more"</em> style call-to-action,
            we'll swap in your brand name or <span className="text-white">{meta.noun.toLowerCase()}</span> so every carousel and video
            drives viewers back to you. Fill this in once per project.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground space-y-1">
              <span>Brand name</span>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Northwind Studio"
                maxLength={80}
                className="w-full rounded-lg bg-black/30 border border-border px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground space-y-1">
              <span>{meta.fieldLabel}</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={meta.placeholder}
                maxLength={60}
                className="w-full rounded-lg bg-black/30 border border-border px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              {followLine ? <>Will render as: <span className="text-white">{followLine}</span></> : "No CTA saved yet."}
            </div>
            <button
              type="button"
              onClick={save}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> Save brand
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
