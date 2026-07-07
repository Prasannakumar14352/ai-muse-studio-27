// Videos module: modular agent pipeline.
//
// Session-only state — nothing here writes to the database. Every agent has a
// clean input/output contract (structured JSON) so real providers can be
// swapped in without touching the UI.

import { generateAiVideoScript, generateAiVideoSeo, type AiVideoScript, type AiVideoScene, type AiVideoSeo } from "@/lib/video-ai.functions";
import { buildFallbackVideoScript } from "@/lib/video-fallback";
import { renderVideo, type RenderScene } from "@/lib/video-renderer";

// ---------- Shared types ----------

export type VideoType = "youtube_long" | "shorts" | "reels" | "tiktok";
export type DurationSec = 30 | 60 | 180 | 300 | 540 | 720;
export type StyleId =
  | "3d" | "ghibli" | "anime" | "realistic" | "pixar" | "cinematic"
  | "documentary" | "dark_mystery" | "luxury" | "cyberpunk" | "minimal_product" | "futuristic";
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

export type VisualAsset = { n: number; kind: "image" | "clip"; url: string; duration_sec: number; generated: boolean };
export type VoiceoverClip = { n: number; url: string | null; duration_sec: number; text: string; buffer: AudioBuffer | null };
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
  video_url: string;
  mime: string;
  extension: "mp4" | "webm";
  duration_sec: number;
  aspect_ratio: AspectRatio;
};

export type ThumbnailResult = { url: string; alt: string; generated: boolean };

export type SeoResult = AiVideoSeo;

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

// ---------- Style / voice descriptors ----------

const STYLE_LABEL: Record<StyleId, string> = {
  "3d": "3D",
  ghibli: "Ghibli-inspired",
  anime: "Anime",
  realistic: "Realistic",
  pixar: "Pixar-like",
  cinematic: "Cinematic",
  documentary: "Documentary",
  dark_mystery: "Dark Mystery",
  luxury: "Luxury",
  cyberpunk: "Cyberpunk",
  minimal_product: "Minimal Product",
  futuristic: "Futuristic",
};

// Rich visual descriptor injected into every image prompt so the selected
// style actually controls the output, thumbnail included.
const STYLE_DESCRIPTOR: Record<StyleId, string> = {
  "3d": "stylized 3D CGI render, vibrant colors, soft studio lighting, Pixar/Blender-quality shading",
  ghibli: "Studio Ghibli watercolor scene, hand-painted, Miyazaki nostalgia, warm afternoon light",
  anime: "modern anime illustration, cel-shaded, expressive characters, dynamic composition, saturated pop colors",
  realistic: "photorealistic 8k photograph, natural light, 85mm lens, magazine-grade sharpness, cinematic depth of field",
  pixar: "Pixar animated movie still, cute stylized characters, warm family-movie lighting",
  cinematic: "cinematic movie still, teal-and-orange color grade, anamorphic lens flare, moody wide shot, Hollywood atmosphere",
  documentary: "National Geographic documentary photography, candid realism, muted earthy tones, journalistic framing",
  dark_mystery: "noir mystery scene, deep shadows with rim light, atmospheric fog, thriller mood, black and midnight-blue palette",
  luxury: "luxury editorial photography, gold and cream palette, refined marble textures, high-end fashion lighting",
  cyberpunk: "cyberpunk neon street at night, rain-slicked pavement, pink and cyan signage, Blade Runner atmosphere",
  minimal_product: "minimal Scandinavian product shot, single subject on soft off-white, gentle shadows, calm negative space",
  futuristic: "sleek futuristic sci-fi, chrome and holographic UI, sterile lighting, near-future aesthetic",
};

const STYLE_ACCENT: Record<StyleId, string> = {
  "3d": "#c026d3", ghibli: "#22c55e", anime: "#ec4899", realistic: "#94a3b8",
  pixar: "#f97316", cinematic: "#6366f1", documentary: "#78716c", dark_mystery: "#0ea5e9",
  luxury: "#eab308", cyberpunk: "#f0abfc", minimal_product: "#a8a29e", futuristic: "#38bdf8",
};

// Map our voice ids to the TTS provider voices (/api/tts -> openai gpt-4o-mini-tts).
const VOICE_MAP: Record<VoiceId, string> = {
  male: "onyx",
  female: "nova",
  documentary_narrator: "ash",
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Agents ----------

export const ResearchAgent = {
  async run(brief: VideoBrief): Promise<ResearchBrief> {
    await wait(200);
    return {
      topic: brief.title,
      angle: `${STYLE_LABEL[brief.style]} take on "${brief.title}"`,
      audience: "General creators & curious viewers",
      key_points: [
        `Hook the viewer on ${brief.title} within 3 seconds`,
        "Deliver 3-5 high-retention beats",
        "Close with a clear CTA aligned to the platform",
      ],
      sources: ["internal knowledge"],
    };
  },
};

export const ScriptAgent = {
  async run(brief: VideoBrief, research: ResearchBrief, onRetry?: (attempt: number, error: unknown) => void): Promise<AiVideoScript> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
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
        logScriptJsonDebug(script);
        return script;
      } catch (error) {
        if (isHardAiFailure(error)) throw error;
        console.error("Script generation failed. Retrying...", error);
        onRetry?.(attempt, error);
        if (attempt < 3) await wait(700 * attempt);
      }
    }
    const sceneCount = Math.max(3, Math.min(120, Math.round(brief.duration / (brief.videoType === "youtube_long" ? 8 : 5))));
    const fallback = buildFallbackVideoScript(brief.title, sceneCount, brief.duration, brief.aspectRatio, STYLE_LABEL[brief.style]);
    return {
      ...fallback,
      debug_json: { raw_responses: [], parse_errors: ["Script generation used a structured fallback after 3 failed attempts."], attempts: 3, used_repair: false, used_fallback: true },
    };
  },
};

export const StoryboardAgent = {
  async run(script: AiVideoScript): Promise<Storyboard> {
    const cameras = ["Wide establishing", "Medium close-up", "Overhead", "Tracking", "Static hero", "Push-in"];
    const shots = script.scenes.map((s: AiVideoScene, i) => ({
      n: s.n, role: s.role, duration_sec: parseSec(s.duration),
      camera: cameras[i % cameras.length], description: s.visual,
    }));
    return { shots };
  },
};

export const DirectorAgent = {
  async run(brief: VideoBrief, storyboard: Storyboard): Promise<DirectorPlan> {
    return {
      pacing: brief.videoType === "youtube_long" ? "Measured, breathing room between beats" : "Fast, punchy, 2-4s per shot",
      transitions: ["hard cut", "whip pan", "match cut"],
      color_grade: `${STYLE_LABEL[brief.style]} grade — ${STYLE_ACCENT[brief.style]} accent`,
      music_direction: `${STYLE_LABEL[brief.style]} underscore, tempo matches pacing`,
      sfx_moments: storyboard.shots.slice(0, 3).map((s) => `whoosh on shot ${s.n}`),
    };
  },
};

// ---------- Visual generation (real AI image per scene) ----------

async function fetchSceneImage(prompt: string, style: StyleId, ratio: AspectRatio): Promise<string | null> {
  const styledPrompt = `${STYLE_DESCRIPTOR[style]}. ${prompt}. No text, no watermarks, no captions in the image.`;
  try {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: styledPrompt, style: STYLE_LABEL[style], ratio }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { image?: string };
    return json.image ?? null;
  } catch {
    return null;
  }
}

export const VisualGenerationAgent = {
  async run(
    brief: VideoBrief,
    script: AiVideoScript,
    onProgress?: (done: number, total: number) => void,
  ): Promise<VisualAsset[]> {
    const total = script.scenes.length;
    let done = 0;
    onProgress?.(0, total);
    const results = await Promise.all(
      script.scenes.map(async (s) => {
        const prompt = s.image_prompt || s.visual || `${brief.title} — scene ${s.n}`;
        const url = await fetchSceneImage(prompt, brief.style, brief.aspectRatio);
        done += 1;
        onProgress?.(done, total);
        return {
          n: s.n,
          kind: "image" as const,
          url: url ?? placeholderImage(brief.aspectRatio, `Scene ${s.n}`),
          duration_sec: parseSec(s.duration),
          generated: !!url,
        };
      }),
    );
    return results;
  },
};

// ---------- Voiceover (real TTS per scene) ----------

async function fetchSceneAudio(text: string, voice: VoiceId, ctx: AudioContext): Promise<{ blobUrl: string; buffer: AudioBuffer } | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: VOICE_MAP[voice] }),
    });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    return { blobUrl, buffer };
  } catch {
    return null;
  }
}

export const VoiceoverAgent = {
  async run(
    brief: VideoBrief,
    script: AiVideoScript,
    onProgress?: (done: number, total: number) => void,
  ): Promise<VoiceoverClip[]> {
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const total = script.scenes.length;
    let done = 0;
    onProgress?.(0, total);
    const results = await Promise.all(
      script.scenes.map(async (s) => {
        const audio = await fetchSceneAudio(s.voiceover, brief.voice, ctx);
        done += 1;
        onProgress?.(done, total);
        if (audio) {
          return { n: s.n, url: audio.blobUrl, duration_sec: audio.buffer.duration, text: s.voiceover, buffer: audio.buffer };
        }
        // Fallback: no audio; estimate duration from word count.
        return {
          n: s.n, url: null,
          duration_sec: Math.max(2, Math.min(parseSec(s.duration), Math.ceil(s.voiceover.split(" ").length / 2.5))),
          text: s.voiceover, buffer: null,
        };
      }),
    );
    await ctx.close().catch(() => {});
    return results;
  },
};

export const SubtitleAgent = {
  async run(script: AiVideoScript, voice: VoiceoverClip[]): Promise<SubtitleTrack> {
    let t = 0;
    const cues: string[] = ["WEBVTT", ""];
    voice.forEach((v, i) => {
      const start = t;
      const end = t + Math.max(1, v.duration_sec);
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
    return { url: "", mood: STYLE_LABEL[brief.style], duration_sec: total };
  },
};

export const SoundEffectsAgent = {
  async run(direction: DirectorPlan): Promise<SfxClip[]> {
    return direction.sfx_moments.map((label, i) => ({ n: i + 1, url: "", label }));
  },
};

export const VideoEditingAgent = {
  async run(script: AiVideoScript, visuals: VisualAsset[], voice: VoiceoverClip[]): Promise<Timeline> {
    let t = 0;
    const scenes = script.scenes.map((s, i) => {
      const v = visuals[i];
      const vo = voice[i];
      const dur = Math.max(v?.duration_sec ?? 3, (vo?.duration_sec ?? 0) + 0.25);
      const item = {
        n: s.n, start_sec: t, end_sec: t + dur,
        voiceover: s.voiceover, on_screen_text: s.on_screen_text ?? "", visual: v!,
      };
      t += dur;
      return item;
    });
    return { scenes, total_sec: t };
  },
};

// ---------- Render (real canvas + real audio) ----------

export const RenderAgent = {
  async run(
    brief: VideoBrief,
    script: AiVideoScript,
    visuals: VisualAsset[],
    voice: VoiceoverClip[],
    onProgress?: (p: number) => void,
  ): Promise<RenderResult> {
    const scenes: RenderScene[] = script.scenes.map((s, i) => ({
      n: s.n,
      visual: s.visual,
      voiceover: s.voiceover,
      duration: `${Math.max(2, Math.round(parseSec(s.duration)))}s`,
      on_screen_text: s.on_screen_text ?? "",
    }));
    const result = await renderVideo({
      title: brief.title,
      platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType],
      contentType: contentTypeFor(brief),
      styleId: mapStyleForRenderer(brief.style),
      scenes,
      sceneImages: visuals.map((v) => v.url),
      sceneAudio: voice.map((v) => v.buffer),
      fitToAudio: true,
      onProgress,
    });
    return {
      video_url: URL.createObjectURL(result.blob),
      mime: result.mimeType,
      extension: result.extension,
      duration_sec: result.durationSec,
      aspect_ratio: brief.aspectRatio,
    };
  },
};

// The renderer's constants use slightly different style ids; keep the accent
// color consistent by mapping our extended set back to the base palette.
function mapStyleForRenderer(id: StyleId): string {
  const map: Record<StyleId, string> = {
    "3d": "3d", ghibli: "ghibli", anime: "anime", realistic: "realistic",
    pixar: "pixar", cinematic: "cinematic", documentary: "documentary",
    dark_mystery: "dark", luxury: "ancient", cyberpunk: "cyberpunk",
    minimal_product: "minimal", futuristic: "cinematic",
  };
  return map[id];
}

// ---------- Thumbnail (real AI-generated 16:9) ----------

export const ThumbnailAgent = {
  async run(brief: VideoBrief): Promise<ThumbnailResult> {
    const prompt = `Ultra high CTR YouTube thumbnail, 1280x720, ${STYLE_DESCRIPTOR[brief.style]}. ` +
      `Hero subject illustrating: "${brief.title}". Dramatic composition, extreme contrast, ` +
      `bold rim lighting, one clear focal point, cinematic negative space on one side for a large headline. ` +
      `Emotional face or striking scene, magazine-cover quality. Do not render any text or letters in the image.`;
    const url = await fetchSceneImage(prompt, brief.style, "16:9");
    if (url) {
      return { url, alt: `${brief.title} — thumbnail`, generated: true };
    }
    return {
      url: placeholderImage("16:9", brief.title),
      alt: `${brief.title} — thumbnail`,
      generated: false,
    };
  },
};

// ---------- SEO ----------

export const SeoAgent = {
  async run(brief: VideoBrief, script: AiVideoScript, timeline: Timeline): Promise<SeoResult> {
    try {
      return await generateAiVideoSeo({
        data: {
          topic: brief.title,
          styleLabel: STYLE_LABEL[brief.style],
          platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType],
          contentType: contentTypeFor(brief),
          scenes: timeline.scenes.map((s) => ({
            n: s.n,
            voiceover: s.voiceover,
            duration_sec: Math.max(1, Math.round(s.end_sec - s.start_sec)),
          })),
          script_caption: script.caption,
        },
      });
    } catch (e) {
      console.error("[SEO Agent] failed", e);
      // Minimal safety net so the result page is never blank.
      return {
        youtube_title: script.reel_title || script.title || brief.title,
        youtube_description: script.caption || brief.title,
        hashtags: script.hashtags?.length ? script.hashtags : ["#video", "#shorts", "#viral"],
        tags: [brief.title, "video", "shorts", "viral"],
        pinned_comment: `What did you think of this one? Drop a comment below.`,
        chapters: [{ time: "00:00", label: "Intro" }],
      };
    }
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
  const script = await mark("script", () => ScriptAgent.run(brief, research, () => {
    onStep("script", "running", "Script generation failed. Retrying...");
  }));
  const storyboard = await mark("storyboard", () => StoryboardAgent.run(script));
  const direction = await mark("direction", () => DirectorAgent.run(brief, storyboard));
  const visuals = await mark("visuals", () =>
    VisualGenerationAgent.run(brief, script, (done, total) =>
      onStep("visuals", "running", `${done}/${total} scenes`)
    ),
  );
  const voiceover = await mark("voiceover", () =>
    VoiceoverAgent.run(brief, script, (done, total) =>
      onStep("voiceover", "running", `${done}/${total} scenes`)
    ),
  );
  const subtitles = await mark("subtitles", () => SubtitleAgent.run(script, voiceover));
  const timeline = await mark("edit", () => VideoEditingAgent.run(script, visuals, voiceover));
  const music = await mark("music", () => MusicAgent.run(brief, timeline.total_sec));
  const sfx = await mark("sfx", () => SoundEffectsAgent.run(direction));
  const render = await mark("render", () =>
    RenderAgent.run(brief, script, visuals, voiceover, (p) =>
      onStep("render", "running", `${Math.round(p * 100)}%`)
    ),
  );
  const thumbnail = await mark("thumbnail", () => ThumbnailAgent.run(brief));
  const seo = await mark("seo", () => SeoAgent.run(brief, script, timeline));

  return { brief, research, script, storyboard, direction, visuals, voiceover, subtitles, music, sfx, timeline, render, thumbnail, seo };
}

// ---------- helpers ----------

function parseSec(d: string): number {
  const m = /([\d.]+)/.exec(d ?? "");
  const n = m ? parseFloat(m[1]) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

function logScriptJsonDebug(script: AiVideoScript) {
  const debug = script.debug_json;
  if (!debug) return;
  debug.raw_responses.forEach((raw, i) => {
    console.error(`[Script Agent raw AI response ${i + 1}]`, raw);
  });
  debug.parse_errors.forEach((error) => console.error("[Script Agent JSON validation]", error));
}

function isHardAiFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("AI gateway 402") || message.includes("AI gateway 429") || message.includes("Unauthorized") || message.includes("Missing LOVABLE_API_KEY");
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

export const VOICES: { id: VoiceId; label: string }[] = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "documentary_narrator", label: "Documentary Narrator" },
];

export const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1"];
