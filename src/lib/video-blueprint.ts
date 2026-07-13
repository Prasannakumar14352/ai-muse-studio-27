// Structured Video Blueprint — the single source of truth for a video.
// Once the AI planning agents produce their draft, everything the user sees
// in the editor and everything the renderer uses lives in this shape.
// Persisted inside `projects.metadata` JSONB (no new tables).

import type { AiVideoScript, AiVideoScene } from "@/lib/video-ai.functions";
import type {
  VideoType, DurationSec, StyleId, VoiceId, AspectRatio, VideoBrief,
} from "@/lib/video-agents";

/** Semver-ish major for on-disk shape. Bump when structure changes. */
export const BLUEPRINT_SCHEMA_VERSION = 1 as const;

export type BlueprintSource = "ai" | "user_edit" | "regenerate_scene" | "restore";

export type MotionIntensity = "static" | "subtle" | "medium" | "high";
export type TransitionStyle =
  | "cut" | "fade" | "dissolve" | "slide" | "zoom" | "wipe" | "glitch" | "morph";
export type CameraMovement =
  | "static" | "zoomIn" | "zoomOut" | "pushIn" | "pullOut"
  | "panLeft" | "panRight" | "tiltUp" | "tiltDown" | "orbit" | "handheld";

export type SceneCharacterLock = {
  /** Free-text character description or reference id. Empty = free character. */
  reference: string;
  /** When true the pipeline MUST NOT alter appearance for this scene. */
  locked: boolean;
};

export type BlueprintScene = {
  id: string;                // stable id for React keys + regen targeting
  n: number;                 // display order (1-based)
  startSec: number;
  endSec: number;
  durationSec: number;       // endSec - startSec (denormalized)
  role: string;              // "Hook" | "Beat" | "CTA" | "Product" | ...
  visual: string;            // 1-line description of what's on screen
  imagePrompt: string;       // rich prompt used by the image gen
  videoPrompt: string;       // image-to-video motion prompt (optional)
  onScreenText: string;
  voiceover: string;
  transitionIn: TransitionStyle;
  transitionOut: TransitionStyle;
  cameraMovement: CameraMovement;
  subjectMovement: string;   // free text — what the subject/actor does
  productPlacement: string;  // free text — how the product shows in the frame
  character: SceneCharacterLock;
  negativePrompt: string;
  /** Set by editor when user has locally edited this scene since last AI regen. */
  edited?: boolean;
};

export type BlueprintVoiceSettings = {
  voiceId: VoiceId;
  pace: "slow" | "normal" | "fast";
  emotion: "neutral" | "energetic" | "calm" | "dramatic" | "friendly";
};

export type VideoBlueprint = {
  schemaVersion: typeof BLUEPRINT_SCHEMA_VERSION;

  // ----- Global fields -----
  title: string;
  totalDurationSec: DurationSec | number;
  platform: string;                   // "youtube" | "instagram" | ...
  videoType: VideoType;
  aspectRatio: AspectRatio;
  videoStyle: StyleId;
  audience: string;
  objective: string;                  // marketing objective / KPI
  brand: string;
  product: string;
  cta: string;
  globalVisualStyle: string;          // extra style guardrails
  globalNegative: string;             // global negative prompt
  musicDirection: string;
  voice: BlueprintVoiceSettings;
  transitionStyle: TransitionStyle;   // default per-scene fallback
  motionIntensity: MotionIntensity;

  // ----- Timeline -----
  scenes: BlueprintScene[];
};

export type BlueprintVersionEntry = {
  version: number;
  source: BlueprintSource;
  savedAt: string;                    // ISO timestamp
  note?: string;
  blueprint: VideoBlueprint;
};

export type RenderSnapshot = {
  version: number;                    // blueprint version rendered
  snapshotAt: string;
  blueprint: VideoBlueprint;          // immutable copy used by the render
  briefJson: string;                  // original brief passed to renderer
};

/** Full blob stored inside `projects.metadata.videoBlueprint`. */
export type VideoBlueprintMetadata = {
  originalAiBlueprint: VideoBlueprint;
  currentBlueprint: VideoBlueprint;
  blueprintVersion: number;
  blueprintUpdatedAt: string;
  blueprintSource: BlueprintSource;
  blueprintVersions: BlueprintVersionEntry[]; // capped to 10 most recent
  renderSnapshot: RenderSnapshot | null;
  blueprintVersionUsed: number | null;        // last version that a render used
};

export const MAX_BLUEPRINT_VERSIONS = 10;

// ---------- Factory / conversion ----------

let _uid = 0;
const nextId = () => `scn_${Date.now().toString(36)}_${(_uid++).toString(36)}`;

function parseSeconds(range: string): { start: number; end: number } {
  // Accept "0-3 sec", "3-6s", "12 - 18 sec"; return best-effort seconds.
  const m = /(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/.exec(range || "");
  if (!m) return { start: 0, end: 0 };
  return { start: Number(m[1]), end: Number(m[2]) };
}

function sceneFromAi(scene: AiVideoScene, prev: number, defaults: {
  aspectRatio: AspectRatio;
  transition: TransitionStyle;
}): BlueprintScene {
  const parsed = parseSeconds(scene.time_range);
  const start = parsed.end > parsed.start ? parsed.start : prev;
  const parsedDur = parsed.end - parsed.start;
  const durSec = parsedDur > 0
    ? parsedDur
    : Number((scene.duration || "").replace(/[^\d.]/g, "")) || 3;
  const end = start + durSec;
  return {
    id: nextId(),
    n: scene.n,
    startSec: start,
    endSec: end,
    durationSec: durSec,
    role: scene.role,
    visual: scene.visual,
    imagePrompt: scene.image_prompt,
    videoPrompt: "",
    onScreenText: scene.on_screen_text,
    voiceover: scene.voiceover,
    transitionIn: defaults.transition,
    transitionOut: defaults.transition,
    cameraMovement: "pushIn",
    subjectMovement: "",
    productPlacement: "",
    character: { reference: "", locked: false },
    negativePrompt: "",
    edited: false,
  };
}

/** Build the initial blueprint from planning outputs. */
export function buildBlueprintFromPlanning(
  brief: VideoBrief,
  script: AiVideoScript,
  opts: {
    platform?: string;
    audience?: string;
    objective?: string;
    brand?: string;
    product?: string;
    cta?: string;
    musicDirection?: string;
  } = {},
): VideoBlueprint {
  const scenes: BlueprintScene[] = [];
  let cursor = 0;
  for (const s of script.scenes) {
    const scene = sceneFromAi(s, cursor, {
      aspectRatio: brief.aspectRatio,
      transition: "fade",
    });
    cursor = scene.endSec;
    scenes.push(scene);
  }
  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    title: brief.title || script.title,
    totalDurationSec: brief.duration,
    platform: opts.platform ?? (brief.videoType === "youtube_long" ? "youtube" : "instagram"),
    videoType: brief.videoType,
    aspectRatio: brief.aspectRatio,
    videoStyle: brief.style,
    audience: opts.audience ?? "",
    objective: opts.objective ?? "",
    brand: opts.brand ?? "",
    product: opts.product ?? "",
    cta: opts.cta ?? "",
    globalVisualStyle: script.style_note ?? "",
    globalNegative: "",
    musicDirection: opts.musicDirection ?? "",
    voice: { voiceId: brief.voice, pace: "normal", emotion: "neutral" },
    transitionStyle: "fade",
    motionIntensity: "medium",
    scenes,
  };
}

/** Convert an edited blueprint back into an AiVideoScript the pipeline can consume. */
export function blueprintToScript(bp: VideoBlueprint): AiVideoScript {
  const scenes: AiVideoScene[] = bp.scenes.map((s) => ({
    n: s.n,
    time_range: `${Math.round(s.startSec)}-${Math.round(s.endSec)} sec`,
    role: s.role,
    voiceover: s.voiceover,
    on_screen_text: s.onScreenText,
    visual: s.visual,
    image_prompt: s.imagePrompt || s.visual,
    duration: `${Math.max(1, Math.round(s.durationSec))}s`,
  }));
  return {
    title: bp.title,
    reel_title: bp.title,
    length_sec: Math.round(totalDuration(bp)),
    style_note: bp.globalVisualStyle,
    scenes,
    caption: "",
    hashtags: [],
  };
}

// ---------- Scene mutations ----------

export function reindexScenes(scenes: BlueprintScene[]): BlueprintScene[] {
  let cursor = 0;
  return scenes.map((s, i) => {
    const dur = Math.max(0.5, s.durationSec || (s.endSec - s.startSec) || 3);
    const start = cursor;
    const end = start + dur;
    cursor = end;
    return { ...s, n: i + 1, startSec: start, endSec: end, durationSec: dur };
  });
}

export function emptyScene(afterSec: number): BlueprintScene {
  return {
    id: nextId(),
    n: 0,
    startSec: afterSec,
    endSec: afterSec + 3,
    durationSec: 3,
    role: "Beat",
    visual: "",
    imagePrompt: "",
    videoPrompt: "",
    onScreenText: "",
    voiceover: "",
    transitionIn: "fade",
    transitionOut: "fade",
    cameraMovement: "pushIn",
    subjectMovement: "",
    productPlacement: "",
    character: { reference: "", locked: false },
    negativePrompt: "",
    edited: true,
  };
}

export function duplicateScene(s: BlueprintScene): BlueprintScene {
  return { ...s, id: nextId(), edited: true };
}

export function splitScene(s: BlueprintScene): [BlueprintScene, BlueprintScene] {
  const half = Math.max(0.5, s.durationSec / 2);
  const a: BlueprintScene = {
    ...s, id: nextId(), endSec: s.startSec + half, durationSec: half, edited: true,
  };
  const b: BlueprintScene = {
    ...s, id: nextId(),
    startSec: s.startSec + half, endSec: s.endSec, durationSec: half,
    voiceover: "", onScreenText: "", edited: true,
  };
  return [a, b];
}

export function mergeScenes(a: BlueprintScene, b: BlueprintScene): BlueprintScene {
  return {
    ...a,
    endSec: b.endSec,
    durationSec: a.durationSec + b.durationSec,
    voiceover: [a.voiceover, b.voiceover].filter(Boolean).join(" "),
    onScreenText: [a.onScreenText, b.onScreenText].filter(Boolean).join(" · "),
    visual: [a.visual, b.visual].filter(Boolean).join(" → "),
    edited: true,
  };
}

// ---------- Validation ----------

export type BlueprintIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
  sceneId?: string;
};

const PROMO_ROLES = /(promo|product|launch|sale|shop|offer)/i;
const CTA_KEYWORDS = /(buy|shop|link|dm|comment|save|follow|subscribe|download|visit|click|order)/i;

export function totalDuration(bp: VideoBlueprint): number {
  return bp.scenes.reduce((a, s) => a + (s.durationSec || 0), 0);
}

export function isPromotional(bp: VideoBlueprint): boolean {
  return Boolean(bp.product || bp.brand || (bp.objective && /sale|convert|promo|launch/i.test(bp.objective)));
}

export function validateBlueprint(bp: VideoBlueprint): BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];

  if (!(["16:9", "9:16", "1:1"] as string[]).includes(bp.aspectRatio)) {
    issues.push({ level: "error", code: "aspect", message: `Invalid aspect ratio: ${bp.aspectRatio}` });
  }

  const total = totalDuration(bp);
  const target = Number(bp.totalDurationSec) || 0;
  if (target > 0 && Math.abs(total - target) / target > 0.15) {
    issues.push({
      level: "warning", code: "total_duration",
      message: `Timeline is ${total.toFixed(1)}s but target is ${target}s (off by >15%).`,
    });
  }

  // Scene-level checks
  let prevEnd = 0;
  for (const s of bp.scenes) {
    if (Math.abs(s.startSec - prevEnd) > 0.05 && s.n > 1) {
      issues.push({
        level: "warning", code: "gap", sceneId: s.id,
        message: `Scene ${s.n} starts at ${s.startSec.toFixed(1)}s but previous ended at ${prevEnd.toFixed(1)}s.`,
      });
    }
    if (s.durationSec <= 0) {
      issues.push({
        level: "error", code: "duration", sceneId: s.id,
        message: `Scene ${s.n} has non-positive duration.`,
      });
    }
    if (!s.visual.trim() && !s.imagePrompt.trim()) {
      issues.push({
        level: "error", code: "empty_visual", sceneId: s.id,
        message: `Scene ${s.n} has no visual description or image prompt.`,
      });
    }
    if (s.onScreenText && s.onScreenText.length > 90) {
      issues.push({
        level: "warning", code: "long_text", sceneId: s.id,
        message: `Scene ${s.n} on-screen text is ${s.onScreenText.length} chars (keep < 90).`,
      });
    }
    const vw = s.voiceover.trim().split(/\s+/).filter(Boolean).length;
    // ~2.5 words / sec at natural pace.
    const maxWords = Math.ceil(s.durationSec * 3.2);
    if (vw > maxWords && s.durationSec > 0) {
      issues.push({
        level: "warning", code: "vo_length", sceneId: s.id,
        message: `Scene ${s.n} voiceover has ${vw} words for ${s.durationSec.toFixed(1)}s (max ≈ ${maxWords}).`,
      });
    }
    prevEnd = s.endSec;
  }

  if (isPromotional(bp)) {
    const hasCta = CTA_KEYWORDS.test(bp.cta) ||
      bp.scenes.some((s) => CTA_KEYWORDS.test(s.voiceover) || CTA_KEYWORDS.test(s.onScreenText));
    if (!hasCta) {
      issues.push({
        level: "error", code: "missing_cta",
        message: "Promotional video is missing a call-to-action.",
      });
    }
    const hasProductScene = bp.scenes.some(
      (s) => PROMO_ROLES.test(s.role) || (bp.product && new RegExp(bp.product, "i").test(s.visual + s.imagePrompt + s.productPlacement)),
    );
    if (!hasProductScene) {
      issues.push({
        level: "error", code: "missing_product_scene",
        message: "Promotional video has no scene showing the product.",
      });
    }
  }

  return issues;
}

// ---------- Credit estimation ----------

export type RenderAction =
  | "render_full"
  | "regenerate_all"
  | "regenerate_visuals"
  | "regenerate_voiceover"
  | "rerender_final";

/** Rough credit cost estimate; feel free to tune against your credit-costs.ts. */
export function estimateCredits(bp: VideoBlueprint, action: RenderAction): number {
  const n = bp.scenes.length || 1;
  switch (action) {
    case "render_full":         return 5 + n * 4;   // visuals + VO + render
    case "regenerate_all":      return 5 + n * 4;
    case "regenerate_visuals":  return n * 3;
    case "regenerate_voiceover":return n * 1;
    case "rerender_final":      return 3;
  }
}

// ---------- Versioning helper ----------

export function pushVersion(
  meta: VideoBlueprintMetadata,
  next: VideoBlueprint,
  source: BlueprintSource,
  note?: string,
): VideoBlueprintMetadata {
  const nextVersion = meta.blueprintVersion + 1;
  const entry: BlueprintVersionEntry = {
    version: nextVersion,
    source,
    savedAt: new Date().toISOString(),
    note,
    blueprint: next,
  };
  const versions = [entry, ...meta.blueprintVersions].slice(0, MAX_BLUEPRINT_VERSIONS);
  return {
    ...meta,
    currentBlueprint: next,
    blueprintVersion: nextVersion,
    blueprintUpdatedAt: entry.savedAt,
    blueprintSource: source,
    blueprintVersions: versions,
  };
}

export function initMetadata(original: VideoBlueprint): VideoBlueprintMetadata {
  const now = new Date().toISOString();
  return {
    originalAiBlueprint: original,
    currentBlueprint: original,
    blueprintVersion: 1,
    blueprintUpdatedAt: now,
    blueprintSource: "ai",
    blueprintVersions: [{
      version: 1, source: "ai", savedAt: now, blueprint: original,
    }],
    renderSnapshot: null,
    blueprintVersionUsed: null,
  };
}

export function buildRenderSnapshot(
  meta: VideoBlueprintMetadata,
  brief: VideoBrief,
): RenderSnapshot {
  return {
    version: meta.blueprintVersion,
    snapshotAt: new Date().toISOString(),
    blueprint: meta.currentBlueprint,
    briefJson: JSON.stringify(brief),
  };
}
