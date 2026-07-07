// Videos module: modular agent pipeline.
//
// Session-only state — nothing here writes to the database. Every agent has a
// clean input/output contract (structured JSON) so real providers can be
// swapped in without touching the UI.

import {
  generateAiVideoScript, generateAiVideoSeo,
  generateVideoTitleVariants, generateVideoHook, generateVideoChapters,
  type AiVideoScript, type AiVideoScene, type AiVideoSeo,
  type VideoTitleVariants, type VideoHook, type VideoChapters,
} from "@/lib/video-ai.functions";
import { buildFallbackVideoScript } from "@/lib/video-fallback";
import { renderVideo, type RenderScene, type CameraMotion } from "@/lib/video-renderer";
import { runShotPool } from "@/lib/video-shot-runner";
import {
  createJob, getJob, saveJob, saveShotBlob, loadShotObjectURL,
  type JobRecord, type ShotRecord,
} from "@/lib/video-job-store";

// ---------- Beat expansion (documentary-style visual density) ----------
//
// A "beat" is a 2-5 second visual shot. Every script scene is broken into
// multiple beats, each with its own AI image and camera motion, while the
// scene's narration plays continuously across all its beats. This is what
// makes the result feel like a professionally edited documentary instead of
// a slideshow of one image per paragraph.

const TARGET_BEAT_SEC = 3.5;
const MIN_BEAT_SEC = 2.2;
const MAX_BEAT_SEC = 5.0;
const MOTION_CYCLE: CameraMotion[] = ["zoomIn", "panRight", "pushIn", "zoomOut", "panLeft", "tiltDown", "tiltUp"];

type Beat = {
  sceneIndex: number;   // index into script.scenes
  beatIndex: number;    // beat position within the scene (0-based)
  isFirstOfScene: boolean;
  text: string;         // narration chunk this beat visually represents
  words: number;
  imagePrompt: string;  // per-beat image prompt
  motion: CameraMotion;
};

/** Split a voiceover string into ~10-14-word visual chunks (sentence-aware). */
function splitVoiceoverIntoBeatTexts(vo: string, targetBeats: number): string[] {
  const clean = (vo ?? "").trim();
  if (!clean) return [""];
  // Sentence-aware split first.
  const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return [clean];

  // If we already have close to the right number of sentences, use them as-is.
  if (sentences.length >= targetBeats) {
    // Merge short adjacent sentences until we're at targetBeats.
    const merged = [...sentences];
    while (merged.length > targetBeats) {
      // Find the shortest adjacent pair and merge.
      let bestI = 0;
      let bestLen = Infinity;
      for (let i = 0; i < merged.length - 1; i++) {
        const len = merged[i].split(/\s+/).length + merged[i + 1].split(/\s+/).length;
        if (len < bestLen) { bestLen = len; bestI = i; }
      }
      merged.splice(bestI, 2, `${merged[bestI]} ${merged[bestI + 1]}`);
    }
    return merged;
  }

  // Fewer sentences than targetBeats: split long sentences on commas / word count.
  const chunks: string[] = [];
  for (const s of sentences) {
    const words = s.split(/\s+/);
    const need = Math.max(1, Math.round(words.length / 12));
    if (need <= 1) { chunks.push(s); continue; }
    // Prefer comma splits when reasonable.
    const commaParts = s.split(/,\s+/).map((x) => x.trim()).filter(Boolean);
    if (commaParts.length >= need) {
      // Group commaParts into `need` chunks.
      const per = Math.ceil(commaParts.length / need);
      for (let i = 0; i < commaParts.length; i += per) {
        chunks.push(commaParts.slice(i, i + per).join(", "));
      }
    } else {
      const per = Math.ceil(words.length / need);
      for (let i = 0; i < words.length; i += per) {
        chunks.push(words.slice(i, i + per).join(" "));
      }
    }
  }
  return chunks.length ? chunks : [clean];
}

function expandScriptToBeats(script: AiVideoScript, style: StyleId): Beat[] {
  const beats: Beat[] = [];
  let globalIdx = 0;
  script.scenes.forEach((scene, sceneIndex) => {
    const sceneDur = parseSec(scene.duration);
    const targetBeats = Math.max(1, Math.round(sceneDur / TARGET_BEAT_SEC));
    const chunks = splitVoiceoverIntoBeatTexts(scene.voiceover ?? "", targetBeats);
    const baseVisual = scene.visual || scene.image_prompt || `${scene.voiceover?.slice(0, 80)}`;
    chunks.forEach((chunk, beatIndex) => {
      const words = chunk.split(/\s+/).filter(Boolean).length || 1;
      beats.push({
        sceneIndex,
        beatIndex,
        isFirstOfScene: beatIndex === 0,
        text: chunk,
        words,
        imagePrompt: buildBeatImagePrompt(chunk, baseVisual, style),
        motion: MOTION_CYCLE[globalIdx % MOTION_CYCLE.length],
      });
      globalIdx += 1;
    });
  });
  return beats;
}

function buildBeatImagePrompt(beatText: string, sceneVisual: string, style: StyleId): string {
  const descriptor = STYLE_DESCRIPTOR[style];
  // Beat-specific visual grounded in the narration chunk, styled consistently.
  return `${descriptor}. Cinematic documentary shot visualizing: "${beatText.trim()}". Context: ${sceneVisual}. Dynamic composition, dramatic lighting, cinematic depth of field, no text, no watermarks, no captions.`;
}

/**
 * Given a scene's audio duration and its beats, return the seconds each beat
 * should occupy. Distributed proportionally to word count, clamped to
 * [MIN_BEAT_SEC, MAX_BEAT_SEC], then rescaled to sum exactly to audioSec.
 */
function distributeAudioAcrossBeats(sceneBeats: Beat[], audioSec: number): number[] {
  const totalWords = sceneBeats.reduce((a, b) => a + b.words, 0) || 1;
  const raw = sceneBeats.map((b) => (b.words / totalWords) * audioSec);
  const clamped = raw.map((d) => Math.max(MIN_BEAT_SEC, Math.min(MAX_BEAT_SEC, d)));
  const sum = clamped.reduce((a, b) => a + b, 0) || 1;
  const scale = audioSec / sum;
  return clamped.map((d) => d * scale);
}

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

export type ThumbnailVariant = {
  url: string;
  alt: string;
  headline: string;
  concept: string;
  generated: boolean;
};
export type ThumbnailResult = {
  url: string;
  alt: string;
  generated: boolean;
  variants: ThumbnailVariant[];
};

export type SeoResult = AiVideoSeo;

export type IntroPlan = {
  scenes_covered: number[];      // 1-based scene indices that form the intro
  duration_sec: number;
  promise: string;               // what the intro promises the viewer
  first_line: string;
};

export type CuriosityLoop = {
  scene_index: number;           // 1-based
  loop_text: string;             // the actual open-loop phrase found in the voiceover
  kind: "open" | "payoff";
  paired_scene?: number;         // for "open" loops: the scene that pays it off, if we can find one
};
export type CuriosityLoopPlan = { loops: CuriosityLoop[] };

export type RetentionMarker = {
  scene_index: number;           // 1-based
  time_sec: number;
  kind: "hook" | "open_loop" | "payoff" | "pattern_interrupt" | "cta";
  note: string;                  // 1-line rationale
};
export type RetentionPlan = {
  markers: RetentionMarker[];
  weakest_scene: number | null;  // scene index most likely to lose viewers
  average_gap_sec: number;       // avg seconds between retention beats
};

export type PipelineResult = {
  brief: VideoBrief;
  research: ResearchBrief;
  titles: VideoTitleVariants;
  hook: VideoHook;
  intro: IntroPlan;
  curiosity: CuriosityLoopPlan;
  script: AiVideoScript;
  retention: RetentionPlan;
  chapters: VideoChapters;
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
  { id: "title", label: "Optimizing title" },
  { id: "hook", label: "Writing hook" },
  { id: "intro", label: "Shaping intro" },
  { id: "curiosity", label: "Planting curiosity loops" },
  { id: "script", label: "Writing script" },
  { id: "retention", label: "Mapping retention beats" },
  { id: "chapters", label: "Generating chapters" },
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

/** Try to generate a short AI video clip for a beat. Returns null on any failure. */
async function fetchBeatClip(prompt: string, style: StyleId, ratio: AspectRatio, duration: number): Promise<string | null> {
  try {
    const res = await fetch("/api/generate-video-clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: `${STYLE_DESCRIPTOR[style]}. ${prompt}`,
        style: STYLE_LABEL[style],
        ratio,
        duration,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; clip?: string };
    if (!json.ok || !json.clip) return null;
    return json.clip;
  } catch {
    return null;
  }
}

export const VisualGenerationAgent = {
  async run(
    brief: VideoBrief,
    beats: Beat[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<VisualAsset[]> {
    const total = beats.length;
    let done = 0;
    onProgress?.(0, total);
    const results = await Promise.all(
      beats.map(async (b, i) => {
        // Try AI video clip first; fall back to still image on any failure.
        const clip = await fetchBeatClip(b.imagePrompt, brief.style, brief.aspectRatio, TARGET_BEAT_SEC);
        if (clip) {
          done += 1;
          onProgress?.(done, total);
          return { n: i + 1, kind: "clip" as const, url: clip, duration_sec: TARGET_BEAT_SEC, generated: true };
        }
        const url = await fetchSceneImage(b.imagePrompt, brief.style, brief.aspectRatio);
        done += 1;
        onProgress?.(done, total);
        return {
          n: i + 1,
          kind: "image" as const,
          url: url ?? placeholderImage(brief.aspectRatio, `Beat ${i + 1}`),
          duration_sec: TARGET_BEAT_SEC,
          generated: !!url,
        };
      }),
    );
    return results;
  },
};

// ---------- Render (real canvas + real audio, beat-driven) ----------

export const RenderAgent = {
  async run(
    brief: VideoBrief,
    script: AiVideoScript,
    beats: Beat[],
    beatVisuals: VisualAsset[],
    voice: VoiceoverClip[],
    onProgress?: (p: number) => void,
  ): Promise<RenderResult> {
    // Distribute each scene's audio duration across its beats.
    const beatDurations: number[] = new Array(beats.length).fill(TARGET_BEAT_SEC);
    const beatAudio: Array<AudioBuffer | null> = new Array(beats.length).fill(null);

    // Group beats by scene index.
    const bySceneIdx = new Map<number, number[]>();
    beats.forEach((b, i) => {
      const arr = bySceneIdx.get(b.sceneIndex) ?? [];
      arr.push(i);
      bySceneIdx.set(b.sceneIndex, arr);
    });

    bySceneIdx.forEach((globalBeatIndices, sceneIdx) => {
      const sceneBeats = globalBeatIndices.map((i) => beats[i]);
      const vo = voice[sceneIdx];
      const audioSec = vo?.buffer?.duration ?? vo?.duration_sec ?? sceneBeats.length * TARGET_BEAT_SEC;
      const durations = distributeAudioAcrossBeats(sceneBeats, audioSec);
      globalBeatIndices.forEach((gi, k) => {
        beatDurations[gi] = durations[k];
      });
      // Attach the scene's continuous audio buffer to the FIRST beat only —
      // it plays through the subsequent beats' visuals uninterrupted.
      const firstGi = globalBeatIndices[0];
      beatAudio[firstGi] = vo?.buffer ?? null;
    });

    const scenes: RenderScene[] = beats.map((b, i) => ({
      n: i + 1,
      visual: b.imagePrompt,
      voiceover: b.text,
      duration: `${beatDurations[i].toFixed(2)}s`,
      // On-screen text only on the first beat of a scene, using the script's overlay when present.
      on_screen_text: b.isFirstOfScene ? (script.scenes[b.sceneIndex]?.on_screen_text ?? "") : "",
      motion: b.motion,
    }));

    const result = await renderVideo({
      title: brief.title,
      platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType],
      contentType: contentTypeFor(brief),
      styleId: mapStyleForRenderer(brief.style),
      scenes,
      sceneImages: beatVisuals.map((v) => (v.kind === "image" ? v.url : null)),
      sceneMedia: beatVisuals.map((v) => ({ kind: v.kind, url: v.url })),
      sceneAudio: beatAudio,
      fitToAudio: false, // durations already sized to the audio timeline
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

// ---------- Voiceover (real TTS per scene, continuous narration) ----------

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
  async run(script: AiVideoScript, voice: VoiceoverClip[]): Promise<Timeline> {
    let t = 0;
    const scenes = script.scenes.map((s, i) => {
      const vo = voice[i];
      const dur = Math.max(2, (vo?.duration_sec ?? parseSec(s.duration)) + 0.25);
      const item = {
        n: s.n, start_sec: t, end_sec: t + dur,
        voiceover: s.voiceover, on_screen_text: s.on_screen_text ?? "",
        visual: { n: s.n, kind: "image" as const, url: "", duration_sec: dur, generated: false },
      };
      t += dur;
      return item;
    });
    return { scenes, total_sec: t };
  },
};

// (RenderAgent defined earlier — beat-driven.)

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
    // MrBeast / Ryan Trahan / Ruddy Rose / Colin & Samir school of thumbnail design:
    // maximum contrast, one clear emotional focal point, saturated colors, giant
    // object or shocked expressive face, extreme rim lighting, cinematic depth,
    // massive negative space on ONE side for the headline the user will slap on.
    // We deliberately ask the model NOT to render text — it almost always butchers it.
    const styleDesc = STYLE_DESCRIPTOR[brief.style];
    const topic = brief.title;

    const concepts: Array<{ concept: string; headline: string; promptExtra: string }> = [
      {
        concept: "Shocked reaction hero",
        headline: topic.toUpperCase().slice(0, 40),
        promptExtra:
          `Extreme close-up of a single expressive human face reacting in pure shock and awe — wide eyes, mouth slightly open, ` +
          `dramatic key light from one side, colored rim light (neon pink or cyan) on the other. Face fills 40% of the frame on the LEFT third. ` +
          `Right two thirds: bold, out-of-focus scene illustrating "${topic}" with heavy bokeh and saturated colors. ` +
          `Extreme contrast, glossy magazine finish, MrBeast-tier CTR composition.`,
      },
      {
        concept: "Giant object vs tiny human",
        headline: topic.toUpperCase().slice(0, 40),
        promptExtra:
          `A giant hero object symbolizing "${topic}" dominating the center of the frame, dwarfing a small human silhouette in the foreground for scale. ` +
          `Golden-hour cinematic lighting, volumetric god rays, saturated teal-and-orange color grade, ultra-detailed textures, ` +
          `heavy atmospheric haze for depth. Wide 16:9 composition with a clean sky area on the top-left for a headline. ` +
          `Ryan Trahan / Johnny Harris documentary poster energy.`,
      },
      {
        concept: "High-contrast split scene",
        headline: topic.toUpperCase().slice(0, 40),
        promptExtra:
          `A split-scene composition: left half depicts the "before" of "${topic}" in cold desaturated blue tones, ` +
          `right half depicts the dramatic "after" in warm saturated red/orange tones. A single hero element bridges both halves in the center. ` +
          `Insanely sharp, high dynamic range, cinematic, Vox / ColdFusion / MagnatesMedia thumbnail energy. ` +
          `Vignette darkened corners so the eye locks on the center.`,
      },
    ];

    const results = await Promise.all(
      concepts.map(async (c) => {
        const prompt =
          `Ultra high-CTR YouTube thumbnail, 1280x720, ${styleDesc}. ` +
          `${c.promptExtra} ` +
          `Absolutely no text, no letters, no numbers, no watermarks, no logos in the image. ` +
          `Photorealistic quality, poster-grade composition, maximum click-through appeal.`;
        const url = await fetchSceneImage(prompt, brief.style, "16:9");
        if (url) {
          return {
            url,
            alt: `${topic} — ${c.concept}`,
            headline: c.headline,
            concept: c.concept,
            generated: true,
          };
        }
        return {
          url: placeholderImage("16:9", topic),
          alt: `${topic} — ${c.concept}`,
          headline: c.headline,
          concept: c.concept,
          generated: false,
        };
      }),
    );

    const primary = results[0];
    return {
      url: primary.url,
      alt: primary.alt,
      generated: results.some((r) => r.generated),
      variants: results,
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

// ---------- New pipeline agents (Title / Hook / Intro / Curiosity / Retention / Chapters) ----------

export const TitleOptimizerAgent = {
  async run(brief: VideoBrief, research: ResearchBrief): Promise<VideoTitleVariants> {
    try {
      return await generateVideoTitleVariants({
        data: { topic: research.topic || brief.title, styleLabel: STYLE_LABEL[brief.style], platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType] },
      });
    } catch (e) {
      console.error("[TitleOptimizerAgent] failed, using fallback", e);
      const t = brief.title;
      return {
        recommended: `5 Things Nobody Tells You About ${t}`.slice(0, 65),
        variants: [
          { title: `The Truth About ${t}`.slice(0, 65), angle: "Curiosity gap", ctr_score: 7 },
          { title: `Why ${t} Is Not What You Think`.slice(0, 65), angle: "Contrarian", ctr_score: 7 },
          { title: `5 Things Nobody Tells You About ${t}`.slice(0, 65), angle: "Numbered", ctr_score: 8 },
        ],
      };
    }
  },
};

export const HookAgent = {
  async run(brief: VideoBrief, research: ResearchBrief): Promise<VideoHook> {
    try {
      return await generateVideoHook({
        data: { topic: research.topic || brief.title, styleLabel: STYLE_LABEL[brief.style], platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType], currentHook: "" },
      });
    } catch (e) {
      console.error("[HookAgent] failed, using fallback", e);
      return {
        voiceover: `What if everything you knew about ${brief.title} was wrong?`,
        on_screen_text: "",
        visual: `${STYLE_LABEL[brief.style]} cinematic opening shot on ${brief.title}, dramatic lighting.`,
        rationale: "Contrarian curiosity gap that promises a payoff.",
      };
    }
  },
};

/**
 * IntroAgent — inspects the first N scenes the ScriptAgent produced and
 * summarizes what the intro promises. Intro rewriting is baked into the
 * Script Agent prompt (Hybrid mode), so this step is fast and deterministic.
 */
export const IntroAgent = {
  async run(brief: VideoBrief, script: AiVideoScript): Promise<IntroPlan> {
    // Intro = ~10% of duration, min 2 scenes, max 5.
    const targetSec = Math.max(6, brief.duration * 0.1);
    let acc = 0;
    const scenesCovered: number[] = [];
    for (const s of script.scenes) {
      scenesCovered.push(s.n);
      acc += parseSec(s.duration);
      if (acc >= targetSec || scenesCovered.length >= 5) break;
      if (scenesCovered.length >= 2 && acc >= targetSec * 0.8) break;
    }
    const introScenes = script.scenes.slice(0, scenesCovered.length);
    const promise = introScenes.map((s) => s.voiceover).join(" ").slice(0, 200);
    return {
      scenes_covered: scenesCovered,
      duration_sec: Math.round(acc),
      promise: promise || `A deep look at ${brief.title}.`,
      first_line: script.scenes[0]?.voiceover ?? "",
    };
  },
};

/**
 * CuriosityLoopAgent — scans the finished script for open-loop language and
 * pairs each open loop with the scene that most likely pays it off (by keyword
 * overlap). Deterministic, no extra AI call.
 */
export const CuriosityLoopAgent = {
  async run(script: AiVideoScript): Promise<CuriosityLoopPlan> {
    const OPEN_MARKERS = [
      /but first/i, /we'?ll get to that/i, /in a second/i, /the twist/i,
      /here'?s the thing/i, /wait until you see/i, /you won'?t believe/i,
      /the reason (?:why )?is/i, /that'?s not all/i, /before we get there/i,
    ];
    const PAYOFF_MARKERS = [
      /that'?s why/i, /and the reason/i, /here'?s the payoff/i,
      /which brings us back/i, /remember when/i, /the answer is/i,
    ];

    const loops: CuriosityLoop[] = [];
    script.scenes.forEach((s) => {
      const vo = s.voiceover ?? "";
      const openHit = OPEN_MARKERS.find((r) => r.test(vo));
      if (openHit) loops.push({ scene_index: s.n, loop_text: vo, kind: "open" });
      const payoffHit = PAYOFF_MARKERS.find((r) => r.test(vo));
      if (payoffHit) loops.push({ scene_index: s.n, loop_text: vo, kind: "payoff" });
    });

    // Pair each open loop with the nearest later payoff.
    const payoffs = loops.filter((l) => l.kind === "payoff");
    for (const loop of loops) {
      if (loop.kind !== "open") continue;
      const next = payoffs.find((p) => p.scene_index > loop.scene_index);
      if (next) loop.paired_scene = next.scene_index;
    }

    return { loops };
  },
};

/**
 * RetentionAgent — annotates the script timeline with retention markers
 * (hook, open loops, payoffs, pattern interrupts, cta) and flags the scene
 * most at risk of losing viewers. Retention REWRITING is done inside the
 * Script Agent; this agent handles the ANNOTATION half of "Both".
 */
export const RetentionAgent = {
  async run(brief: VideoBrief, script: AiVideoScript, curiosity: CuriosityLoopPlan): Promise<RetentionPlan> {
    const markers: RetentionMarker[] = [];
    let t = 0;
    const sceneStarts: number[] = [];
    script.scenes.forEach((s) => {
      sceneStarts.push(t);
      t += parseSec(s.duration);
    });

    // Hook + CTA are always markers.
    if (script.scenes[0]) {
      markers.push({ scene_index: 1, time_sec: 0, kind: "hook", note: "Opening hook — stop the scroll." });
    }
    const lastIdx = script.scenes.length - 1;
    if (lastIdx > 0) {
      markers.push({
        scene_index: lastIdx + 1,
        time_sec: sceneStarts[lastIdx] ?? t,
        kind: "cta",
        note: "Closing CTA — subscribe / next video.",
      });
    }

    // Curiosity loops → retention markers.
    curiosity.loops.forEach((l) => {
      const idx = l.scene_index - 1;
      markers.push({
        scene_index: l.scene_index,
        time_sec: sceneStarts[idx] ?? 0,
        kind: l.kind === "open" ? "open_loop" : "payoff",
        note: l.kind === "open"
          ? (l.paired_scene ? `Open loop, paid off at scene ${l.paired_scene}.` : "Open loop (unpaid) — consider adding a payoff.")
          : "Payoff — closes an earlier loop.",
      });
    });

    // Pattern interrupts every ~30-45 seconds (whichever scene straddles the boundary).
    const interruptEvery = brief.duration <= 60 ? 15 : brief.duration <= 300 ? 30 : 45;
    let nextInterruptAt = interruptEvery;
    script.scenes.forEach((s, i) => {
      const start = sceneStarts[i];
      if (start >= nextInterruptAt && i !== 0 && i !== lastIdx) {
        markers.push({
          scene_index: s.n,
          time_sec: start,
          kind: "pattern_interrupt",
          note: "Pattern interrupt — new visual, tone shift, or contrarian claim.",
        });
        nextInterruptAt += interruptEvery;
      }
    });

    markers.sort((a, b) => a.time_sec - b.time_sec);

    // Weakest scene = the longest gap between retention markers, choose midpoint scene.
    let weakest: number | null = null;
    let biggestGap = 0;
    for (let i = 1; i < markers.length; i++) {
      const gap = markers[i].time_sec - markers[i - 1].time_sec;
      if (gap > biggestGap) {
        biggestGap = gap;
        const midT = markers[i - 1].time_sec + gap / 2;
        const idx = sceneStarts.findIndex((st, k) => st <= midT && (sceneStarts[k + 1] ?? Infinity) > midT);
        weakest = idx >= 0 ? script.scenes[idx].n : null;
      }
    }

    const avgGap = markers.length > 1
      ? (markers[markers.length - 1].time_sec - markers[0].time_sec) / (markers.length - 1)
      : 0;

    return {
      markers,
      weakest_scene: weakest,
      average_gap_sec: Math.round(avgGap * 10) / 10,
    };
  },
};

export const ChapterAgent = {
  async run(script: AiVideoScript): Promise<VideoChapters> {
    try {
      return await generateVideoChapters({
        data: {
          topic: script.title || script.reel_title || "Video",
          scenes: script.scenes.map((s) => ({
            voiceover: s.voiceover ?? "",
            duration_sec: parseSec(s.duration),
          })),
        },
      });
    } catch (e) {
      console.error("[ChapterAgent] failed, using fallback", e);
      return { chapters: [{ time: "00:00", label: "Intro", description: script.scenes[0]?.voiceover.slice(0, 80) ?? "" }] };
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

  // New pre-script agents (Title / Hook run in parallel — independent).
  const [titles, hook] = await Promise.all([
    mark("title", () => TitleOptimizerAgent.run(brief, research)),
    mark("hook", () => HookAgent.run(brief, research)),
  ]);

  const script = await mark("script", () => ScriptAgent.run(brief, research, () => {
    onStep("script", "running", "Script generation failed. Retrying...");
  }));

  // Apply the Hook Agent's opening line to scene 1 so the video starts with
  // the CTR-optimized hook rather than whatever the Script Agent wrote there.
  if (script.scenes[0] && hook.voiceover.trim().length > 0) {
    script.scenes[0] = {
      ...script.scenes[0],
      voiceover: hook.voiceover,
      on_screen_text: hook.on_screen_text || script.scenes[0].on_screen_text,
      visual: hook.visual || script.scenes[0].visual,
    };
  }

  // Intro / Curiosity are derived from the finished script (deterministic).
  const intro = await mark("intro", () => IntroAgent.run(brief, script));
  const curiosity = await mark("curiosity", () => CuriosityLoopAgent.run(script));
  const retention = await mark("retention", () => RetentionAgent.run(brief, script, curiosity));
  const chapters = await mark("chapters", () => ChapterAgent.run(script));

  const storyboard = await mark("storyboard", () => StoryboardAgent.run(script));
  const direction = await mark("direction", () => DirectorAgent.run(brief, storyboard));

  const beats = expandScriptToBeats(script, brief.style);

  const visuals = await mark("visuals", () =>
    VisualGenerationAgent.run(brief, beats, (done, total) =>
      onStep("visuals", "running", `${done}/${total} shots`)
    ),
  );
  const voiceover = await mark("voiceover", () =>
    VoiceoverAgent.run(brief, script, (done, total) =>
      onStep("voiceover", "running", `${done}/${total} scenes`)
    ),
  );
  const subtitles = await mark("subtitles", () => SubtitleAgent.run(script, voiceover));
  const timeline = await mark("edit", () => VideoEditingAgent.run(script, voiceover));
  const music = await mark("music", () => MusicAgent.run(brief, timeline.total_sec));
  const sfx = await mark("sfx", () => SoundEffectsAgent.run(direction));
  const render = await mark("render", () =>
    RenderAgent.run(brief, script, beats, visuals, voiceover, (p: number) =>
      onStep("render", "running", `${Math.round(p * 100)}%`)
    ),
  );
  const thumbnail = await mark("thumbnail", () => ThumbnailAgent.run(brief));
  const seo = await mark("seo", () => SeoAgent.run(brief, script, timeline));

  validatePipelineDuration({
    requestedSec: brief.duration,
    voiceoverSec: voiceover.reduce((a, v) => a + (v.buffer?.duration ?? v.duration_sec ?? 0), 0),
    timelineSec: timeline.total_sec,
    renderedSec: render.duration_sec,
  });

  return {
    brief, research, titles, hook, intro, curiosity, script, retention, chapters,
    storyboard, direction, visuals, voiceover, subtitles, music, sfx, timeline,
    render, thumbnail, seo,
  };
}

/**
 * Duration validation — logs PASS if the rendered video is within ±5% of the
 * requested duration, WARN otherwise. Every stage is checked so it's obvious
 * where the shortfall came from (script / voice / timeline / render).
 */
function validatePipelineDuration(d: {
  requestedSec: number; voiceoverSec: number; timelineSec: number; renderedSec: number;
}) {
  const pct = (n: number) => (d.requestedSec > 0 ? Math.round((n / d.requestedSec) * 100) : 0);
  const status = d.renderedSec >= d.requestedSec * 0.95 ? "PASS" : "SHORT";
  console.info(
    `[Duration] requested=${d.requestedSec.toFixed(1)}s voice=${d.voiceoverSec.toFixed(1)}s(${pct(d.voiceoverSec)}%) timeline=${d.timelineSec.toFixed(1)}s(${pct(d.timelineSec)}%) rendered=${d.renderedSec.toFixed(1)}s(${pct(d.renderedSec)}%) — ${status}`
  );
  if (status === "SHORT") {
    console.warn(
      `[Duration] Rendered video is ${((1 - d.renderedSec / d.requestedSec) * 100).toFixed(1)}% shorter than requested. Script produced insufficient narration for ${d.requestedSec}s.`
    );
  }
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

// =========================================================================
// Async parallel job pipeline (resumable, per-shot progress)
// =========================================================================

export type JobPhaseId =
  | "planning"
  | "generating_shots"
  | "voiceover"
  | "rendering"
  | "complete"
  | "failed";

export type ShotProgress = {
  id: string;
  index: number;
  status: "pending" | "running" | "done" | "failed";
  kind: "clip" | "image" | null;
  previewUrl: string | null; // object URL for the completed asset (or null)
  error: string | null;
  attempts: number;
};

export type JobEvent =
  | { type: "phase"; phase: JobPhaseId; note?: string }
  | { type: "shots-init"; total: number; shots: ShotProgress[] }
  | { type: "shot"; shot: ShotProgress; done: number; failed: number; total: number }
  | { type: "voiceover"; done: number; total: number }
  | { type: "render"; progress: number }
  | { type: "error"; message: string };

export type JobRunOptions = {
  jobId?: string;                       // resume existing job
  niche: string;
  topic: string;
  onEvent: (ev: JobEvent) => void;
  signal?: AbortSignal;
};

async function dataUrlToBlob(u: string): Promise<Blob> {
  const res = await fetch(u);
  return await res.blob();
}

function beatsFromShots(job: JobRecord, style: StyleId): Beat[] {
  return job.shots.map<Beat>((s) => ({
    sceneIndex: s.sceneIndex,
    beatIndex: s.beatIndex,
    isFirstOfScene: s.isFirstOfScene,
    text: s.text,
    words: s.words || Math.max(1, s.text.split(/\s+/).filter(Boolean).length),
    imagePrompt: s.prompt,
    motion: (s.motion as CameraMotion) || "zoomIn",
    // Note: buildBeatImagePrompt already applied when the shot was created.
    _styleHint: style,
  } as unknown as Beat));
}

function planShots(script: AiVideoScript, style: StyleId): ShotRecord[] {
  const beats = expandScriptToBeats(script, style);
  return beats.map<ShotRecord>((b, i) => ({
    id: `s${i + 1}`,
    index: i,
    sceneIndex: b.sceneIndex,
    beatIndex: b.beatIndex,
    isFirstOfScene: b.isFirstOfScene,
    text: b.text,
    words: b.words,
    prompt: b.imagePrompt,
    motion: b.motion,
    status: "pending",
    kind: null,
    blobKey: null,
    mime: null,
    attempts: 0,
    error: null,
  }));
}

async function generateOneShot(
  shot: ShotRecord,
  brief: VideoBrief,
  jobId: string,
  signal: AbortSignal,
): Promise<{ blobKey: string; kind: "clip" | "image"; mime: string; previewUrl: string }> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  // Try clip first; on any failure fall back to image. Both return data URLs
  // today (see /api/generate-image and /api/generate-video-clip).
  const clip = await fetchBeatClip(shot.prompt, brief.style, brief.aspectRatio, TARGET_BEAT_SEC);
  if (clip) {
    const blob = await dataUrlToBlob(clip);
    const key = await saveShotBlob(jobId, shot.id, blob);
    const url = await loadShotObjectURL(key);
    return { blobKey: key, kind: "clip", mime: blob.type || "video/mp4", previewUrl: url ?? clip };
  }
  const img = await fetchSceneImage(shot.prompt, brief.style, brief.aspectRatio);
  if (!img) throw new Error("Image generation failed");
  const blob = await dataUrlToBlob(img);
  const key = await saveShotBlob(jobId, shot.id, blob);
  const url = await loadShotObjectURL(key);
  return { blobKey: key, kind: "image", mime: blob.type || "image/png", previewUrl: url ?? img };
}

export async function runVideoJobPipeline(
  brief: VideoBrief,
  opts: JobRunOptions,
): Promise<{ job: JobRecord; result: PipelineResult }> {
  const { onEvent, signal } = opts;

  // ---------- Phase 1: planning ----------
  let job: JobRecord;
  let script: AiVideoScript;
  let research: ResearchBrief;
  let storyboard: Storyboard;
  let direction: DirectorPlan;

  const existing = opts.jobId ? await getJob(opts.jobId) : null;
  if (existing) {
    onEvent({ type: "phase", phase: "planning", note: "Resuming saved job" });
    // Rebuild planning artifacts by re-running the fast agents. Script may
    // differ slightly from the original run, but shot prompts/motions come
    // from the persisted shot records so visuals stay consistent.
    research = await ResearchAgent.run(brief);
    script = await ScriptAgent.run(brief, research);
    storyboard = await StoryboardAgent.run(script);
    direction = await DirectorAgent.run(brief, storyboard);
    job = existing;
  } else {
    onEvent({ type: "phase", phase: "planning" });
    research = await ResearchAgent.run(brief);
    script = await ScriptAgent.run(brief, research);
    storyboard = await StoryboardAgent.run(script);
    direction = await DirectorAgent.run(brief, storyboard);
    const shots = planShots(script, brief.style);
    job = await createJob({
      title: brief.title,
      niche: opts.niche,
      topic: opts.topic,
      briefJson: JSON.stringify(brief),
      shots,
    });
  }

  // ---------- Phase 2: parallel shot generation (with resume) ----------
  job.phase = "generating_shots";
  await saveJob(job);
  onEvent({ type: "phase", phase: "generating_shots" });

  // Hydrate previews for shots already done (resume path).
  const initial: ShotProgress[] = await Promise.all(job.shots.map(async (s) => {
    let previewUrl: string | null = null;
    if (s.status === "done" && s.blobKey) {
      previewUrl = await loadShotObjectURL(s.blobKey);
    }
    return {
      id: s.id, index: s.index,
      status: s.status === "running" ? "pending" : s.status,
      kind: s.kind, previewUrl, error: s.error, attempts: s.attempts,
    };
  }));
  onEvent({ type: "shots-init", total: job.shots.length, shots: initial });

  let done = job.shots.filter((s) => s.status === "done").length;
  let failed = 0;
  job.shotsDone = done; job.shotsFailed = 0;

  const pending = job.shots.filter((s) => s.status !== "done");
  const poolJobs = pending.map((shot) => ({
    id: shot.id,
    run: async (sig: AbortSignal) => {
      shot.status = "running";
      shot.attempts += 1;
      return await generateOneShot(shot, brief, job.id, sig);
    },
  }));

  await runShotPool(poolJobs, {
    concurrency: 6,
    maxAttempts: 2,
    signal,
    onShotSettled: (outcome) => {
      const shot = job.shots.find((s) => s.id === outcome.id);
      if (!shot) return;
      if (outcome.ok) {
        shot.status = "done";
        shot.kind = outcome.value.kind;
        shot.blobKey = outcome.value.blobKey;
        shot.mime = outcome.value.mime;
        shot.error = null;
        done += 1;
        onEvent({
          type: "shot",
          done, failed, total: job.shots.length,
          shot: {
            id: shot.id, index: shot.index, status: "done",
            kind: shot.kind, previewUrl: outcome.value.previewUrl,
            error: null, attempts: shot.attempts,
          },
        });
      } else {
        shot.status = "failed";
        shot.error = outcome.error;
        failed += 1;
        onEvent({
          type: "shot",
          done, failed, total: job.shots.length,
          shot: {
            id: shot.id, index: shot.index, status: "failed",
            kind: null, previewUrl: null, error: outcome.error, attempts: shot.attempts,
          },
        });
      }
      job.shotsDone = done; job.shotsFailed = failed;
      // Fire-and-forget persist per shot for resumability.
      void saveJob(job);
    },
  });

  if (signal?.aborted) {
    job.phase = "paused";
    await saveJob(job);
    throw new DOMException("Aborted", "AbortError");
  }

  // ---------- Phase 3: voiceover / subtitles / timeline ----------
  job.phase = "voiceover";
  await saveJob(job);
  onEvent({ type: "phase", phase: "voiceover" });
  const voiceover = await VoiceoverAgent.run(brief, script, (d, t) =>
    onEvent({ type: "voiceover", done: d, total: t }),
  );
  const subtitles = await SubtitleAgent.run(script, voiceover);
  const timeline = await VideoEditingAgent.run(script, voiceover);
  const music = await MusicAgent.run(brief, timeline.total_sec);
  const sfx = await SoundEffectsAgent.run(direction);

  // ---------- Phase 4: render ----------
  job.phase = "rendering";
  await saveJob(job);
  onEvent({ type: "phase", phase: "rendering" });

  // Build VisualAsset[] from stored shots (hydrate object URLs from IDB).
  const visuals: VisualAsset[] = await Promise.all(job.shots.map(async (s, i) => {
    let url: string | null = null;
    if (s.blobKey) url = await loadShotObjectURL(s.blobKey);
    if (!url) url = placeholderImage(brief.aspectRatio, `Shot ${i + 1}`);
    return {
      n: i + 1,
      kind: (s.kind ?? "image"),
      url,
      duration_sec: TARGET_BEAT_SEC,
      generated: s.status === "done",
    };
  }));

  const beats = beatsFromShots(job, brief.style);
  const render = await RenderAgent.run(brief, script, beats, visuals, voiceover, (p) =>
    onEvent({ type: "render", progress: p }),
  );
  job.renderProgress = 1;

  const thumbnail = await ThumbnailAgent.run(brief);
  const seo = await SeoAgent.run(brief, script, timeline);

  // New pipeline agents — run after script so they can annotate it.
  // Title / Hook are also computed here so the result carries them; the
  // hook is not re-applied to the script in the async pipeline because the
  // script has already been rendered.
  const [titles, hook] = await Promise.all([
    TitleOptimizerAgent.run(brief, research),
    HookAgent.run(brief, research),
  ]);
  const intro = await IntroAgent.run(brief, script);
  const curiosity = await CuriosityLoopAgent.run(script);
  const retention = await RetentionAgent.run(brief, script, curiosity);
  const chapters = await ChapterAgent.run(script);

  validatePipelineDuration({
    requestedSec: brief.duration,
    voiceoverSec: voiceover.reduce((a, v) => a + (v.buffer?.duration ?? v.duration_sec ?? 0), 0),
    timelineSec: timeline.total_sec,
    renderedSec: render.duration_sec,
  });

  job.phase = "complete";
  await saveJob(job);
  onEvent({ type: "phase", phase: "complete" });

  const result: PipelineResult = {
    brief, research, titles, hook, intro, curiosity, script, retention, chapters,
    storyboard, direction, visuals, voiceover, subtitles, music, sfx, timeline,
    render, thumbnail, seo,
  };
  return { job, result };
}

/** Requeue only the failed shots on an existing job. Emits the same events. */
export async function retryFailedShots(
  jobId: string,
  brief: VideoBrief,
  onEvent: (ev: JobEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const failedShots = job.shots.filter((s) => s.status === "failed");
  if (failedShots.length === 0) return;

  let done = job.shotsDone;
  let failed = job.shotsFailed - failedShots.length; // will re-count as we go
  failedShots.forEach((s) => { s.status = "pending"; s.error = null; });

  const poolJobs = failedShots.map((shot) => ({
    id: shot.id,
    run: async (sig: AbortSignal) => {
      shot.status = "running";
      shot.attempts += 1;
      return await generateOneShot(shot, brief, job.id, sig);
    },
  }));

  await runShotPool(poolJobs, {
    concurrency: 6, maxAttempts: 2, signal,
    onShotSettled: (outcome) => {
      const shot = job.shots.find((s) => s.id === outcome.id);
      if (!shot) return;
      if (outcome.ok) {
        shot.status = "done"; shot.kind = outcome.value.kind;
        shot.blobKey = outcome.value.blobKey; shot.mime = outcome.value.mime;
        shot.error = null; done += 1;
        onEvent({
          type: "shot", done, failed, total: job.shots.length,
          shot: { id: shot.id, index: shot.index, status: "done", kind: shot.kind,
            previewUrl: outcome.value.previewUrl, error: null, attempts: shot.attempts },
        });
      } else {
        shot.status = "failed"; shot.error = outcome.error; failed += 1;
        onEvent({
          type: "shot", done, failed, total: job.shots.length,
          shot: { id: shot.id, index: shot.index, status: "failed", kind: null,
            previewUrl: null, error: outcome.error, attempts: shot.attempts },
        });
      }
      job.shotsDone = done; job.shotsFailed = failed;
      void saveJob(job);
    },
  });
}

