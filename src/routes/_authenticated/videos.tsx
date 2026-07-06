import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listOutputs, deleteOutput } from "@/lib/local-store";
import { LocalOnlyBanner } from "@/components/local-only-banner";
import { confirmDialog } from "@/components/confirm-dialog";
import { Plus, Film, Video as VideoIcon, Trash2, Loader2, Image as ImageIcon, Download, X, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => ({
    meta: [
      { title: "Videos — CreatorVaultAI" },
      { name: "description", content: "Every reel and long-form video you've generated, in one gallery." },
      { property: "og:title", content: "Videos — CreatorVaultAI" },
      { property: "og:description", content: "Every reel and long-form video you've generated, in one gallery." },
    ],
  }),
  component: VideosPage,
});

type VideoRow = {
  id: string; title: string; content_type: string | null;
  style: string | null; platform: string | null; tone: string | null;
  video_url: string | null;
};

function VideosPage() {
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: async (): Promise<VideoRow[]> => {
      const { data: projects } = await supabase
        .from("projects")
        .select("id,title,content_type,style,platform,tone")
        .in("content_type", ["short_reel", "long_video"])
        .order("created_at", { ascending: false });
      const outputs = await listOutputs();
      const outMap = new Map(outputs.map((o) => [o.project_id, o]));
      return (projects ?? []).map((p) => ({
        id: p.id, title: p.title, content_type: p.content_type,
        style: p.style, platform: p.platform, tone: p.tone,
        video_url: outMap.get(p.id)?.video_url ?? null,
      }));
    },
  });

  async function deleteVideo(row: VideoRow) {
    const ok = await confirmDialog({
      title: "Delete this video?",
      description: `"${row.title}" and its local render will be removed. This cannot be undone.`,
      confirmText: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await deleteOutput(row.id);
      const { error } = await supabase.from("projects").delete().eq("id", row.id);
      if (error) throw error;
      toast.success("Video deleted");
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <LocalOnlyBanner />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold">Your <span className="gradient-text">Videos</span></h1>
          <p className="text-muted-foreground mt-1">Reels and long-form videos you've rendered — stored in this browser.</p>
        </div>
        <Link to="/create" className="rounded-lg gradient-primary text-white px-4 py-2.5 text-sm font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" /> New video
        </Link>
      </div>

      <ImageToVideoCard />


      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="glass rounded-xl h-56 animate-pulse" />)}
        </div>
      ) : data && data.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((p) => {
            const isVertical = p.content_type === "short_reel" || p.platform === "tiktok" || p.platform === "instagram";
            return (
              <div key={p.id} className="glass rounded-xl overflow-hidden hover:border-white/20 transition group relative">
                <button
                  onClick={(e) => { e.stopPropagation(); deleteVideo(p); }}
                  disabled={deletingId === p.id}
                  className="absolute top-2 right-2 z-10 rounded-lg bg-black/70 hover:bg-rose-500/80 text-white p-1.5 opacity-0 group-hover:opacity-100 transition disabled:opacity-100"
                  title="Delete video"
                >
                  {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
                <Link to="/projects/$id" params={{ id: p.id }} className="block">
                  <div className={`relative ${isVertical ? "aspect-[4/5]" : "aspect-video"} bg-black overflow-hidden`}>
                    {p.video_url ? (
                      <video src={p.video_url} muted loop playsInline preload="metadata"
                        onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[color:var(--neon-purple)]/25 to-[color:var(--neon-pink)]/10">
                        <div className="text-center text-muted-foreground">
                          <Film className="w-10 h-10 mx-auto opacity-60" />
                          <div className="text-[10px] uppercase tracking-wider mt-1">No render yet</div>
                        </div>
                      </div>
                    )}
                    <div className="absolute top-2 left-2 flex gap-1">
                      <span className="text-[10px] uppercase tracking-wider bg-black/60 backdrop-blur text-white px-2 py-0.5 rounded">{p.content_type}</span>
                      {p.video_url && (
                        <span className="text-[10px] uppercase tracking-wider gradient-primary text-white px-2 py-0.5 rounded flex items-center gap-1">
                          <VideoIcon className="w-3 h-3" /> Video
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="font-semibold line-clamp-2">{p.title}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {p.style && <span className="glass px-2 py-0.5 rounded">{p.style}</span>}
                      {p.platform && <span className="glass px-2 py-0.5 rounded">{p.platform}</span>}
                      {p.tone && <span className="glass px-2 py-0.5 rounded">{p.tone}</span>}
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass rounded-2xl p-12 text-center">
          <Film className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No videos yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create a short reel or long-form video to fill this gallery.</p>
          <Link to="/create" className="mt-5 inline-flex rounded-lg gradient-primary px-5 py-2.5 text-sm text-white font-medium">
            <Plus className="w-4 h-4 mr-2" /> New video
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------- Image → Video ----------

function ImageToVideoCard() {
  const [image, setImage] = useState<string | null>(null);
  const [duration, setDuration] = useState(6);
  const [ratio, setRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [fit, setFit] = useState<"contain" | "cover">("contain");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    if (!f.type.startsWith("image/")) return toast.error("Please pick an image file");
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
    setVideoUrl(null);
  }

  async function render() {
    if (!image) return toast.error("Pick an image first");
    if (!("MediaRecorder" in window)) return toast.error("MediaRecorder not supported in this browser");
    setRendering(true); setProgress(0); setVideoUrl(null);
    try {
      const dims = ratio === "9:16" ? { w: 720, h: 1280 } : ratio === "1:1" ? { w: 1080, h: 1080 } : { w: 1280, h: 720 };
      const canvas = document.createElement("canvas");
      canvas.width = dims.w; canvas.height = dims.h;
      const ctx = canvas.getContext("2d")!;
      const img = new Image();
      img.src = image;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Image load failed")); });

      const stream = canvas.captureStream(30);
      const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || "video/webm" })); });

      const start = performance.now();
      const durMs = duration * 1000;
      rec.start();

      function drawFrame(t: number) {
        const p = Math.min(1, (t - start) / durMs);
        setProgress(p);
        const iw = img.width, ih = img.height;
        // contain = fit whole image (no crop, letterbox); cover = fill canvas (may crop edges)
        const baseScale = fit === "contain"
          ? Math.min(canvas.width / iw, canvas.height / ih)
          : Math.max(canvas.width / iw, canvas.height / ih);
        // Contain: gentle breathing that never overflows. Cover: full Ken Burns.
        const zoom = fit === "contain" ? 0.96 + p * 0.04 : 1 + p * 0.25;
        const panX = fit === "contain" ? 0 : (p - 0.5) * canvas.width * 0.1;
        const scale = baseScale * zoom;
        const dw = iw * scale, dh = ih * scale;
        const dx = (canvas.width - dw) / 2 + panX;
        const dy = (canvas.height - dh) / 2;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, dx, dy, dw, dh);
        if (p < 1) requestAnimationFrame(drawFrame);
        else rec.stop();
      }
      requestAnimationFrame(drawFrame);

      const blob = await done;
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      toast.success("Video rendered");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Render failed");
    } finally {
      setRendering(false); setProgress(1);
    }
  }

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><ImageIcon className="w-4 h-4 text-[color:var(--neon-pink)]" /> Image → Video</h2>
          <p className="text-xs text-muted-foreground mt-1">Turn any still into a Ken Burns pan-and-zoom clip. Rendered in your browser.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
          <button onClick={() => fileRef.current?.click()} className="rounded-lg glass border border-border px-3 py-2 text-sm flex items-center gap-2">
            <ImageIcon className="w-4 h-4" /> {image ? "Change image" : "Pick image"}
          </button>
          <button onClick={render} disabled={!image || rendering}
            className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {rendering ? <><Loader2 className="w-4 h-4 animate-spin" /> {Math.round(progress * 100)}%</> : <><Wand2 className="w-4 h-4" /> Render clip</>}
          </button>
        </div>
      </div>
      <div className="mt-4 grid md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Aspect ratio</div>
          <div className="flex gap-1">
            {(["9:16", "1:1", "16:9"] as const).map((r) => (
              <button key={r} onClick={() => setRatio(r)}
                className={`px-3 py-1.5 rounded-lg text-xs border ${ratio === r ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{r}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Fit</div>
          <div className="flex gap-1">
            {(["contain", "cover"] as const).map((f) => (
              <button key={f} onClick={() => setFit(f)}
                title={f === "contain" ? "Show full image (no crop, letterbox)" : "Fill frame (edges may crop)"}
                className={`px-3 py-1.5 rounded-lg text-xs border capitalize ${fit === f ? "gradient-primary text-white border-transparent" : "glass border-border"}`}>{f}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Duration ({duration}s)</div>
          <input type="range" min={3} max={15} value={duration} onChange={(e) => setDuration(parseInt(e.target.value))} className="w-full" />
        </div>
        <div className="text-xs text-muted-foreground">
          Output: WebM · in-browser only. Use <span className="text-white">Contain</span> for logos so text isn't cropped.
        </div>
      </div>
      {(image || videoUrl) && (
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {image && (
            <div className="relative">
              <div className="text-xs text-muted-foreground mb-1">Source</div>
              <img src={image} alt="source" className="rounded-lg w-full max-h-72 object-contain bg-black" />
              <button onClick={() => { setImage(null); setVideoUrl(null); }}
                className="absolute top-6 right-2 rounded-md bg-black/70 hover:bg-rose-500/80 text-white p-1">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {videoUrl && (
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                <span>Preview</span>
                <a href={videoUrl} download="image-to-video.webm" className="text-[color:var(--neon-purple)] hover:underline flex items-center gap-1">
                  <Download className="w-3 h-3" /> Download
                </a>
              </div>
              <video src={videoUrl} controls className="rounded-lg w-full max-h-72 bg-black" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
