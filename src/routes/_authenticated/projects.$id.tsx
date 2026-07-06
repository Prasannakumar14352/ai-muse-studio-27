import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStyleImage } from "@/lib/constants";
import { generateProject } from "@/lib/generators";
import { renderVideo, renderUgcVideo, type UgcStage } from "@/lib/video-renderer";
import { toast } from "sonner";
import { Copy, Download, ArrowLeft, Loader2, Play, Pause, SkipForward, SkipBack, Film, RefreshCw, Video as VideoIcon, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$id")({ component: ProjectView });

function ProjectView() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const [{ data: project }, { data: output }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("generated_outputs").select("*").eq("project_id", id).maybeSingle(),
      ]);
      return { project, output };
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data?.project) {
    return <div className="glass rounded-2xl p-12 text-center">Project not found. <Link to="/projects" className="text-[color:var(--neon-purple)]">Back to library</Link></div>;
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
      const patch: Record<string, unknown> = {};
      if (part === "all" || part === "script") { patch.script = fresh.script; patch.hook = fresh.hook; patch.title = fresh.title; }
      if (part === "all" || part === "scenes") { patch.scenes = fresh.scenes; patch.thumbnail_ideas = fresh.thumbnail_ideas; }
      if (part === "all" || part === "captions") { patch.captions = fresh.captions; patch.hashtags = fresh.hashtags; }
      if (part === "all" || part === "images") { patch.image_prompts = fresh.image_prompts; }

      if (output?.id) {
        const { error } = await supabase.from("generated_outputs").update(patch as never).eq("id", output.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("Not signed in");
        const { error } = await supabase.from("generated_outputs").insert({
          project_id: project.id, user_id: u.user.id,
          title: fresh.title, hook: fresh.hook, script: fresh.script,
          scenes: fresh.scenes, image_prompts: fresh.image_prompts,
          captions: fresh.captions, hashtags: fresh.hashtags,
          thumbnail_ideas: fresh.thumbnail_ideas,
        });
        if (error) throw error;
      }
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
      <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to library
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


      {/* Video Preview — auto-playing storyboard reel */}
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
      />





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
  projectId, userId, outputId, existingVideoUrl,
}: {
  scenes: Scene[]; title: string; styleImage: string;
  styleId?: string | null;
  platform?: string | null; contentType?: string | null; music?: string | null;
  projectId: string; userId: string; outputId: string | null; existingVideoUrl: string | null;
}) {
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(existingVideoUrl);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  const isVertical = contentType === "short_reel" || platform === "tiktok" || platform === "instagram";
  const aspect = isVertical ? "aspect-[9/16] max-w-[340px]" : "aspect-video w-full";
  const totalScenes = scenes.length;

  useEffect(() => { setVideoUrl(existingVideoUrl); }, [existingVideoUrl]);

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

  async function handleRender() {
    if (rendering || totalScenes === 0) return;
    setRendering(true);
    setRenderProgress(0);
    setPlaying(false);
    try {
      const result = await renderVideo({
        title, platform, scenes, styleId, contentType,
        onProgress: setRenderProgress,
      });
      // Upload to Supabase Storage under <userId>/<projectId>.<ext>
      const path = `${userId}/${projectId}-${Date.now()}.${result.extension}`;
      const { error: upErr } = await supabase.storage.from("renders").upload(path, result.blob, {
        contentType: result.mimeType, upsert: true,
      });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("renders").createSignedUrl(path, 60 * 60 * 24 * 7);
      const url = signed?.signedUrl ?? null;
      // Persist URL on the output row
      if (outputId && url) {
        await supabase.from("generated_outputs").update({ video_url: url } as never).eq("id", outputId);
      }
      setVideoUrl(url);
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success(`Rendered ${result.durationSec.toFixed(1)}s ${result.extension.toUpperCase()} — saved to your library.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Render failed");
    } finally {
      setRendering(false);
    }
  }

  if (totalScenes === 0) return null;
  const scene = scenes[idx];

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
            onClick={handleRender}
            disabled={rendering}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium shadow-[var(--shadow-glow)] disabled:opacity-60 flex items-center gap-2">
            {rendering
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Rendering {Math.round(renderProgress * 100)}%</>
              : <><VideoIcon className="w-4 h-4" /> {videoUrl ? "Re-render video" : "Render video"}</>}
          </button>
        </div>
      </div>

      {videoUrl ? (
        <video controls src={videoUrl} className={`${aspect} mx-auto rounded-xl bg-black w-full`} />
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
    </div>
  );
}
