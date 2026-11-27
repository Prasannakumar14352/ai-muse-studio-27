import { decodeAudioAssets, generateAudio, previewAudioMix } from "@/lib/audio-client";
import { isAudioTrackEnabled, planVideoAudio, sceneAudioId, type PlannedAudio } from "@/lib/audio-plan";
import { AUDIO_LIMITS, type AudioSettings } from "@/lib/audio-generation";
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
import { fitNarrationToSlots, slotsForTarget, MAX_FIT_SPEEDUP } from "@/lib/render-timeline";
import { setCreditJobTag } from "@/lib/job-credit-tag";
import { buildFallbackVideoScript } from "@/lib/video-fallback";
import { renderVideo, type RenderScene, type CameraMotion, type TransitionStyle } from "@/lib/video-renderer";
import { planBeatMotion, type SceneType } from "@/lib/motion-director";
import { detectScene, buildDynamicVideoPrompt, type SceneKind, type DynamicActivity } from "@/lib/scene-detector";
import { runShotPool } from "@/lib/video-shot-runner";
import {
  createJob, getJob, saveJob, saveShotBlob, loadShotObjectURL,
  type JobRecord, type ShotRecord,
} from "@/lib/video-job-store";
import {
  directBeatPrompt, buildContinuityCard, STYLE_PRESETS, cinematicStyleFor, type CinematicStyleId,
  type ContinuityCard, type ShotType, type VDStyle,
} from "@/lib/visual-director";
import {
  detectIntentHeuristic, buildBriefFromIntent,
  type CreativeBrief,
} from "@/lib/creative-director";
import {
  defaultCharacterBibleFor, bibleToContinuityCard, pickEnvironmentForBeat,
  type CharacterBible,
} from "@/lib/character-bible";
import { classifyTopic } from "@/lib/cinematic-engine";
import { authFetch } from "@/lib/auth-fetch";
import { ttsFetch } from "@/lib/tts-client";
// Static (not lazy) imports on purpose: a long render can outlive a deploy,
// and a lazily-loaded chunk from the old build no longer exists afterwards
// ("Failed to fetch dynamically imported module"), which killed finished renders.
import { fetchGeneratedImage } from "@/lib/image-stream";
import { pickMotionBeats, motionPromptFor, type MotionMode, type MotionTier } from "@/lib/motion-clips";
import { validateRenderedVideo } from "./video-validate";
import { convertBlobToMp4 } from "@/lib/transcode-client";
import { AI_NOT_CONFIGURED } from "@/lib/ai-provider";

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
  imagePrompt: string;  // per-beat image prompt (motion brief appended)
  motion: CameraMotion;
  transition: TransitionStyle;
  sceneType: SceneType;
  /** Dynamic Scene Detection: how this beat must be produced. */
  sceneKind: SceneKind;
  /** Activity name when sceneKind === "dynamic" (walking, cooking, ...). */
  activity: DynamicActivity | null;
  /** Rich AI-video prompt when dynamic; null for static beats. */
  videoPrompt: string | null;
  /** False for b-roll beats that show no person. */
  hasCharacter: boolean;
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

function expandScriptToBeats(
  script: AiVideoScript,
  style: StyleId,
  title: string,
  brief?: import("@/lib/creative-director").CreativeBrief | null,
  bible?: CharacterBible | null,
  visualInstructions?: string,
): Beat[] {
  const beats: Beat[] = [];
  let globalIdx = 0;
  const activeBible: CharacterBible = bible ?? defaultCharacterBibleFor(title, brief?.intent, cinematicCharacterContext(style, title, visualInstructions));
  const continuity: ContinuityCard = bibleToContinuityCard(activeBible);
  // Silence unused-warning for the legacy hint-only builder (kept exported).
  void buildContinuityCard;
  const vdStyle = style as VDStyle;
  let previousShot: ShotType | null = null;
  const topic = classifyTopic(`${title} ${brief?.intent ?? ""}`);
  const recentEnvs: string[] = [];
  const directorLite = brief ? {
    intent: brief.intent,
    visualHero: brief.visualHero,
    visualStyle: brief.visualStyle,
    cameraStyle: brief.cameraStyle,
    sceneComposition: brief.sceneComposition,
    paletteHint: brief.paletteHint,
    avoid: brief.avoid,
  } : null;
  script.scenes.forEach((scene, sceneIndex) => {
    const sceneDur = parseSec(scene.duration);
    const targetBeats = Math.max(1, Math.round(sceneDur / TARGET_BEAT_SEC));
    const chunks = splitVoiceoverIntoBeatTexts(scene.voiceover ?? "", targetBeats);
    const baseVisual = scene.visual || scene.image_prompt || `${scene.voiceover?.slice(0, 80)}`;
    // One environment per scene keeps continuity within the scene, but rotates
    // across scenes so a project never becomes "forest, forest, forest".
    const sceneEnv = scene.visual?.trim() || scene.image_prompt?.trim() || pickEnvironmentForBeat(topic, sceneIndex, recentEnvs);
    recentEnvs.push(sceneEnv);
    chunks.forEach((chunk, beatIndex) => {
      const words = chunk.split(/\s+/).filter(Boolean).length || 1;
      const directed = directBeatPrompt({
        title,
        styleId: vdStyle,
        ratio: "16:9",
        beatText: chunk,
        sceneContext: baseVisual,
        visualInstructions,
        sceneNumber: scene.n,
        chapterLabel: scene.role ?? null,
        scenePurpose: scene.role ?? null,
        emotion: null,
        beatIndex: globalIdx,
        continuity,
        previousShotType: previousShot,
        brief: directorLite,
        environmentOverride: sceneEnv,
        masterReferenceUrl: activeBible.masterReferenceUrl ?? null,
      });
      previousShot = directed.shotType;
      // Motion Director — classify + pick motion + transition + brief.
      const plan = planBeatMotion({
        beatText: chunk,
        imagePrompt: directed.prompt,
        intent: brief?.intent ?? null,
        index: globalIdx,
        isFirstOfScene: beatIndex === 0,
      });
      // Fold motion brief into the image prompt so the still is COMPOSED for
      // the chosen motion (e.g., a page-flip needs a hand mid-flip shot).
      const composedPrompt = plan.motionBrief
        ? `${directed.prompt}\n\nSHOT COMPOSITION FOR MOTION (${plan.motion} / ${plan.sceneType}):\n${plan.motionBrief}`
        : directed.prompt;
      // Dynamic Scene Detection — is this beat continuous human activity
      // (walking/talking/cooking/…) or a truly static subject (product/logo/
      // landscape/…)? Dynamic beats must be produced by an AI video model.
      const detection = detectScene(chunk, composedPrompt);
      const videoPrompt = detection.kind === "dynamic" && detection.activity
        ? buildDynamicVideoPrompt({
            activity: detection.activity,
            basePrompt: composedPrompt,
            durationSec: TARGET_BEAT_SEC,
            aspectRatio: "16:9",
          })
        : null;
      beats.push({
        sceneIndex,
        beatIndex,
        isFirstOfScene: beatIndex === 0,
        text: chunk,
        words,
        imagePrompt: composedPrompt,
        motion: plan.motion as CameraMotion,
        transition: plan.transition,
        sceneType: plan.sceneType,
        sceneKind: detection.kind,
        activity: detection.activity,
        videoPrompt,
        hasCharacter: directed.hasCharacter,
      });
      globalIdx += 1;
    });
  });
  return beats;
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
export type StyleId = VDStyle;
/** "male" | "female" | "documentary_narrator" (older choices) or an ElevenLabs voice name from VOICE_CATALOG. */
export type VoiceId = string;
export type AspectRatio = "16:9" | "9:16" | "1:1";

export type VideoBrief = {
  title: string;
  videoType: VideoType;
  duration: DurationSec;
  style: StyleId;
  visualInstructions?: string;
  audio?: AudioSettings;
  voice: VoiceId;
  aspectRatio: AspectRatio;
  /** Keep the same person in every scene using a reference portrait (default on). */
  sameCharacter?: boolean;
  /** Script / subtitle / narration language ("auto" = same as the title). */
  language?: string;
  /**
   * Voice language when the script language has no AI voice (e.g. Sanskrit →
   * "Hindi"), or "none" for no voiceover. Omitted = same as `language`.
   */
  voiceLanguage?: string;
  /**
   * Script → Video: the creator's own script. When set, research and AI
   * script-writing are skipped and every scene's voiceover is the creator's
   * exact words; `duration` is fitted to the real narration length.
   */
  sourceScript?: string;
  /** Real motion: animate key beats (or all) into AI video clips. Default "off". */
  motionMode?: MotionMode;
  /** "standard" = MiniMax H3 Turbo, "premium" = Kling 2.5 Turbo Pro. */
  motionTier?: MotionTier;
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
  /** Real MP4/WebM blob returned by the renderer. Preserve this — never persist a blob URL. */
  blob: Blob;
  /** Convenience object URL created once for the initial preview. Caller owns lifecycle. */
  video_url: string;
  mime: string;
  extension: "mp4" | "webm";
  duration_sec: number;
  size_bytes: number;
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

/**
 * YouTube Retention Engine blueprint — produced BEFORE the Script Agent.
 * Encodes the professional YouTube documentary structure the entire
 * downstream pipeline (Script, Storyboard, Voice, Editing) must follow.
 */
export type RetentionBlueprint = {
  hook: { time_sec: number; line: string; rationale: string };
  intro: { start_sec: number; end_sec: number; promise: string; expectation: string };
  curiosity_loops: Array<{ opens_at_sec: number; open_phrase: string; pays_off_at_sec: number }>;
  chapters: Array<{ start_sec: number; label: string; goal: string }>;
  retention_hooks: Array<{ time_sec: number; phrase: string }>;
  pattern_interrupts: Array<{
    time_sec: number;
    kind: "stat" | "text_overlay" | "map" | "timeline" | "infographic" | "broll_change" | "transition";
    note: string;
  }>;
  emotional_climax: { time_sec: number; scene_hint: string; note: string };
  ending: { time_sec: number; summary: string; question: string };
  cta: { time_sec: number; line: string; style: string };
};

export type PipelineResult = {
  brief: VideoBrief;
  research: ResearchBrief;
  retentionEngine: RetentionBlueprint;
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
  audioTracks: PlannedAudio[];
  timeline: Timeline;
  render: RenderResult;
  thumbnail: ThumbnailResult;
  seo: SeoResult;
};

// ---------- Pipeline step ids ----------

export const PIPELINE_STEPS = [
  { id: "research", label: "Researching topic" },
  { id: "retention_engine", label: "Building YouTube retention blueprint" },
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

const STYLE_LABEL: Record<Exclude<StyleId, CinematicStyleId>, string> = {
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

export function videoStyleLabel(style: StyleId): string {
  return cinematicStyleFor(style)?.label ?? STYLE_LABEL[style as keyof typeof STYLE_LABEL] ?? STYLE_PRESETS.cinematic.label;
}

function cinematicCharacterContext(style: StyleId, title: string, visualInstructions?: string) {
  const preset = cinematicStyleFor(style);
  return preset || visualInstructions
    ? [title, visualInstructions, preset?.continuity].filter(Boolean).join(". ")
    : undefined;
}

const STYLE_ACCENT: Record<Exclude<StyleId, CinematicStyleId>, string> = {
  "3d": "#c026d3", ghibli: "#22c55e", anime: "#ec4899", realistic: "#94a3b8",
  pixar: "#f97316", cinematic: "#6366f1", documentary: "#78716c", dark_mystery: "#0ea5e9",
  luxury: "#eab308", cyberpunk: "#f0abfc", minimal_product: "#a8a29e", futuristic: "#38bdf8",
};

// Map our voice ids to the TTS provider voices (/api/tts -> openai gpt-4o-mini-tts).
const VOICE_MAP: Record<string, string> = {
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
      angle: `${videoStyleLabel(brief.style)} take on "${brief.title}"`,
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

// ---------- YouTube Retention Engine (runs BEFORE the Script Agent) ----------
//
// Produces a professional YouTube documentary blueprint that the Script,
// Storyboard, Voice, and Editing agents ALL follow. Everything downstream
// keys off of this — hook, intro promise, curiosity loops, chapter beats,
// retention hooks (curiosity statements every 30-60s), pattern interrupts
// (dramatic overlays / stats / maps / timelines / infographics / b-roll
// changes / transitions every 20-40s), emotional climax at 80-90%, ending
// question, and a natural CTA.

const RETENTION_PHRASES = [
  "But that's only the beginning…",
  "Then everything changed…",
  "What happened next shocked everyone…",
  "And that was the smallest part of the story…",
  "But here's the twist most people miss…",
  "The real reason wasn't what anyone expected…",
  "And then — everything fell apart…",
  "The moment nobody saw coming…",
];

const PATTERN_INTERRUPT_KINDS = [
  "stat", "text_overlay", "map", "timeline", "infographic", "broll_change", "transition",
] as const;

export const RetentionEngineAgent = {
  async run(brief: VideoBrief, research: ResearchBrief): Promise<RetentionBlueprint> {
    const total = brief.duration;
    const topic = research.topic || brief.title;

    // Hook = 0-30s (or first 15% for shorter formats)
    const hookEnd = Math.min(30, Math.max(3, total * 0.1));

    // Intro = 30-60s (or 10-20% for shorter formats)
    const introStart = hookEnd;
    const introEnd = Math.min(60, Math.max(introStart + 5, total * 0.15));

    // Retention hooks every 30-60s (30s for long videos, 20s for shorts)
    const retentionEvery = total <= 60 ? 15 : total <= 300 ? 30 : 45;
    const retention_hooks: RetentionBlueprint["retention_hooks"] = [];
    for (let t = introEnd + retentionEvery; t < total * 0.85; t += retentionEvery) {
      retention_hooks.push({
        time_sec: Math.round(t),
        phrase: RETENTION_PHRASES[retention_hooks.length % RETENTION_PHRASES.length],
      });
    }

    // Pattern interrupts every 20-40s
    const interruptEvery = total <= 60 ? 12 : total <= 300 ? 25 : 35;
    const pattern_interrupts: RetentionBlueprint["pattern_interrupts"] = [];
    for (let t = introEnd + interruptEvery / 2; t < total * 0.9; t += interruptEvery) {
      const kind = PATTERN_INTERRUPT_KINDS[pattern_interrupts.length % PATTERN_INTERRUPT_KINDS.length];
      pattern_interrupts.push({
        time_sec: Math.round(t),
        kind,
        note: `Cut to a ${kind.replace("_", " ")} that reframes ${topic} — break the visual pattern.`,
      });
    }

    // Curiosity loops: open near start of each third, pay off later
    const curiosity_loops: RetentionBlueprint["curiosity_loops"] = [];
    const loopCount = total <= 60 ? 1 : total <= 300 ? 2 : 3;
    for (let i = 0; i < loopCount; i++) {
      const opens = Math.round(introEnd + ((total * 0.7 - introEnd) * i) / Math.max(1, loopCount));
      const pays = Math.round(opens + (total - opens) * 0.55);
      curiosity_loops.push({
        opens_at_sec: opens,
        open_phrase: i === 0
          ? `But before we get to the biggest reveal about ${topic}, you need to understand this first…`
          : `And there's one more twist I promised I'd come back to…`,
        pays_off_at_sec: Math.min(Math.round(total * 0.9), pays),
      });
    }

    // Chapters: hook, intro, N main-story chapters, climax, ending, cta
    const climaxTime = Math.round(total * 0.85);
    const endingTime = Math.round(total * 0.93);
    const ctaTime = Math.round(total * 0.97);
    const mainCount = Math.max(2, Math.min(5, Math.round(total / 90)));
    const mainSpan = climaxTime - introEnd;
    const chapters: RetentionBlueprint["chapters"] = [
      { start_sec: 0, label: "Hook", goal: `Stop the scroll — pose the irresistible question about ${topic}.` },
      { start_sec: Math.round(introStart), label: "Intro", goal: "Set expectations and promise the payoff." },
    ];
    for (let i = 0; i < mainCount; i++) {
      chapters.push({
        start_sec: Math.round(introEnd + (mainSpan * i) / mainCount),
        label: `Chapter ${i + 1}`,
        goal: "Advance the main story with a clean transition from the previous chapter.",
      });
    }
    chapters.push({ start_sec: climaxTime, label: "Climax", goal: "Land the strongest emotional moment of the video." });
    chapters.push({ start_sec: endingTime, label: "Ending", goal: "Summarize and leave the viewer with a question." });
    chapters.push({ start_sec: ctaTime, label: "CTA", goal: "Natural, channel-fit subscribe prompt." });

    return {
      hook: {
        time_sec: 0,
        line: `What if everything you thought you knew about ${topic} was wrong?`,
        rationale: "Contrarian curiosity gap — promises a payoff and forces the viewer to keep watching.",
      },
      intro: {
        start_sec: Math.round(introStart),
        end_sec: Math.round(introEnd),
        promise: `By the end of this video you'll understand the real story behind ${topic} — and why almost everyone gets it wrong.`,
        expectation: `Set up 3 things the viewer will learn about ${topic}, without giving away the payoff.`,
      },
      curiosity_loops,
      chapters,
      retention_hooks,
      pattern_interrupts,
      emotional_climax: {
        time_sec: climaxTime,
        scene_hint: `The single most emotional moment of the ${topic} story — the reveal, the collapse, the turning point.`,
        note: "This is where retention peaks. Slow the pacing, drop the music, land the line.",
      },
      ending: {
        time_sec: endingTime,
        summary: `Recap the arc of ${topic} in two short sentences.`,
        question: `So — what would YOU have done differently?`,
      },
      cta: {
        time_sec: ctaTime,
        line: `If this changed the way you see ${topic}, there's a follow-up video I made just for you — it's linked right here.`,
        style: "Conversational, no shouting, references the next video rather than begging for a subscribe.",
      },
    };
  },
};

/** Serialize a blueprint into the compact brief the Script Agent prompt injects. */
export function formatRetentionBrief(bp: RetentionBlueprint): string {
  const secs = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  const lines: string[] = [];
  lines.push(`HOOK (${secs(bp.hook.time_sec)}): "${bp.hook.line}"`);
  lines.push(`INTRO (${secs(bp.intro.start_sec)}-${secs(bp.intro.end_sec)}): promise = ${bp.intro.promise}`);
  lines.push(`CURIOSITY LOOPS:`);
  bp.curiosity_loops.forEach((l, i) => {
    lines.push(`  ${i + 1}. open at ${secs(l.opens_at_sec)}: "${l.open_phrase}" — pay off by ${secs(l.pays_off_at_sec)}`);
  });
  lines.push(`CHAPTERS:`);
  bp.chapters.forEach((c) => lines.push(`  ${secs(c.start_sec)} — ${c.label}: ${c.goal}`));
  lines.push(`RETENTION HOOKS (insert these curiosity statements at the times below):`);
  bp.retention_hooks.forEach((h) => lines.push(`  ${secs(h.time_sec)}: "${h.phrase}"`));
  lines.push(`PATTERN INTERRUPTS (every 20-40s — mark visually in on_screen_text/visual):`);
  bp.pattern_interrupts.forEach((p) => lines.push(`  ${secs(p.time_sec)} [${p.kind}]: ${p.note}`));
  lines.push(`EMOTIONAL CLIMAX at ${secs(bp.emotional_climax.time_sec)} (~85% mark): ${bp.emotional_climax.scene_hint}`);
  lines.push(`ENDING at ${secs(bp.ending.time_sec)}: ${bp.ending.summary} Close with the question: "${bp.ending.question}"`);
  lines.push(`CTA at ${secs(bp.cta.time_sec)}: "${bp.cta.line}" (${bp.cta.style})`);
  return lines.join("\n");
}

export const ScriptAgent = {
  async run(
    brief: VideoBrief,
    research: ResearchBrief,
    onRetry?: (attempt: number, error: unknown) => void,
    blueprint?: RetentionBlueprint,
  ): Promise<AiVideoScript> {
    const retentionBrief = blueprint ? formatRetentionBrief(blueprint) : "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const script = await generateAiVideoScript({
          data: {
            topic: research.topic,
            tone: videoStyleLabel(brief.style),
            platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType],
            styleLabel: videoStyleLabel(brief.style),
            contentType: contentTypeFor(brief),
            audience: research.audience,
            targetLengthSec: brief.duration,
            retentionBrief,
            visualInstructions: brief.visualInstructions,
            // Detect from the title when not chosen, so a Telugu title gets a Telugu script.
            language: brief.language ?? "auto",
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
    const fallback = buildFallbackVideoScript(brief.title, sceneCount, brief.duration, brief.aspectRatio, videoStyleLabel(brief.style));
    return {
      ...fallback,
      debug_json: { raw_responses: [], parse_errors: ["Script generation used a structured fallback after 3 failed attempts."], attempts: 3, used_repair: false, used_fallback: true },
    };
  },
};

/** Script → Video: scenes from the creator's own script (exact words; AI adds visuals only). */
export const UserScriptAgent = {
  async run(brief: VideoBrief): Promise<AiVideoScript> {
    const { splitScriptIntoLines } = await import("@/lib/script-to-video");
    const { resolveContentLanguage } = await import("@/lib/content-language");
    const { planScriptToVideo } = await import("@/lib/video-ai.functions");
    const lines = splitScriptIntoLines(brief.sourceScript ?? "");
    if (!lines.length) throw new Error("Your script is empty.");
    return planScriptToVideo({
      data: {
        lines,
        language: resolveContentLanguage(brief.language, brief.sourceScript ?? brief.title),
        styleLabel: videoStyleLabel(brief.style),
        visualInstructions: brief.visualInstructions,
        contentType: contentTypeFor(brief),
        aspectRatio: brief.aspectRatio,
      },
    });
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
      color_grade: `${videoStyleLabel(brief.style)} grade — ${cinematicStyleFor(brief.style)?.accent ?? STYLE_ACCENT[brief.style as keyof typeof STYLE_ACCENT]} accent`,
      music_direction: cinematicStyleFor(brief.style)?.music ?? `${videoStyleLabel(brief.style)} underscore, tempo matches pacing`,
      sfx_moments: cinematicStyleFor(brief.style)
        ? storyboard.shots.filter((shot) => shot.description?.trim()).map((shot) =>
            `Scene ${shot.n}: ${shot.description}. ${cinematicStyleFor(brief.style)?.sound}`)
        : storyboard.shots.slice(0, 3).map((shot) => `whoosh on shot ${shot.n}`),
    };
  },
};

// ---------- Visual generation (real AI image per scene) ----------

async function fetchSceneImage(prompt: string, style: StyleId, ratio: AspectRatio): Promise<string | null> {
  // The Visual Director already fully composes the cinematic prompt
  // (subject, camera, lens, lighting, grade, negatives, continuity). Do NOT
  // pre/post-fix it with another style descriptor — that would fight the
  // Director's shot type + continuity anchor and produce generic images.
  const { image } = await fetchGeneratedImage({ prompt, ratio });
  return image;
}

/**
 * Animate a beat's still image into a real AI video clip (image-to-video).
 * Starts the job on the server (credits reserved there), then polls until
 * it's ready. Returns the clip as a Blob, or null on any failure — the caller
 * then keeps the still image, and the server refunds a failed clip.
 */
async function fetchMotionClip(
  image: string,
  prompt: string,
  beatSeconds: number,
  tier: MotionTier,
  signal?: AbortSignal,
): Promise<Blob | null> {
  try {
    const start = await authFetch("/api/generate-video-clip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, prompt, beatSeconds, tier }),
      signal,
    });
    const job = (await start.json().catch(() => ({}))) as { ok?: boolean; token?: string; reason?: string };
    if (!start.ok || !job.ok || !job.token) {
      console.warn("[motion] clip not started:", job.reason ?? start.status);
      return null;
    }
    // Clips take ~1–3 minutes. Poll every 5 s for up to 8 minutes.
    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      if (signal?.aborted) return null;
      await new Promise((r) => setTimeout(r, 5000));
      const res = await authFetch("/api/video-clip-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: job.token }),
        signal,
      });
      const st = (await res.json().catch(() => ({}))) as { state?: string; url?: string; error?: string };
      if (st.state === "completed" && st.url) {
        const file = await fetch(st.url, { signal });
        if (!file.ok) return null;
        const blob = await file.blob();
        return blob.size > 0 ? blob : null;
      }
      if (st.state === "failed") {
        console.warn("[motion] clip failed:", st.error);
        return null;
      }
    }
    console.warn("[motion] clip timed out");
    return null;
  } catch (e) {
    if ((e as { name?: string })?.name !== "AbortError") console.warn("[motion] clip error", e);
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
        // Dynamic Scene Detection routing (see generateOneShot for details).
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
    audioTracks: PlannedAudio[] = [],
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

    // Fixed length: each scene keeps its planned slot (slots add up to the
    // requested duration) and its narration is fitted INTO that slot — sped
    // up to ≤1.3×, tail faded only if still too long. So voices never overlap
    // the next scene and audio and video end together at brief.duration.
    const sceneIdxs = [...bySceneIdx.keys()].sort((a, b) => a - b);
    const planned = sceneIdxs.map((si) => {
      const d = parseSec(script.scenes[si]?.duration ?? "");
      return d > 0 ? d : (bySceneIdx.get(si)!.length * TARGET_BEAT_SEC);
    });
    const slots = slotsForTarget(planned, brief.duration);
    const fits = fitNarrationToSlots(slots, sceneIdxs.map((si) => voice[si]?.buffer?.duration ?? null));
    const beatRates: number[] = new Array(beats.length).fill(1);
    const beatCut: Array<number | null> = new Array(beats.length).fill(null);

    sceneIdxs.forEach((sceneIdx, k) => {
      const globalBeatIndices = bySceneIdx.get(sceneIdx)!;
      const sceneBeats = globalBeatIndices.map((i) => beats[i]);
      const vo = voice[sceneIdx];
      const durations = distributeAudioAcrossBeats(sceneBeats, slots[k]);
      globalBeatIndices.forEach((gi, j) => {
        beatDurations[gi] = durations[j];
      });
      // Attach the scene's continuous audio buffer to the FIRST beat only —
      // it plays through the subsequent beats' visuals uninterrupted.
      const firstGi = globalBeatIndices[0];
      beatAudio[firstGi] = vo?.buffer ?? null;
      beatRates[firstGi] = fits[k].rate;
      beatCut[firstGi] = fits[k].trimmed ? fits[k].playSec : null;
    });
    const trimmedScenes = fits.filter((f) => f.trimmed).length;
    if (trimmedScenes) console.warn(`[render] ${trimmedScenes} scene(s) had narration longer than their slot even at ${MAX_FIT_SPEEDUP}× — tail faded out`);

    const scenes: RenderScene[] = beats.map((b, i) => ({
      n: i + 1,
      audioSceneId: sceneAudioId(script.scenes[b.sceneIndex] ?? { n: b.sceneIndex + 1 }),
      visual: b.imagePrompt,
      voiceover: b.text,
      duration: `${beatDurations[i].toFixed(2)}s`,
      // On-screen text only on the first beat of a scene, using the script's overlay when present.
      on_screen_text: b.isFirstOfScene ? (script.scenes[b.sceneIndex]?.on_screen_text ?? "") : "",
      motion: b.motion,
      transition: b.transition,
    }));

    const mixAssets = await decodeAudioAssets(audioTracks.filter((track) =>
      isAudioTrackEnabled(brief.audio, track.request.track)));
    const result = await renderVideo({
      audioSettings: brief.audio,
      mixAssets: mixAssets.map((track) => ({
        track: track.request.track, sceneIds: track.sceneIds, offset: track.offset, gain: track.gain, buffer: track.buffer,
      })),
      title: brief.title,
      platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType],
      contentType: contentTypeFor(brief),
      styleId: mapStyleForRenderer(brief.style),
      scenes,
      sceneImages: beatVisuals.map((v) => (v.kind === "image" ? v.url : null)),
      sceneMedia: beatVisuals.map((v) => ({ kind: v.kind, url: v.url })),
      sceneAudio: beatAudio,
      fitToAudio: false,
      targetDurationSec: brief.duration,
      exactTimeline: true, // slots already add up to brief.duration
      audioRates: beatRates,
      audioCutSec: beatCut,
      onProgress,
    });
    return {
      blob: result.blob,
      video_url: URL.createObjectURL(result.blob),
      mime: result.mimeType,
      extension: result.extension,
      duration_sec: result.durationSec,
      size_bytes: result.blob.size,
      aspect_ratio: brief.aspectRatio,
    };
  },
};

// ---------- Voiceover (real TTS per scene, continuous narration) ----------

/** Voice language for a brief: the chosen fallback, else the script language ("auto" → guessed per clip). */
function briefVoiceLanguage(brief: VideoBrief): string | undefined {
  if (brief.voiceLanguage) return brief.voiceLanguage;
  return brief.language && brief.language !== "auto" ? brief.language : undefined;
}

async function fetchSceneAudio(text: string, voice: VoiceId, ctx: AudioContext, language?: string | null): Promise<{ blobUrl: string; buffer: AudioBuffer } | null> {
  if (language === "none" || !text?.trim()) return null;
  try {
    const res = await ttsFetch(text, VOICE_MAP[voice] ?? voice, language);
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
    if (brief.audio?.voiceoverEnabled === false || briefVoiceLanguage(brief) === "none") return [];
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    const total = script.scenes.length;
    let done = 0;
    onProgress?.(0, total);
    const results = await Promise.all(
      script.scenes.map(async (s) => {
        const audio = await fetchSceneAudio(s.voiceover, brief.voice, ctx, briefVoiceLanguage(brief));
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

async function generateVideoAudio(
  brief: VideoBrief,
  jobId: string,
  direction: DirectorPlan,
  script: AiVideoScript,
  signal?: AbortSignal,
  previous: PlannedAudio[] = [],
) {
  const tracks = planVideoAudio({
    jobId, title: brief.title, style: videoStyleLabel(brief.style), duration: brief.duration,
    musicDirection: direction.music_direction, settings: brief.audio, scenes: script.scenes,
  });
  const sameRequest = (left: PlannedAudio, right: PlannedAudio) =>
    left.request.track === right.request.track &&
    (left.request.prompt === right.request.prompt ||
      (left.selectionKey !== undefined && left.selectionKey === right.selectionKey)) &&
    (left.request.track === "music" || left.request.duration === right.request.duration) &&
    (left.request.track !== "sfx" || left.sceneIds[0] === right.sceneIds[0]);
  const matched = new Set<PlannedAudio>();
  for (const track of tracks) {
    const saved = previous.find((item) => !matched.has(item) && sameRequest(item, track));
    if (saved) {
      track.request = saved.request;
      matched.add(saved);
    }
  }
  const used = new Set(previous.map(({ request }) => `${request.track}:${request.slot}`));
  for (const track of tracks) {
    signal?.throwIfAborted();
    if (!previous.some((item) => item.request === track.request)) {
      const slot = Array.from({ length: AUDIO_LIMITS[track.request.track] }, (_, index) => index)
        .find((index) => !used.has(`${track.request.track}:${index}`));
      if (slot === undefined) {
        track.error = "This edit needs a new audio generation slot. Disable the affected track or use a new video job.";
        continue;
      }
      track.request.slot = slot;
      used.add(`${track.request.track}:${slot}`);
    }
    try {
      track.asset = await generateAudio(track.request, signal);
    } catch (error) {
      signal?.throwIfAborted();
      track.error = error instanceof Error ? error.message : "Audio generation failed";
    }
  }
  return tracks;
}

function stripAudioUrls(tracks: PlannedAudio[]) {
  return tracks.map((track) => ({
    ...track, asset: track.asset ? { ...track.asset, url: undefined } : undefined,
  }));
}

function mergeSavedAudio(previous: PlannedAudio[] = [], current: PlannedAudio[]) {
  const active = stripAudioUrls(current).filter((track) => track.asset);
  return [...previous.filter((item) => !active.some((track) =>
    track.request.track === item.request.track && track.request.slot === item.request.slot)), ...active];
}

export async function persistReviewAudio(jobId: string, bundle: AssetGenerationBundle) {
  const job = await getJob(jobId);
  if (!job) return;
  job.audioTracks = mergeSavedAudio(job.audioTracks, bundle.audioTracks);
  job.audioMixSettings = bundle.brief.audio;
  await saveJob(job);
}

export async function previewReviewAudio(bundle: AssetGenerationBundle) {
  const { brief, script, voiceover } = bundle;
  const durations = slotsForTarget(script.scenes.map((scene) => parseSec(scene.duration)), brief.duration);
  const narration = voiceover.map((clip) => clip.buffer ?? null);
  const fits = fitNarrationToSlots(durations, durations.map((_, i) => narration[i]?.duration ?? null));
  const assets = await decodeAudioAssets(bundle.audioTracks.filter((track) =>
    isAudioTrackEnabled(brief.audio, track.request.track)));
  return previewAudioMix({
    durations, narration, settings: brief.audio, sceneIds: script.scenes.map(sceneAudioId),
    rates: fits.map((fit) => fit.rate), cuts: fits.map((fit) => fit.trimmed ? fit.playSec : null),
    assets: assets.map((track) => ({
      track: track.request.track, sceneIds: track.sceneIds, offset: track.offset, gain: track.gain, buffer: track.buffer,
    })),
  });
}

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
  const map: Record<Exclude<StyleId, CinematicStyleId>, string> = {
    "3d": "3d", ghibli: "ghibli", anime: "anime", realistic: "realistic",
    pixar: "pixar", cinematic: "cinematic", documentary: "documentary",
    dark_mystery: "dark", luxury: "ancient", cyberpunk: "cyberpunk",
    minimal_product: "minimal", futuristic: "cinematic",
  };
  return cinematicStyleFor(id)?.renderer ?? map[id as keyof typeof map] ?? "cinematic";
}

// ---------- Thumbnail (layered, high-CTR via Thumbnail Director) ----------
//
// Uses the Thumbnail Director's concept planner so the video pipeline emits the
// same 4-concept high-CTR structure (Fear / Curiosity / Documentary / Minimal)
// as the standalone Thumbnails page. Text is generated automatically but NOT
// baked into the image — downstream UI overlays it via HTML/CSS so it stays
// perfectly spelled and editable.

import { planThumbnails } from "@/lib/thumbnail-director";

const THUMB_NON_LATIN = /[\u0400-\u04FF\u0590-\u06FF\u0900-\u0DFF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;

/**
 * Full-scene thumbnail prompt built from the video's own content. The old
 * version asked for an empty "background only" plate (meant for compositing
 * a subject that the video pipeline never added), so thumbnails came out as
 * empty, off-topic scenes. Non-English titles are never quoted, so the image
 * model can't paint them as garbled text.
 */
function videoThumbnailPrompt(
  brief: VideoBrief,
  script: AiVideoScript | null | undefined,
  mood: string,
  modifier: string,
): string {
  const visuals = (script?.scenes ?? [])
    .map((sc) => (sc.visual || "").trim())
    .filter((v) => v && !THUMB_NON_LATIN.test(v))
    .slice(0, 3);
  const titleIsEnglish = !THUMB_NON_LATIN.test(brief.title);
  const about = titleIsEnglish
    ? `a video about ${brief.title.replace(/["“”]/g, "")}`
    : `this video`;
  return [
    `Eye-catching YouTube thumbnail image for ${about}.`,
    visuals.length ? `Show the key moment: ${visuals[0]}.` : "",
    visuals.length > 1 ? `Context: ${visuals.slice(1).join("; ")}.` : "",
    `Mood: ${mood}. ${modifier}.`,
    `One clear hero subject, close framing, expressive emotion, bold contrasting colors, dramatic lighting, 16:9.`,
    `Keep the top third simple so a headline can be added on top later.`,
    `Absolutely no written words, letters, numbers, captions, signs, labels, watermarks or logos anywhere in the image.`,
  ].filter(Boolean).join(" ");
}

export const ThumbnailAgent = {
  async run(brief: VideoBrief, script?: AiVideoScript | null): Promise<ThumbnailResult> {
    const topic = brief.title;
    const plan = planThumbnails(topic);

    const results = await Promise.all(
      plan.concepts.map(async (c) => {
        // Text-free image; the headline is overlaid by the UI so it stays
        // spelled correctly (in any language) and editable.
        const prompt = videoThumbnailPrompt(brief, script, c.label.toLowerCase(), c.style.bgPromptModifier);
        const url = await fetchSceneImage(prompt, brief.style, "16:9");
        if (url) {
          return {
            url,
            alt: `${topic} — ${c.label}`,
            headline: c.headline,
            concept: c.label,
            generated: true,
          };
        }
        return {
          url: placeholderImage("16:9", topic),
          alt: `${topic} — ${c.label}`,
          headline: c.headline,
          concept: c.label,
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
          styleLabel: videoStyleLabel(brief.style),
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
        data: { topic: research.topic || brief.title, styleLabel: videoStyleLabel(brief.style), platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType] },
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
        data: { topic: research.topic || brief.title, styleLabel: videoStyleLabel(brief.style), platform: VIDEO_TYPE_TO_PLATFORM[brief.videoType], currentHook: "" },
      });
    } catch (e) {
      console.error("[HookAgent] failed, using fallback", e);
      return {
        voiceover: `What if everything you knew about ${brief.title} was wrong?`,
        on_screen_text: "",
        visual: `${videoStyleLabel(brief.style)} cinematic opening shot on ${brief.title}, dramatic lighting.`,
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

  // Creative Director — detect intent + build a visual brief FIRST so every
  // downstream agent (script, storyboard, visuals) obeys the visual hero,
  // camera style, and avoid list. Uses the heuristic so it never blocks.
  const cdIntent = detectIntentHeuristic(brief.title);
  const creativeBrief = buildBriefFromIntent(brief.title, cdIntent.intent, cdIntent.confidence);

  const research = await mark("research", () => ResearchAgent.run(brief));

  // YouTube Retention Engine — builds the professional documentary blueprint
  // FIRST so every downstream agent (script, storyboard, voice, editing)
  // renders against the same structural plan.
  const retentionEngine = await mark("retention_engine", () => RetentionEngineAgent.run(brief, research));

  // Pre-script agents (Title / Hook run in parallel — independent).
  const [titles, hook] = await Promise.all([
    mark("title", () => TitleOptimizerAgent.run(brief, research)),
    mark("hook", () => HookAgent.run(brief, research)),
  ]);

  // Prefer the retention engine's hook line — that's the source of truth.
  const effectiveHook: VideoHook = {
    ...hook,
    voiceover: retentionEngine.hook.line || hook.voiceover,
  };

  const script = await mark("script", () => brief.sourceScript?.trim()
    ? UserScriptAgent.run(brief)
    : ScriptAgent.run(brief, research, () => {
        onStep("script", "running", "Script generation failed. Retrying...");
      }, retentionEngine));

  // Apply the retention engine's hook line to scene 1 so the video opens
  // with the blueprint's hook verbatim.
  if (!brief.sourceScript?.trim() && script.scenes[0] && effectiveHook.voiceover.trim().length > 0) {
    script.scenes[0] = {
      ...script.scenes[0],
      voiceover: effectiveHook.voiceover,
      on_screen_text: effectiveHook.on_screen_text || script.scenes[0].on_screen_text,
      visual: effectiveHook.visual || script.scenes[0].visual,
    };
  }

  // Intro / Curiosity are derived from the finished script (deterministic).
  const intro = await mark("intro", () => IntroAgent.run(brief, script));
  const curiosity = await mark("curiosity", () => CuriosityLoopAgent.run(script));
  const retention = await mark("retention", () => RetentionAgent.run(brief, script, curiosity));
  const chapters = await mark("chapters", () => ChapterAgent.run(script));

  const storyboard = await mark("storyboard", () => StoryboardAgent.run(script));
  const direction = await mark("direction", () => DirectorAgent.run(brief, storyboard));

  const beats = expandScriptToBeats(script, brief.style, brief.title, creativeBrief, null, brief.visualInstructions);

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
  const audioTracks = await mark("music", () => generateVideoAudio(brief, crypto.randomUUID(), direction, script));
  const render = await mark("render", () =>
    RenderAgent.run(brief, script, beats, visuals, voiceover, (p: number) =>
      onStep("render", "running", `${Math.round(p * 100)}%`), audioTracks
    ),
  );
  const thumbnail = await mark("thumbnail", () => ThumbnailAgent.run(brief, script));
  const seo = await mark("seo", () => SeoAgent.run(brief, script, timeline));

  validatePipelineDuration({
    requestedSec: brief.duration,
    voiceoverSec: voiceover.reduce((a, v) => a + (v.buffer?.duration ?? v.duration_sec ?? 0), 0),
    timelineSec: timeline.total_sec,
    renderedSec: render.duration_sec,
  });

  return {
    brief, research, retentionEngine, titles, hook: effectiveHook, intro, curiosity, script, retention, chapters,
    storyboard, direction, visuals, voiceover, subtitles, audioTracks, timeline,
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
  return message.includes("AI gateway 402") || message.includes("AI gateway 429") || message.includes("Unauthorized") || message.includes(AI_NOT_CONFIGURED);
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

export const STYLES: { id: StyleId; label: string }[] = (Object.keys(STYLE_PRESETS) as StyleId[])
  .map((id) => ({ id, label: videoStyleLabel(id) }));

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
  | "review"
  | "generating_shots"
  | "voiceover"
  | "asset_review"
  | "rendering"
  | "validating"
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read image"));
    r.readAsDataURL(blob);
  });
}

// ---------- Character consistency (one reference portrait per video) ----------
//
// Text-only prompts give a different face in every scene, however detailed
// the character sheet. So each video gets ONE reference portrait of its main
// character (made from the Character Bible), and every shot that shows the
// character is rendered from that portrait with an image-reference model.
// B-roll shots (no person) stay on the fast text-to-image model.

const characterRefCache = new Map<string, Promise<string | null>>();
const CHARACTER_REFERENCE_ERROR = "Character reference generation failed. Retry the failed shots to try again.";

/** Returns the job's character reference portrait (data URL), creating it once. */
async function ensureCharacterReference(
  job: JobRecord,
  brief: VideoBrief,
): Promise<string | null> {
  if (brief.sameCharacter === false) return null;
  if (!job.shots.some((s) => s.hasCharacter !== false)) return null;
  const cached = characterRefCache.get(job.id);
  if (cached) return cached;
  const p = (async () => {
    if (job.characterRefKey) {
      const url = await loadShotObjectURL(job.characterRefKey);
      if (url) {
        try {
          return await blobToDataUrl(await (await fetch(url)).blob());
        } catch { /* fall through and recreate */ }
      }
    }
    const cd = detectIntentHeuristic(brief.title);
    const cb = buildBriefFromIntent(brief.title, cd.intent, cd.confidence);
    const bible = defaultCharacterBibleFor(brief.title, cb.intent, cinematicCharacterContext(brief.style, brief.title, brief.visualInstructions));
    const preset = STYLE_PRESETS[brief.style as VDStyle];
    const portraitPrompt = preset?.isIllustrated
      ? `${preset.label} illustration style character design. ${bible.masterPortraitPrompt.replace(/ARRI Alexa quality, photorealistic 8K\./, "")}`
      : `${videoStyleLabel(brief.style)} look. ${bible.masterPortraitPrompt}`;
    const { image, error } = await fetchGeneratedImage({ prompt: portraitPrompt, ratio: "1:1", quality: "high" });
    if (!image) {
      console.warn("[character-ref] could not create the reference portrait", error);
      return null;
    }
    const blob = await dataUrlToBlob(image);
    job.characterRefKey = await saveShotBlob(job.id, "character", blob);
    await saveJob(job);
    return image;
  })().catch((error: unknown) => {
    console.warn("[character-ref] could not load or save the reference portrait", error);
    return null;
  }).finally(() => {
    characterRefCache.delete(job.id);
  });
  characterRefCache.set(job.id, p);
  return p;
}

/** Render a shot that shows the main character, anchored to the reference portrait. */
async function fetchSceneImageWithCharacter(prompt: string, reference: string, ratio: AspectRatio): Promise<string | null> {
  const { image } = await fetchGeneratedImage({
    prompt:
      "Use the reference image ONLY for the person's identity: keep exactly the same face, " +
      "hairstyle, skin tone, body type and outfit. Create a completely NEW frame as described " +
      "below — new pose, action, camera angle, framing, location and lighting. Do not copy the " +
      "reference photo's pose, framing or plain studio background.\n\n" + prompt,
    ratio,
    referenceImages: [reference],
  });
  return image;
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
    transition: ((s.transition as TransitionStyle) || "fade"),
    sceneType: ((s.sceneType as SceneType) || "explainer"),
    sceneKind: (s.sceneKind as SceneKind) || "static",
    activity: (s.activity as DynamicActivity | null) ?? null,
    videoPrompt: s.videoPrompt ?? null,
    hasCharacter: s.hasCharacter !== false,
    // Note: buildBeatImagePrompt already applied when the shot was created.
    _styleHint: style,
  } as unknown as Beat));
}

function planShots(
  script: AiVideoScript,
  style: StyleId,
  title: string,
  brief?: CreativeBrief | null,
  visualInstructions?: string,
): ShotRecord[] {
  const beats = expandScriptToBeats(script, style, title, brief ?? null, null, visualInstructions);
  return beats.map<ShotRecord>((b, i) => ({
    id: `s${i + 1}`,
    index: i,
    sceneIndex: b.sceneIndex,
    audioSceneId: script.scenes[b.sceneIndex]?.audioSceneId,
    beatIndex: b.beatIndex,
    isFirstOfScene: b.isFirstOfScene,
    text: b.text,
    words: b.words,
    prompt: b.imagePrompt,
    motion: b.motion,
    transition: b.transition,
    sceneType: b.sceneType,
    sceneKind: b.sceneKind,
    activity: b.activity,
    videoPrompt: b.videoPrompt,
    hasCharacter: b.hasCharacter,
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
  characterRef?: string | null,
  totalShots?: number,
): Promise<{ blobKey: string; kind: "clip" | "image"; mime: string; previewUrl: string }> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  // Shots with the main character are anchored to the reference portrait so
  // the face stays the same; if that render fails, fall back to text-only.
  let img: string | null = null;
  if (characterRef && shot.hasCharacter !== false) {
    img = await fetchSceneImageWithCharacter(shot.prompt, characterRef, brief.aspectRatio);
  }
  if (brief.sameCharacter === true && shot.hasCharacter !== false && !img) {
    throw new Error(CHARACTER_REFERENCE_ERROR);
  }
  if (!img) img = await fetchSceneImage(shot.prompt, brief.style, brief.aspectRatio);
  if (!img) throw new Error("Image generation failed");

  // Real motion: animate the still into a clip for the beats the user chose
  // (key moments or all). The image is the first frame, so faces and outfits
  // stay consistent. Any failure keeps the still (camera-move) version.
  const mode = brief.motionMode ?? "off";
  if (mode !== "off" && totalShots && pickMotionBeats(totalShots, mode).includes(shot.index)) {
    // shot.prompt is the director's English, text-free frame description.
    const clipBlob = await fetchMotionClip(
      img,
      motionPromptFor(
        shot.prompt.slice(0, 500),
        cinematicStyleFor(brief.style) ? shot.prompt.split(", composed on", 1)[0] : undefined,
        [
          brief.visualInstructions,
          cinematicStyleFor(brief.style) &&
            "Preserve physical contact, costume, identity and lighting. Keep foreground and background motion consistent with the camera.",
        ].filter(Boolean).join(" "),
      ),
      TARGET_BEAT_SEC,
      brief.motionTier ?? "standard",
      signal,
    );
    if (clipBlob) {
      const key = await saveShotBlob(jobId, shot.id, clipBlob);
      const url = await loadShotObjectURL(key);
      return { blobKey: key, kind: "clip", mime: clipBlob.type || "video/mp4", previewUrl: url ?? "" };
    }
  }

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
  let retentionEngine: RetentionBlueprint;
  let storyboard: Storyboard;
  let direction: DirectorPlan;

  // Creative Director (heuristic) — steers visual hero + avoid list.
  const cdIntent = detectIntentHeuristic(brief.title);
  const creativeBrief = buildBriefFromIntent(brief.title, cdIntent.intent, cdIntent.confidence);


  const existing = opts.jobId ? await getJob(opts.jobId) : null;
  if (existing) {
    onEvent({ type: "phase", phase: "planning", note: "Resuming saved job" });
    // Rebuild planning artifacts by re-running the fast agents. Script may
    // differ slightly from the original run, but shot prompts/motions come
    // from the persisted shot records so visuals stay consistent.
    research = await ResearchAgent.run(brief);
    retentionEngine = await RetentionEngineAgent.run(brief, research);
    script = brief.sourceScript?.trim()
      ? await UserScriptAgent.run(brief)
      : await ScriptAgent.run(brief, research, undefined, retentionEngine);
    storyboard = await StoryboardAgent.run(script);
    direction = await DirectorAgent.run(brief, storyboard);
    job = existing;
  } else {
    onEvent({ type: "phase", phase: "planning" });
    research = await ResearchAgent.run(brief);
    retentionEngine = await RetentionEngineAgent.run(brief, research);
    script = brief.sourceScript?.trim()
      ? await UserScriptAgent.run(brief)
      : await ScriptAgent.run(brief, research, undefined, retentionEngine);
    storyboard = await StoryboardAgent.run(script);
    direction = await DirectorAgent.run(brief, storyboard);
    const shots = planShots(script, brief.style, brief.title, creativeBrief, brief.visualInstructions);
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
  // One reference portrait keeps the main character's face the same in every scene.
  const characterRef = pending.some((s) => s.hasCharacter !== false)
    ? await ensureCharacterReference(job, brief)
    : null;
  const poolJobs = pending.map((shot) => ({
    id: shot.id,
    run: async (sig: AbortSignal) => {
      shot.status = "running";
      shot.attempts += 1;
      return await generateOneShot(shot, brief, job.id, sig, characterRef, job.shots.length);
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
  const audioTracks = await generateVideoAudio(brief, job.id, direction, script, signal);

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
    onEvent({ type: "render", progress: p }), audioTracks,
  );
  job.renderProgress = 1;

  const thumbnail = await ThumbnailAgent.run(brief, script);
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
    brief, research, retentionEngine, titles, hook, intro, curiosity, script, retention, chapters,
    storyboard, direction, visuals, voiceover, subtitles, audioTracks, timeline,
    render, thumbnail, seo,
  };
  return { job, result };
}

// ----------------------------------------------------------------------------
// Split pipeline: planning → REVIEW gate → generation
// ----------------------------------------------------------------------------
//
// The Videos UI uses these two entrypoints instead of runVideoJobPipeline so
// that users can edit the AI blueprint (script, prompts, timings, voiceover,
// on-screen text) before any images/shots/narration/rendering is generated.
//
//   1. runPlanningPhase()   → creates the job in phase "review" and returns
//                             the AI script (used to seed the blueprint
//                             editor). Nothing else has been generated.
//   2. runGenerationPhase() → resumes an existing "review" job, optionally
//                             with an edited script from the blueprint, and
//                             runs shots → voiceover → render.

export async function runPlanningPhase(
  brief: VideoBrief,
  opts: JobRunOptions,
): Promise<{ job: JobRecord; script: AiVideoScript }> {
  const { onEvent } = opts;
  onEvent({ type: "phase", phase: "planning" });

  const cdIntent = detectIntentHeuristic(brief.title);
  const creativeBrief = buildBriefFromIntent(brief.title, cdIntent.intent, cdIntent.confidence);
  const research = await ResearchAgent.run(brief);
  const retentionEngine = await RetentionEngineAgent.run(brief, research);
  const script = brief.sourceScript?.trim()
    ? await UserScriptAgent.run(brief)
    : await ScriptAgent.run(brief, research, undefined, retentionEngine);
  const shots = planShots(script, brief.style, brief.title, creativeBrief, brief.visualInstructions);

  const job = await createJob({
    title: brief.title,
    niche: opts.niche,
    topic: opts.topic,
    briefJson: JSON.stringify(brief),
    shots,
  });
  job.phase = "review";
  await saveJob(job);
  onEvent({ type: "phase", phase: "review", note: "Review & edit blueprint before rendering." });
  return { job, script };
}

/**
 * Bundle of everything produced by asset generation. Held in memory by the
 * UI between the two review gates (blueprint review → asset review → render).
 * Not persisted because `voiceover[].buffer` is a live AudioBuffer.
 */
export type AssetGenerationBundle = {
  brief: VideoBrief;
  research: Awaited<ReturnType<typeof ResearchAgent.run>>;
  retentionEngine: Awaited<ReturnType<typeof RetentionEngineAgent.run>>;
  script: AiVideoScript;
  storyboard: Awaited<ReturnType<typeof StoryboardAgent.run>>;
  direction: Awaited<ReturnType<typeof DirectorAgent.run>>;
  voiceover: Awaited<ReturnType<typeof VoiceoverAgent.run>>;
  subtitles: Awaited<ReturnType<typeof SubtitleAgent.run>>;
  timeline: Awaited<ReturnType<typeof VideoEditingAgent.run>>;
  audioTracks: PlannedAudio[];
};

/**
 * Runs shot generation + voiceover/subtitles/timeline/music/sfx, then STOPS at
 * the "asset_review" phase. Rendering happens later in runRenderPhase, so the
 * user can preview shots, edit or regenerate individual scenes, and only
 * trigger the expensive final encode when they explicitly approve.
 */
export async function runAssetGenerationPhase(
  jobId: string,
  brief: VideoBrief,
  opts: JobRunOptions,
  editedScript?: AiVideoScript,
): Promise<{ job: JobRecord; bundle: AssetGenerationBundle }> {
  // Every charge made for this job carries its id, so a failed render can be refunded.
  setCreditJobTag(jobId);
  try {
    return await runAssetGenerationPhaseInner(jobId, brief, opts, editedScript);
  } finally {
    setCreditJobTag(null);
  }
}

async function runAssetGenerationPhaseInner(
  jobId: string,
  brief: VideoBrief,
  opts: JobRunOptions,
  editedScript?: AiVideoScript,
): Promise<{ job: JobRecord; bundle: AssetGenerationBundle }> {
  const { onEvent, signal } = opts;
  const job = await getJob(jobId);
  if (!job) throw new Error("Job not found");

  const cdIntent = detectIntentHeuristic(brief.title);
  const creativeBrief = buildBriefFromIntent(brief.title, cdIntent.intent, cdIntent.confidence);
  const research = await ResearchAgent.run(brief);
  const retentionEngine = await RetentionEngineAgent.run(brief, research);
  const script = editedScript ?? (brief.sourceScript?.trim()
    ? await UserScriptAgent.run(brief)
    : await ScriptAgent.run(brief, research, undefined, retentionEngine));
  const storyboard = await StoryboardAgent.run(script);
  const direction = await DirectorAgent.run(brief, storyboard);

  // If the user edited the blueprint, rebuild shots from the edited script so
  // every generated asset reflects the edits. Only rebuild when no in-flight
  // progress on the current shots.
  const anyProgress = job.shots.some((s) => s.status !== "pending");
  if (editedScript && !anyProgress) {
    job.shots = planShots(editedScript, brief.style, brief.title, creativeBrief, brief.visualInstructions);
    job.shotsTotal = job.shots.length;
    job.shotsDone = 0;
    job.shotsFailed = 0;
    await saveJob(job);
  }

  if (editedScript && anyProgress && job.shots.every((shot) => shot.audioSceneId)) {
    const sceneIndices = new Map(editedScript.scenes.map((scene, index) => [sceneAudioId(scene), index]));
    const retained = job.shots.filter((shot) => sceneIndices.has(shot.audioSceneId!));
    const existingSceneIds = new Set(retained.map((shot) => shot.audioSceneId));
    const additions = planShots(editedScript, brief.style, brief.title, creativeBrief, brief.visualInstructions)
      .filter((shot) => !existingSceneIds.has(shot.audioSceneId))
      .map((shot) => ({ ...shot, id: crypto.randomUUID() }));
    job.shots = [...retained, ...additions].map((shot) => ({
      ...shot, sceneIndex: sceneIndices.get(shot.audioSceneId!) ?? shot.sceneIndex,
    })).sort((left, right) => left.sceneIndex - right.sceneIndex || left.beatIndex - right.beatIndex)
      .map((shot, index) => ({ ...shot, index }));
    job.shotsTotal = job.shots.length;
  }

  // -------- Phase 2: parallel shot generation --------
  job.phase = "generating_shots";
  await saveJob(job);
  onEvent({ type: "phase", phase: "generating_shots" });

  const initial: ShotProgress[] = await Promise.all(job.shots.map(async (s) => {
    let previewUrl: string | null = null;
    if (s.status === "done" && s.blobKey) previewUrl = await loadShotObjectURL(s.blobKey);
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
  // One reference portrait keeps the main character's face the same in every scene.
  const characterRef = pending.some((s) => s.hasCharacter !== false)
    ? await ensureCharacterReference(job, brief)
    : null;
  const poolJobs = pending.map((shot) => ({
    id: shot.id,
    run: async (sig: AbortSignal) => {
      shot.status = "running";
      shot.attempts += 1;
      return await generateOneShot(shot, brief, job.id, sig, characterRef, job.shots.length);
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
          type: "shot", done, failed, total: job.shots.length,
          shot: { id: shot.id, index: shot.index, status: "done",
            kind: shot.kind, previewUrl: outcome.value.previewUrl,
            error: null, attempts: shot.attempts },
        });
      } else {
        shot.status = "failed";
        shot.error = outcome.error;
        failed += 1;
        onEvent({
          type: "shot", done, failed, total: job.shots.length,
          shot: { id: shot.id, index: shot.index, status: "failed",
            kind: null, previewUrl: null, error: outcome.error, attempts: shot.attempts },
        });
      }
      job.shotsDone = done; job.shotsFailed = failed;
      void saveJob(job);
    },
  });

  // Automatic recovery pass: if any shots failed, retry them once more before
  // giving up so we never proceed to render with a hole in the timeline.
  const stillFailed = job.shots.filter((s) => s.status === "failed");
  if (stillFailed.length > 0 && !signal?.aborted) {
    console.info("[video-pipeline] auto-retry failed shots", { count: stillFailed.length });
    const retryJobs = stillFailed.map((shot) => ({
      id: shot.id,
      run: async (sig: AbortSignal) => {
        shot.status = "running";
        shot.attempts += 1;
        return await generateOneShot(shot, brief, job.id, sig, characterRef, job.shots.length);
      },
    }));
    await runShotPool(retryJobs, {
      concurrency: 4,
      maxAttempts: 2,
      signal,
      onShotSettled: (outcome) => {
        const shot = job.shots.find((s) => s.id === outcome.id);
        if (!shot) return;
        if (outcome.ok) {
          shot.status = "done"; shot.kind = outcome.value.kind;
          shot.blobKey = outcome.value.blobKey; shot.mime = outcome.value.mime;
          shot.error = null; done += 1; failed = Math.max(0, failed - 1);
          onEvent({
            type: "shot", done, failed, total: job.shots.length,
            shot: { id: shot.id, index: shot.index, status: "done", kind: shot.kind,
              previewUrl: outcome.value.previewUrl, error: null, attempts: shot.attempts },
          });
        } else {
          shot.status = "failed"; shot.error = outcome.error;
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

  if (signal?.aborted) {
    job.phase = "paused";
    await saveJob(job);
    throw new DOMException("Aborted", "AbortError");
  }

  // -------- Phase 3: voiceover / subtitles / timeline --------
  job.phase = "voiceover";
  await saveJob(job);
  onEvent({ type: "phase", phase: "voiceover" });
  const voiceover = await VoiceoverAgent.run(brief, script, (d, t) =>
    onEvent({ type: "voiceover", done: d, total: t }),
  );
  // Script → Video: the video is as long as the creator's narration, not a
  // preset length — give every scene the time its voiceover actually needs.
  if (brief.sourceScript?.trim()) {
    let total = 0;
    script.scenes = script.scenes.map((s, i) => {
      const spoken = voiceover[i]?.duration_sec ?? 0;
      const planned = parseFloat(s.duration) || 3;
      const sec = Math.max(2.5, spoken > 0 ? spoken + 0.4 : planned);
      total += sec;
      return { ...s, duration: `${sec.toFixed(1)}s` };
    });
    brief = { ...brief, duration: Math.max(5, Math.ceil(total)) as DurationSec };
  }
  const subtitles = await SubtitleAgent.run(script, voiceover);
  const timeline = await VideoEditingAgent.run(script, voiceover);
  const audioTracks = await generateVideoAudio(brief, job.id, direction, script, signal, job.audioTracks);
  job.audioTracks = mergeSavedAudio(job.audioTracks, audioTracks);
  if (job.audioMixSettings && job.audioPlanSettings === JSON.stringify(brief.audio ?? {})) {
    brief = { ...brief, audio: job.audioMixSettings };
  } else {
    job.audioMixSettings = undefined;
    job.audioPlanSettings = JSON.stringify(brief.audio ?? {});
  }

  // -------- Stop at asset review gate --------
  job.phase = "asset_review";
  await saveJob(job);
  onEvent({ type: "phase", phase: "asset_review",
    note: "Preview shots & narration before rendering." });

  return {
    job,
    bundle: {
      brief, research, retentionEngine, script, storyboard, direction,
      voiceover, subtitles, timeline, audioTracks,
    },
  };
}

/**
 * Final render. Consumes an AssetGenerationBundle produced by
 * runAssetGenerationPhase and produces the final MP4 + thumbnail + SEO.
 * Only runs after explicit user approval on the asset-review screen.
 */
export type RenderPhaseOptions = Pick<JobRunOptions, "onEvent" | "signal"> & {
  /** Keep the browser's WebM instead of converting to MP4 on the server.
   *  Used for long videos headed to YouTube (which accepts WebM): their
   *  conversion can run past the server's time limit. */
  skipMp4?: boolean;
};

export async function runRenderPhase(
  jobId: string,
  bundle: AssetGenerationBundle,
  opts: RenderPhaseOptions,
): Promise<{ job: JobRecord; result: PipelineResult }> {
  setCreditJobTag(jobId);
  try {
    const out = await runRenderPhaseInner(jobId, bundle, opts);
    // Video delivered: close any of this job's charges still marked "reserved".
    try {
      const { settleVideoJobCredits } = await import("@/lib/video-refund.functions");
      await settleVideoJobCredits({ data: { jobId } });
    } catch (settleErr) {
      console.warn("[video-pipeline] settling job credits did not complete", settleErr);
    }
    return out;
    // A failed render is not refunded here: the shots and narration were
    // generated and charged by the server, and a browser-chosen job id can't
    // authorise a refund (audit 2026-11-26, C4). Reservations the server opened
    // and the provider failed are already refunded by the server itself.
  } finally {
    setCreditJobTag(null);
  }
}

async function runRenderPhaseInner(
  jobId: string,
  bundle: AssetGenerationBundle,
  opts: RenderPhaseOptions,
): Promise<{ job: JobRecord; result: PipelineResult }> {
  const { onEvent } = opts;
  const job = await getJob(jobId);
  if (!job) throw new Error("Job not found");
  const {
    brief, research, retentionEngine, script, storyboard, direction,
    voiceover, subtitles, timeline, audioTracks,
  } = bundle;

  // Gate: every planned shot must have a generated asset before we start
  // rendering — otherwise the timeline has a hole and the export ends up
  // showing a static placeholder for that beat.
  const missing = job.shots.filter((s) => s.status !== "done" || !s.blobKey);
  if (missing.length > 0) {
    const msg = `Cannot render: ${missing.length} shot${missing.length === 1 ? "" : "s"} did not generate. Please retry generation.`;
    job.phase = "failed"; job.error = msg;
    await saveJob(job);
    onEvent({ type: "phase", phase: "failed" });
    onEvent({ type: "error", message: msg });
    throw new Error(msg);
  }

  job.phase = "rendering";
  await saveJob(job);
  onEvent({ type: "phase", phase: "rendering" });
  console.info("[video-pipeline] rendering", { jobId, shots: job.shots.length, target: brief.duration });

  const visuals: VisualAsset[] = await Promise.all(job.shots.map(async (s, i) => {
    let url: string | null = null;
    if (s.blobKey) url = await loadShotObjectURL(s.blobKey);
    if (!url) url = placeholderImage(brief.aspectRatio, `Shot ${i + 1}`);
    return {
      n: i + 1, kind: (s.kind ?? "image"), url,
      duration_sec: TARGET_BEAT_SEC, generated: s.status === "done",
    };
  }));

  const beats = beatsFromShots(job, brief.style);
  const render = await RenderAgent.run(brief, script, beats, visuals, voiceover, (p) =>
    onEvent({ type: "render", progress: p }), audioTracks,
  );
  job.renderProgress = 1;

  // Validate the produced file before we mark the job complete. If the
  // browser can't decode metadata or the file is empty, mark the job failed
  // instead of returning a broken preview.
  job.phase = "validating";
  await saveJob(job);
  onEvent({ type: "phase", phase: "validating" });
  // A crash inside the checker itself must not throw away a finished render;
  // only a real "this file is broken" verdict fails the job.
  let validation: Awaited<ReturnType<typeof validateRenderedVideo>>;
  try {
    validation = await validateRenderedVideo(render.blob ?? null, brief.duration);
  } catch (e) {
    console.warn("[video-pipeline] validation could not run; keeping the render", e);
    validation = {
      ok: !!render.blob && render.blob.size > 0,
      reason: render.blob && render.blob.size > 0 ? null : "empty file",
      detectedDuration: null,
      size: render.blob?.size ?? 0,
      mime: render.blob?.type ?? "",
    };
  }
  console.info("[video-pipeline] validation", validation);
  if (!validation.ok) {
    const msg = `Rendered video failed validation: ${validation.reason ?? "unknown"}`;
    job.phase = "failed"; job.error = msg;
    await saveJob(job);
    onEvent({ type: "phase", phase: "failed" });
    onEvent({ type: "error", message: msg });
    throw new Error(msg);
  }

  // Convert the browser recording (720p WebM, no duration header) into a
  // 1080p H.264 MP4 on the server — what Instagram / Shorts expect. Keeps the
  // original if conversion isn't available.
  if (render.blob && render.blob.size > 0 && !opts.skipMp4) {
    const shape = brief.aspectRatio === "16:9" ? "landscape" : brief.aspectRatio === "1:1" ? "square" : "vertical";
    const mp4 = await convertBlobToMp4(render.blob, shape).catch(() => null);
    if (mp4 && mp4.size > 0) {
      try { URL.revokeObjectURL(render.video_url); } catch { /* ignore */ }
      render.blob = mp4;
      render.video_url = URL.createObjectURL(mp4);
      render.mime = "video/mp4";
      render.extension = "mp4";
      render.size_bytes = mp4.size;
    } else {
      console.warn("[video-pipeline] MP4 conversion unavailable; keeping the browser recording");
    }
  }

  const thumbnail = await ThumbnailAgent.run(brief, script);
  const seo = await SeoAgent.run(brief, script, timeline);

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
    brief, research, retentionEngine, titles, hook, intro, curiosity, script, retention, chapters,
    storyboard, direction, visuals, voiceover, subtitles, audioTracks, timeline,
    render, thumbnail, seo,
  };
  return { job, result };
}

/**
 * Back-compat: runs both asset generation and render in a single call.
 * The new UI calls runAssetGenerationPhase + runRenderPhase separately so
 * users can review assets between the two.
 */
export async function runGenerationPhase(
  jobId: string,
  brief: VideoBrief,
  opts: JobRunOptions,
  editedScript?: AiVideoScript,
): Promise<{ job: JobRecord; result: PipelineResult }> {
  const { bundle } = await runAssetGenerationPhase(jobId, brief, opts, editedScript);
  return await runRenderPhase(jobId, bundle, opts);
}

/**
 * Regenerate a single shot in place. Used by the asset-review screen so users
 * can iterate on one scene without rebuilding the whole video.
 */
export async function regenerateShot(
  jobId: string,
  shotId: string,
  brief: VideoBrief,
  onEvent: (ev: JobEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  const shot = job.shots.find((s) => s.id === shotId);
  if (!shot) return;

  shot.status = "running";
  shot.error = null;
  shot.attempts += 1;
  await saveJob(job);
  onEvent({
    type: "shot",
    done: job.shotsDone,
    failed: job.shotsFailed,
    total: job.shots.length,
    shot: { id: shot.id, index: shot.index, status: "pending",
      kind: shot.kind, previewUrl: null, error: null, attempts: shot.attempts },
  });

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const characterRef = shot.hasCharacter !== false ? await ensureCharacterReference(job, brief) : null;
    const out = await generateOneShot(shot, brief, job.id, controller.signal, characterRef, job.shots.length);
    shot.status = "done";
    shot.kind = out.kind;
    shot.blobKey = out.blobKey;
    shot.mime = out.mime;
    shot.error = null;
    await saveJob(job);
    onEvent({
      type: "shot",
      done: job.shotsDone,
      failed: job.shotsFailed,
      total: job.shots.length,
      shot: { id: shot.id, index: shot.index, status: "done",
        kind: shot.kind, previewUrl: out.previewUrl, error: null, attempts: shot.attempts },
    });
  } catch (e) {
    shot.status = "failed";
    shot.error = e instanceof Error ? e.message : String(e);
    await saveJob(job);
    onEvent({
      type: "shot",
      done: job.shotsDone,
      failed: job.shotsFailed,
      total: job.shots.length,
      shot: { id: shot.id, index: shot.index, status: "failed",
        kind: null, previewUrl: null, error: shot.error, attempts: shot.attempts },
    });
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Replace one shot with the user's own media (Media Library or free stock)
 * from the asset-review screen. No generation, no credits. Video files are
 * used as motion clips (the renderer loops/trims them to the beat).
 */
export async function replaceShotWithMedia(
  jobId: string,
  shotId: string,
  blob: Blob,
  kind: "image" | "clip",
  onEvent: (ev: JobEvent) => void,
): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error("Video job not found");
  const shot = job.shots.find((s) => s.id === shotId);
  if (!shot) throw new Error("Scene not found");
  const wasDone = shot.status === "done";
  const wasFailed = shot.status === "failed";
  const key = await saveShotBlob(job.id, shot.id, blob);
  const url = await loadShotObjectURL(key);
  shot.status = "done";
  shot.kind = kind;
  shot.blobKey = key;
  shot.mime = blob.type || (kind === "clip" ? "video/mp4" : "image/jpeg");
  shot.error = null;
  if (!wasDone) job.shotsDone += 1;
  if (wasFailed) job.shotsFailed = Math.max(0, job.shotsFailed - 1);
  await saveJob(job);
  onEvent({
    type: "shot",
    done: job.shotsDone,
    failed: job.shotsFailed,
    total: job.shots.length,
    shot: { id: shot.id, index: shot.index, status: "done",
      kind, previewUrl: url, error: null, attempts: shot.attempts },
  });
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

  const characterRef = failedShots.some((s) => s.hasCharacter !== false)
    ? await ensureCharacterReference(job, brief)
    : null;
  const poolJobs = failedShots.map((shot) => ({
    id: shot.id,
    run: async (sig: AbortSignal) => {
      shot.status = "running";
      shot.attempts += 1;
      return await generateOneShot(shot, brief, job.id, sig, characterRef, job.shots.length);
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

