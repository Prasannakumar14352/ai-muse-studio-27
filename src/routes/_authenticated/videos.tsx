import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Film, Loader2, CheckCircle2, Circle, AlertCircle, Download, Copy,
  Wand2, Youtube, Play, RefreshCw, Send,
} from "lucide-react";
import {
  runVideoPipeline,
  PIPELINE_STEPS,
  VIDEO_TYPES, DURATIONS, STYLES, VOICES, ASPECT_RATIOS,
  type VideoBrief, type VideoType, type DurationSec, type StyleId, type VoiceId, type AspectRatio,
  type StepId, type StepStatus, type PipelineResult,
} from "@/lib/video-agents";

export const Route = createFileRoute("/_authenticated/videos")({
  head: () => ({
    meta: [
      { title: "Videos — CreatorVaultAI" },
      { name: "description", content: "Generate a ready-to-post video from a single idea. Script, visuals, voice, music, subtitles, thumbnail and SEO in one flow." },
      { property: "og:title", content: "Videos — CreatorVaultAI" },
      { property: "og:description", content: "Generate a ready-to-post video from a single idea." },
    ],
  }),
  component: VideosPage,
});

type View = "input" | "processing" | "result";

function VideosPage() {
  const [view, setView] = useState<View>("input");
  const [brief, setBrief] = useState<VideoBrief | null>(null);
  const [steps, setSteps] = useState<StepStatus[]>(
    PIPELINE_STEPS.map((s) => ({ id: s.id, label: s.label, state: "pending" }))
  );
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(b: VideoBrief) {
    setBrief(b);
    setError(null);
    setResult(null);
    setSteps(PIPELINE_STEPS.map((s) => ({ id: s.id, label: s.label, state: "pending" })));
    setView("processing");
    try {
      const r = await runVideoPipeline(b, (id, state, note) => {
        setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state, note } : s)));
      });
      setResult(r);
      setView("result");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pipeline failed";
      setError(msg);
      toast.error(msg);
    }
  }

  function reset() {
    setView("input");
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold">AI <span className="gradient-text">Video Studio</span></h1>
        <p className="text-muted-foreground mt-1">
          One idea in, a ready-to-post video out — script, visuals, voice, music, subtitles, thumbnail, SEO.
        </p>
      </div>

      {view === "input" && <InputScreen onGenerate={start} />}
      {view === "processing" && <ProcessingScreen steps={steps} error={error} onCancel={reset} />}
      {view === "result" && result && <ResultScreen result={result} onAnother={() => brief && start(brief)} onNew={reset} />}
    </div>
  );
}

// ---------------- Input ----------------

function InputScreen({ onGenerate }: { onGenerate: (b: VideoBrief) => void }) {
  const [title, setTitle] = useState("");
  const [videoType, setVideoType] = useState<VideoType>("shorts");
  const [duration, setDuration] = useState<DurationSec>(60);
  const [style, setStyle] = useState<StyleId>("cinematic_documentary");
  const [voice, setVoice] = useState<VoiceId>("documentary_narrator");
  const [ratio, setRatio] = useState<AspectRatio>("9:16");

  // Sensible defaults per video type.
  const suggestedRatio = useMemo<AspectRatio>(
    () => (videoType === "youtube_long" ? "16:9" : "9:16"),
    [videoType]
  );

  function submit() {
    if (!title.trim()) return toast.error("Enter a video title or idea");
    onGenerate({ title: title.trim(), videoType, duration, style, voice, aspectRatio: ratio });
  }

  return (
    <div className="glass rounded-2xl p-6 space-y-6">
      <div>
        <label className="text-xs uppercase tracking-wider text-muted-foreground">Video title / idea</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Why AI will change filmmaking forever"
          className="mt-2 w-full glass rounded-lg px-4 py-3 outline-none focus:border-white/30 border border-border text-base"
        />
      </div>

      <FieldGroup label="Video type">
        <ChipRow
          options={VIDEO_TYPES}
          value={videoType}
          onChange={(v) => { setVideoType(v); setRatio(v === "youtube_long" ? "16:9" : "9:16"); }}
        />
      </FieldGroup>

      <FieldGroup label="Duration">
        <ChipRow options={DURATIONS} value={duration} onChange={setDuration} />
      </FieldGroup>

      <FieldGroup label="Style">
        <ChipRow options={STYLES} value={style} onChange={setStyle} />
      </FieldGroup>

      <FieldGroup label="Voice">
        <ChipRow options={VOICES} value={voice} onChange={setVoice} />
      </FieldGroup>

      <FieldGroup label={`Aspect ratio${ratio !== suggestedRatio ? ` (suggested: ${suggestedRatio})` : ""}`}>
        <ChipRow options={ASPECT_RATIOS.map((r) => ({ id: r, label: r }))} value={ratio} onChange={setRatio} />
      </FieldGroup>

      <div className="flex items-center justify-end pt-2">
        <button
          onClick={submit}
          className="rounded-lg gradient-primary text-white px-6 py-3 text-sm font-semibold flex items-center gap-2"
        >
          <Wand2 className="w-4 h-4" /> Generate video
        </button>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      {children}
    </div>
  );
}

function ChipRow<T extends string | number>({
  options, value, onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          className={`px-3.5 py-2 rounded-lg text-sm border transition ${
            value === o.id
              ? "gradient-primary text-white border-transparent"
              : "glass border-border hover:border-white/20"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Processing ----------------

function ProcessingScreen({
  steps, error, onCancel,
}: { steps: StepStatus[]; error: string | null; onCancel: () => void }) {
  const doneCount = steps.filter((s) => s.state === "done").length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-lg">Building your video</h2>
          <p className="text-sm text-muted-foreground">Each agent hands structured JSON to the next step.</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{pct}%</div>
          <div className="text-xs text-muted-foreground">{doneCount} / {steps.length} steps</div>
        </div>
      </div>

      <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden mb-6">
        <div className="h-full gradient-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-3 text-sm">
            {s.state === "done" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {s.state === "running" && <Loader2 className="w-5 h-5 animate-spin text-[color:var(--neon-purple)] shrink-0" />}
            {s.state === "pending" && <Circle className="w-5 h-5 text-muted-foreground/50 shrink-0" />}
            {s.state === "error" && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
            <span className={s.state === "pending" ? "text-muted-foreground" : ""}>{s.label}</span>
            {s.note && s.state === "error" && (
              <span className="text-xs text-rose-400">— {s.note}</span>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mt-6 flex items-center justify-between glass border border-rose-500/30 rounded-lg p-3">
          <div className="text-sm text-rose-300">{error}</div>
          <button onClick={onCancel} className="rounded-lg glass border border-border px-3 py-1.5 text-xs">
            Start over
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- Result ----------------

function ResultScreen({
  result, onAnother, onNew,
}: { result: PipelineResult; onAnother: () => void; onNew: () => void }) {
  const { render, thumbnail, subtitles, seo, brief } = result;

  function download(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function downloadText(text: string, filename: string, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    download(URL.createObjectURL(blob), filename);
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Copy failed");
    }
  }

  const isVertical = brief.aspectRatio === "9:16";

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* Video preview */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className={`bg-black ${isVertical ? "aspect-[9/16]" : brief.aspectRatio === "1:1" ? "aspect-square" : "aspect-video"} max-h-[70vh] mx-auto`}>
            <video
              src={render.video_url}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          </div>
          <div className="p-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => download(render.video_url, `${slug(seo.youtube_title)}.webm`)}
              className="rounded-lg gradient-primary text-white px-4 py-2 text-sm font-medium flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Download MP4
            </button>
            <button
              onClick={() => download(thumbnail.url, `${slug(seo.youtube_title)}-thumbnail.svg`)}
              className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Thumbnail
            </button>
            <button
              onClick={() => downloadText(subtitles.content, `${slug(seo.youtube_title)}.vtt`, "text/vtt")}
              className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Subtitles
            </button>
            <div className="flex-1" />
            <button
              onClick={onAnother}
              className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Another version
            </button>
            <button
              onClick={onNew}
              className="rounded-lg glass border border-border px-4 py-2 text-sm flex items-center gap-2"
            >
              <Play className="w-4 h-4" /> New video
            </button>
          </div>
        </div>

        {/* Side rail: thumbnail + publish */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Thumbnail</div>
            <img src={thumbnail.url} alt={thumbnail.alt} className="w-full rounded-lg bg-black" />
          </div>
          <button
            onClick={() => toast.info("YouTube publishing will connect soon")}
            className="w-full rounded-2xl glass border border-border p-4 text-sm flex items-center justify-center gap-2 hover:border-white/20 transition"
          >
            <Youtube className="w-5 h-5 text-rose-500" />
            <span>Publish to YouTube</span>
            <Send className="w-4 h-4 opacity-60" />
          </button>
        </div>
      </div>

      {/* SEO block */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold">SEO & metadata</h3>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">YouTube title</div>
            <CopyBtn onClick={() => copy(seo.youtube_title, "Title")} />
          </div>
          <div className="glass rounded-lg p-3 text-sm">{seo.youtube_title}</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">YouTube description</div>
            <CopyBtn onClick={() => copy(seo.youtube_description, "Description")} />
          </div>
          <div className="glass rounded-lg p-3 text-sm whitespace-pre-wrap">{seo.youtube_description}</div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Hashtags</div>
            <CopyBtn onClick={() => copy(seo.hashtags.join(" "), "Hashtags")} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {seo.hashtags.map((h) => (
              <span key={h} className="glass px-2 py-1 rounded text-xs">{h}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs text-muted-foreground hover:text-white flex items-center gap-1">
      <Copy className="w-3 h-3" /> Copy
    </button>
  );
}

function slug(s: string): string {
  return (s || "video").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "video";
}

// Ensure Film icon import is retained for potential empty states.
void Film;
