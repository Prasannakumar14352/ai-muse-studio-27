// Videos module: modular agent pipeline.
//
// Session-only state — nothing here writes to the database. Every agent has a
// clean input/output contract (structured JSON) so real providers (OpenAI,
// ElevenLabs, Runway, Replicate, FFmpeg/Remotion, YouTube API) can be dropped
// in later without touching the UI.

import { generateAiVideoScript, type AiVideoScript, type AiVideoScene } from "@/lib/video-ai.functions";

// ---------- Shared types ----------

export type VideoType = "youtube_long" | "shorts" | "reels" | "tiktok";
export type DurationSec = 30 | 60 | 180 | 300 | 540 | 720;
export type StyleId =
  | "3d"
  | "ghibli"
  | "anime"
  | "realistic"
  | "pixar"
  | "cinematic"
  | "documentary"
  | "dark_mystery"
  | "luxury"
  | "cyberpunk"
  | "minimal_product"
  | "futuristic";
export type VoiceId = "male" | "female" | "documentary_narrator";
export type AspectRatio = "16:9" | "9:16" | "1:1";

export type VideoBrief = {
  title: string;
  videoType: VideoType;
  duration: DurationSec;
  style: StyleId;
  voice: VoiceId;
  aspectRatio: AspectRatio;
};

export type ResearchBrief = {
  topic: string;
  angle: string;
  audience: string;
  key_points: string[];
  sources: string[];
};

export type StoryboardShot = {
  n: number;
  role: string;
  duration_sec: number;
  camera: string;
  description: string;
};
export type Storyboard = { shots: StoryboardShot[] };

export type DirectorPlan = {
  pacing: string;
  transitions: string[];
  color_grade: string;
  music_direction: string;
  sfx_moments: string[];
};

export type VisualAsset = { n: number; kind: "image" | "clip"; url: string; duration_sec: number };
export type VoiceoverClip = { n: number; url: string; duration_sec: number; text: string };
export type SubtitleTrack = { format: "vtt" | "srt"; content: string };
export type MusicTrack = { url: string; mood: string; duration_sec: number };
export type SfxClip = { n: number; url: string; label: string };

export type Timeline = {
  scenes: Array<{
    n: number;
    start_sec: number;
    end_sec: number;
    voiceover: string;
    on_screen_text: string;
    visual: VisualAsset;
  }>;
  total_sec: number;
};

export type RenderResult = {
  video_url: string;      // final MP4 (mock: blob URL)
  mime: string;
  duration_sec: number;
  aspect_ratio: AspectRatio;
};

export type ThumbnailResult = { url: string; alt: string };

export type SeoResult = {
  youtube_title: string;
  youtube_description: string;
  hashtags: string[];
};

export type PipelineResult = {
  brief: VideoBrief;
  research: ResearchBrief;
  script: AiVideoScript;
  storyboard: Storyboard;
  direction: DirectorPlan;
  visuals: VisualAsset[];
  voiceover: VoiceoverClip[];
  subtitles: SubtitleTrack;
  music: MusicTrack;
  sfx: SfxClip[];
  timeline: Timeline;
  render: RenderResult;
  thumbnail: ThumbnailResult;
  seo: SeoResult;
};

// ---------- Pipeline step ids ----------

export const PIPELINE_STEPS = [
  { id: "research", label: "Researching topic" },
  { id: "script", label: "Writing script" },
  { id: "storyboard", label: "Creating storyboard" },
  { id: "direction", label: "Directing pacing & style" },
  { id: "visuals", label: "Generating visuals" },
  { id: "voiceover", label: "Generating narration" },
  { id: "subtitles", label: "Creating subtitles" },
  { id: "music", label: "Adding background music" },
  { id: "sfx", label: "Adding sound effects" },
  { id: "edit", label: "Editing video" },
  { id: "render", label: "Rendering final MP4" },
  { id: "thumbnail", label: "Generating thumbnail" },
  { id: "seo", label: "Generating SEO" },
] as const;

export type StepId = (typeof PIPELINE_STEPS)[number]["id"];
export type StepState = "pending" | "running" | "done" | "error";
export type StepStatus = { id: StepId; label: string; state: StepState; note?: string };

// ---------- Utilities ----------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STYLE_LABEL: Record<StyleId, string> = {
  cinematic_documentary: "Cinematic Documentary",
  realistic: "Realistic",
  futuristic: "Futuristic",
  business: "Business",
  educational: "Educational",
  dark_mystery: "Dark Mystery",
};

const VOICE_LABEL: Record<VoiceId, string> = {
  male: "Male",
  female: "Female",
  documentary_narrator: "Documentary Narrator",
};

const VIDEO_TYPE_TO_PLATFORM: Record<VideoType, string> = {
  youtube_long: "youtube",
  shorts: "youtube",
  reels: "instagram",
  tiktok: "tiktok",
};

function contentTypeFor(brief: VideoBrief): "long_video" | "short_reel" {
  return brief.videoType === "youtube_long" ? "long_video" : "short_reel";
}

// ---------- Agents ----------
// Each agent is a pure async function: (input) => structured JSON output.
// Swap the body with a real provider call without changing the pipeline.

export const ResearchAgent = {
  async run(brief: VideoBrief): Promise<ResearchBrief> {
    await wait(400);
    return {
      topic: brief.title,
      angle: `${STYLE_LABEL[brief.style]} take on "${brief.title}"`,
      audience: "General creators & curious viewers",
      key_points: [
        `Hook the viewer on ${brief.title} within 3 seconds`,
        "Deliver 3-5 high-retention beats",
        "Close with a clear CTA aligned to the platform",
      ],
      sources: ["internal knowledge (mock)"],
    };
  },
};

export const ScriptAgent = {
  async run(brief: VideoBrief, research: ResearchBrief): Promise<AiVideoScript> {
    // Real AI call via existing server function.
    const script = await generateAiVideoScript({
      data: {
        topic: research.topic,
        tone: STYLE_LABEL[brief.style],
        platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType],
        styleLabel: STYLE_LABEL[brief.style],
        contentType: contentTypeFor(brief),
        audience: research.audience,
        targetLengthSec: brief.duration,
      },
    });
    return script;
  },
};

export const StoryboardAgent = {
  async run(script: AiVideoScript): Promise<Storyboard> {
    await wait(300);
    const cameras = ["Wide establishing", "Medium close-up", "Overhead", "Tracking", "Static hero", "Push-in"];
    const shots = script.scenes.map((s: AiVideoScene, i) => ({
      n: s.n,
      role: s.role,
      duration_sec: parseSec(s.duration),
      camera: cameras[i % cameras.length],
      description: s.visual,
    }));
    return { shots };
  },
};

export const DirectorAgent = {
  async run(brief: VideoBrief, storyboard: Storyboard): Promise<DirectorPlan> {
    await wait(250);
    return {
      pacing: brief.videoType === "youtube_long" ? "Measured, breathing room between beats" : "Fast, punchy, 2-4s per shot",
      transitions: ["hard cut", "whip pan", "match cut"],
      color_grade: brief.style === "dark_mystery" ? "Teal & shadow, high contrast" : "Warm cinematic, filmic contrast",
      music_direction: `${STYLE_LABEL[brief.style]} underscore, tempo matches pacing`,
      sfx_moments: storyboard.shots.slice(0, 3).map((s) => `whoosh on shot ${s.n}`),
    };
  },
};

export const VisualGenerationAgent = {
  async run(brief: VideoBrief, script: AiVideoScript): Promise<VisualAsset[]> {
    await wait(600);
    // Mock: use a deterministic placeholder image per scene. Real provider
    // (Runway / Kling / Pika / Replicate / Stability / Flux) plugs in here.
    return script.scenes.map((s) => ({
      n: s.n,
      kind: "image" as const,
      url: placeholderImage(brief.aspectRatio, `Scene ${s.n}`),
      duration_sec: parseSec(s.duration),
    }));
  },
};

export const VoiceoverAgent = {
  async run(brief: VideoBrief, script: AiVideoScript): Promise<VoiceoverClip[]> {
    await wait(500);
    // Mock: real provider (ElevenLabs / PlayHT / OpenAI TTS) plugs in here.
    return script.scenes.map((s) => ({
      n: s.n,
      url: `mock://voice/${brief.voice}/${s.n}.mp3`,
      duration_sec: Math.max(2, Math.min(parseSec(s.duration), Math.ceil(s.voiceover.split(" ").length / 2.5))),
      text: s.voiceover,
    }));
  },
};

export const SubtitleAgent = {
  async run(script: AiVideoScript, voice: VoiceoverClip[]): Promise<SubtitleTrack> {
    await wait(200);
    let t = 0;
    const cues: string[] = ["WEBVTT", ""];
    voice.forEach((v, i) => {
      const start = t;
      const end = t + v.duration_sec;
      cues.push(`${i + 1}`);
      cues.push(`${vtt(start)} --> ${vtt(end)}`);
      cues.push(script.scenes[i]?.voiceover ?? v.text);
      cues.push("");
      t = end;
    });
    return { format: "vtt", content: cues.join("\n") };
  },
};

export const MusicAgent = {
  async run(brief: VideoBrief, total: number): Promise<MusicTrack> {
    await wait(250);
    return {
      url: `mock://music/${brief.style}.mp3`,
      mood: STYLE_LABEL[brief.style],
      duration_sec: total,
    };
  },
};

export const SoundEffectsAgent = {
  async run(direction: DirectorPlan): Promise<SfxClip[]> {
    await wait(200);
    return direction.sfx_moments.map((label, i) => ({
      n: i + 1,
      url: `mock://sfx/${i + 1}.mp3`,
      label,
    }));
  },
};

export const VideoEditingAgent = {
  async run(script: AiVideoScript, visuals: VisualAsset[], voice: VoiceoverClip[]): Promise<Timeline> {
    await wait(300);
    let t = 0;
    const scenes = script.scenes.map((s, i) => {
      const v = visuals[i];
      const vo = voice[i];
      const dur = Math.max(v?.duration_sec ?? 3, vo?.duration_sec ?? 0);
      const item = {
        n: s.n,
        start_sec: t,
        end_sec: t + dur,
        voiceover: s.voiceover,
        on_screen_text: s.on_screen_text ?? "",
        visual: v!,
      };
      t += dur;
      return item;
    });
    return { scenes, total_sec: t };
  },
};

export const RenderAgent = {
  async run(brief: VideoBrief, timeline: Timeline): Promise<RenderResult> {
    // Mock render: build a WebM in-browser from visuals + on-screen text so the
    // user sees a real preview. Real MP4 renderer (FFmpeg / Remotion) drops in
    // here without changing the UI.
    const dims =
      brief.aspectRatio === "16:9" ? { w: 1280, h: 720 } :
      brief.aspectRatio === "9:16" ? { w: 720, h: 1280 } :
      { w: 1024, h: 1024 };

    const canvas = document.createElement("canvas");
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const mime =
      ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) =>
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
      ) ?? "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<Blob>((res) => { rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || "video/webm" })); });

    // Pre-load imagery (placeholder gradient — no network needed).
    rec.start();
    const start = performance.now();
    const totalMs = Math.max(1000, timeline.total_sec * 1000);

    return await new Promise<RenderResult>((resolve) => {
      function frame(now: number) {
        const elapsed = now - start;
        const p = Math.min(1, elapsed / totalMs);
        const tSec = (p * timeline.total_sec);
        const scene = timeline.scenes.find((s) => tSec >= s.start_sec && tSec < s.end_sec) ?? timeline.scenes[timeline.scenes.length - 1];

        drawGradient(ctx, canvas.width, canvas.height, scene.n);
        drawFrameChrome(ctx, canvas.width, canvas.height, scene?.on_screen_text || `Scene ${scene?.n ?? 1}`);

        if (p < 1) requestAnimationFrame(frame);
        else rec.stop();
      }
      requestAnimationFrame(frame);

      done.then((blob) => {
        resolve({
          video_url: URL.createObjectURL(blob),
          mime: blob.type,
          duration_sec: timeline.total_sec,
          aspect_ratio: brief.aspectRatio,
        });
      });
    });
  },
};

export const ThumbnailAgent = {
  async run(brief: VideoBrief): Promise<ThumbnailResult> {
    await wait(200);
    return {
      url: placeholderImage(brief.aspectRatio === "9:16" ? "9:16" : "16:9", brief.title),
      alt: `${brief.title} — thumbnail`,
    };
  },
};

export const SeoAgent = {
  async run(brief: VideoBrief, script: AiVideoScript): Promise<SeoResult> {
    await wait(200);
    return {
      youtube_title: script.reel_title || script.title || brief.title,
      youtube_description: script.caption,
      hashtags: script.hashtags,
    };
  },
};

// ---------- Orchestrator ----------

export async function runVideoPipeline(
  brief: VideoBrief,
  onStep: (id: StepId, state: StepState, note?: string) => void
): Promise<PipelineResult> {
  const mark = async <T>(id: StepId, fn: () => Promise<T>): Promise<T> => {
    onStep(id, "running");
    try {
      const r = await fn();
      onStep(id, "done");
      return r;
    } catch (e) {
      onStep(id, "error", e instanceof Error ? e.message : String(e));
      throw e;
    }
  };

  const research = await mark("research", () => ResearchAgent.run(brief));
  const script = await mark("script", () => ScriptAgent.run(brief, research));
  const storyboard = await mark("storyboard", () => StoryboardAgent.run(script));
  const direction = await mark("direction", () => DirectorAgent.run(brief, storyboard));
  const visuals = await mark("visuals", () => VisualGenerationAgent.run(brief, script));
  const voiceover = await mark("voiceover", () => VoiceoverAgent.run(brief, script));
  const subtitles = await mark("subtitles", () => SubtitleAgent.run(script, voiceover));
  const timeline = await mark("edit", () => VideoEditingAgent.run(script, visuals, voiceover));
  const music = await mark("music", () => MusicAgent.run(brief, timeline.total_sec));
  const sfx = await mark("sfx", () => SoundEffectsAgent.run(direction));
  const render = await mark("render", () => RenderAgent.run(brief, timeline));
  const thumbnail = await mark("thumbnail", () => ThumbnailAgent.run(brief));
  const seo = await mark("seo", () => SeoAgent.run(brief, script));

  return { brief, research, script, storyboard, direction, visuals, voiceover, subtitles, music, sfx, timeline, render, thumbnail, seo };
}

// ---------- helpers ----------

function parseSec(d: string): number {
  const m = /([\d.]+)/.exec(d ?? "");
  const n = m ? parseFloat(m[1]) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

function vtt(sec: number): string {
  const h = Math.floor(sec / 3600).toString().padStart(2, "0");
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
  const s = (sec % 60).toFixed(3).padStart(6, "0");
  return `${h}:${m}:${s}`;
}

function placeholderImage(ratio: AspectRatio, label: string): string {
  const dims = ratio === "16:9" ? [1280, 720] : ratio === "9:16" ? [720, 1280] : [1024, 1024];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims[0]} ${dims[1]}">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#ec4899"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="50%" fill="white" font-family="system-ui,-apple-system,sans-serif" font-size="${Math.round(dims[0]/18)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeXml(label)}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&apos;" }[c] as string));
}

function drawGradient(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const hue1 = (seed * 47) % 360;
  const hue2 = (hue1 + 60) % 360;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, `hsl(${hue1} 80% 45%)`);
  g.addColorStop(1, `hsl(${hue2} 85% 25%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawFrameChrome(ctx: CanvasRenderingContext2D, w: number, h: number, caption: string) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, h - Math.round(h * 0.22), w, Math.round(h * 0.22));
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.round(w / 24)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapText(ctx, caption, w / 2, h - Math.round(h * 0.11), w * 0.86, Math.round(w / 20));
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

// ---------- static option lists (for the UI) ----------

export const VIDEO_TYPES: { id: VideoType; label: string }[] = [
  { id: "youtube_long", label: "YouTube Long Video" },
  { id: "shorts", label: "Shorts" },
  { id: "reels", label: "Reels" },
  { id: "tiktok", label: "TikTok" },
];

export const DURATIONS: { id: DurationSec; label: string }[] = [
  { id: 30, label: "30 sec" },
  { id: 60, label: "60 sec" },
  { id: 180, label: "3 min" },
  { id: 300, label: "5 min" },
  { id: 540, label: "9 min" },
  { id: 720, label: "12 min" },
];

export const STYLES: { id: StyleId; label: string }[] = (Object.keys(STYLE_LABEL) as StyleId[])
  .map((id) => ({ id, label: STYLE_LABEL[id] }));

export const VOICES: { id: VoiceId; label: string }[] = (Object.keys(VOICE_LABEL) as VoiceId[])
  .map((id) => ({ id, label: VOICE_LABEL[id] }));

export const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1"];
