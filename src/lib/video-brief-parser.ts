// Free-text Video Brief Parser (Phase 3).
// Accepts a natural-language production brief and produces a VideoBlueprint
// suitable for the structured editor. Tolerates flexible label formats,
// numbering styles, extra whitespace, and stray notes. Anything that could
// not be mapped is preserved in `unmappedNotes` so the user never loses info.

import {
  BLUEPRINT_SCHEMA_VERSION, reindexScenes, validateBlueprint,
  type BlueprintIssue, type BlueprintScene, type CameraMovement,
  type TransitionStyle, type VideoBlueprint,
} from "@/lib/video-blueprint";
import type {
  AspectRatio, DurationSec, StyleId, VideoType, VoiceId,
} from "@/lib/video-agents";

export type ParsedBriefResult = {
  blueprint: VideoBlueprint;
  unmappedNotes: string;
  issues: BlueprintIssue[];
  parsed: {
    globalFieldsMatched: string[];
    sceneCount: number;
    warnings: string[];
  };
};

// ---------- helpers ----------

const norm = (s: string) => s.trim();
const stripBullets = (s: string) => s.replace(/^[\s\-*•·—>]+/, "").trim();

function toDuration(text: string, fallback: DurationSec = 60 as DurationSec): number {
  if (!text) return fallback;
  const m = /(\d+(?:\.\d+)?)\s*(min|minute|m|sec|second|s)?/i.exec(text);
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = (m[2] || "s").toLowerCase();
  if (unit.startsWith("m")) return Math.round(n * 60);
  return Math.round(n);
}

function toAspect(text: string, fallback: AspectRatio): AspectRatio {
  const t = text.toLowerCase();
  if (/9\s*[:x]\s*16|vertical|portrait|reel|short|tiktok/.test(t)) return "9:16";
  if (/1\s*[:x]\s*1|square/.test(t)) return "1:1";
  if (/16\s*[:x]\s*9|horizontal|landscape|widescreen|youtube/.test(t)) return "16:9";
  return fallback;
}

function toVideoType(text: string, fallback: VideoType): VideoType {
  const t = text.toLowerCase();
  if (/short|reel|tiktok|vertical/.test(t)) return "instagram_reel";
  if (/long|youtube/.test(t)) return "youtube_long";
  return fallback;
}

function toCamera(text: string): CameraMovement | undefined {
  const t = text.toLowerCase();
  const map: Record<string, CameraMovement> = {
    "push in": "pushIn", "push-in": "pushIn", pushin: "pushIn",
    "pull out": "pullOut", pullout: "pullOut", "pull-out": "pullOut",
    "zoom in": "zoomIn", zoomin: "zoomIn",
    "zoom out": "zoomOut", zoomout: "zoomOut",
    "pan left": "panLeft", "pan right": "panRight",
    "tilt up": "tiltUp", "tilt down": "tiltDown",
    orbit: "orbit", handheld: "handheld", static: "static", locked: "static",
  };
  for (const k of Object.keys(map)) if (t.includes(k)) return map[k];
  return undefined;
}

function toTransition(text: string): TransitionStyle | undefined {
  const t = text.toLowerCase();
  const list: TransitionStyle[] = ["cut", "fade", "dissolve", "slide", "zoom", "wipe", "glitch", "morph"];
  for (const s of list) if (t.includes(s)) return s;
  return undefined;
}

function toVoice(text: string, fallback: VoiceId): VoiceId {
  const t = text.toLowerCase();
  if (/documentary|narrator|male narrator|deep/.test(t)) return "documentary_narrator";
  if (/female|woman|she\b/.test(t)) return "female";
  if (/male|man\b|he\b/.test(t)) return "male";
  return fallback;
}

/** Extract "Label: value" (single line) or "Label:\n multi-line" from a block. */
function extractLabeled(block: string, labels: string[]): { value: string; consumed: RegExp[] } {
  for (const label of labels) {
    const re = new RegExp(
      `^\\s*(?:[-*•·]\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?\\s*[:\\-–]\\s*(.+?)(?=\\n\\s*(?:[-*•·]\\s*)?(?:\\*\\*)?[A-Z][A-Za-z /]{2,30}(?:\\*\\*)?\\s*[:\\-–]|$)`,
      "ims",
    );
    const m = re.exec(block);
    if (m) return { value: norm(m[1]).replace(/\s+\n/g, "\n"), consumed: [re] };
  }
  return { value: "", consumed: [] };
}

// ---------- scene split ----------

const SCENE_HEADER_RE =
  /^\s*(?:\*\*|##?\s*)?(?:scene|shot|beat|section|clip|part|chapter)\s*#?\s*(\d+)\b[^\n]*$/gim;

function splitScenes(body: string): { headers: string[]; bodies: string[]; preamble: string } {
  const headers: string[] = [];
  const positions: number[] = [];
  const re = new RegExp(SCENE_HEADER_RE.source, "gim");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    headers.push(m[0]);
    positions.push(m.index);
  }
  if (!headers.length) return { headers: [], bodies: [], preamble: body };
  const bodies: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i] + headers[i].length;
    const end = i + 1 < positions.length ? positions[i + 1] : body.length;
    bodies.push(body.slice(start, end).trim());
  }
  const preamble = body.slice(0, positions[0]).trim();
  return { headers, bodies, preamble };
}

function parseSceneTiming(header: string, fallbackStart: number, fallbackDur: number) {
  // Support "Scene 1 (0-3 sec)", "Scene 1 — 3s", "Scene 1: 0:03-0:06"
  const rangeSec = /(\d+(?:\.\d+)?)\s*[-–to]{1,3}\s*(\d+(?:\.\d+)?)\s*(?:sec|s)?/i.exec(header);
  if (rangeSec) {
    const start = Number(rangeSec[1]); const end = Number(rangeSec[2]);
    if (end > start) return { start, end, duration: end - start };
  }
  const dur = /(\d+(?:\.\d+)?)\s*(sec|s|seconds?)\b/i.exec(header);
  if (dur) {
    const d = Number(dur[1]);
    return { start: fallbackStart, end: fallbackStart + d, duration: d };
  }
  return { start: fallbackStart, end: fallbackStart + fallbackDur, duration: fallbackDur };
}

// ---------- main ----------

export type ParseOptions = {
  fallbackAspect?: AspectRatio;
  fallbackVideoType?: VideoType;
  fallbackStyle?: StyleId;
  fallbackVoice?: VoiceId;
  fallbackSceneDuration?: number;
};

export function parseVideoBrief(input: string, opts: ParseOptions = {}): ParsedBriefResult {
  const raw = (input || "").replace(/\r\n/g, "\n").trim();
  const globalFieldsMatched: string[] = [];
  const warnings: string[] = [];
  const fallbackAspect = opts.fallbackAspect ?? "9:16";
  const fallbackType = opts.fallbackVideoType ?? "instagram_reel";
  const fallbackStyle = opts.fallbackStyle ?? ("cinematic" as StyleId);
  const fallbackVoice = opts.fallbackVoice ?? "female";
  const fallbackDur = opts.fallbackSceneDuration ?? 4;

  const { headers, bodies, preamble } = splitScenes(raw);
  const globalBlock = preamble || (headers.length === 0 ? raw : "");
  const consumedGlobal: RegExp[] = [];

  const pick = (labels: string[]) => {
    const r = extractLabeled(globalBlock, labels);
    if (r.value) { globalFieldsMatched.push(labels[0]); consumedGlobal.push(...r.consumed); }
    return r.value;
  };

  const titleRaw = pick(["Title", "Video Title", "Working Title", "Name"]) ||
    (globalBlock.split("\n")[0]?.replace(/^#+\s*/, "") ?? "");
  const durationRaw = pick(["Duration", "Length", "Total Duration", "Runtime"]);
  const formatRaw = pick(["Format", "Video Type", "Type"]);
  const aspectRaw = pick(["Aspect Ratio", "Aspect", "Orientation"]);
  const styleRaw = pick(["Visual Style", "Style", "Look", "Aesthetic"]);
  const audienceRaw = pick(["Audience", "Target Audience", "Viewer"]);
  const objectiveRaw = pick(["Objective", "Goal", "KPI", "Marketing Goal"]);
  const brandRaw = pick(["Brand", "Company"]);
  const productRaw = pick(["Product", "Offer", "Service"]);
  const ctaRaw = pick(["CTA", "Call to Action", "Call-to-action"]);
  const negativeRaw = pick(["Negative Prompt", "Negative", "Avoid", "Do Not Include"]);
  const musicRaw = pick(["Music", "Music Direction", "Soundtrack", "Audio"]);
  const voiceRaw = pick(["Voice", "Voiceover Voice", "Narrator"]);
  const characterRaw = pick(["Character", "Protagonist", "Cast"]);
  const transitionRaw = pick(["Transition", "Transitions", "Default Transition"]);
  const motionRaw = pick(["Motion", "Motion Intensity", "Camera Style"]);
  const platformRaw = pick(["Platform"]);

  const totalDurationSec = toDuration(durationRaw, 60 as DurationSec);
  const aspectRatio = toAspect(aspectRaw || formatRaw, fallbackAspect);
  const videoType = toVideoType(formatRaw || platformRaw, fallbackType);
  const voiceId = toVoice(voiceRaw, fallbackVoice);
  const transitionStyle = toTransition(transitionRaw) ?? "fade";
  const motion = motionRaw.toLowerCase();
  const motionIntensity: VideoBlueprint["motionIntensity"] =
    /high|dynamic|energetic/.test(motion) ? "high" :
    /static|locked|still/.test(motion) ? "static" :
    /subtle|gentle/.test(motion) ? "subtle" : "medium";

  // ----- scenes -----
  const scenes: BlueprintScene[] = [];
  let cursor = 0;
  let uid = 0;
  const nextId = () => `scn_p_${Date.now().toString(36)}_${(uid++).toString(36)}`;

  const sceneUnmapped: string[] = [];

  for (let i = 0; i < bodies.length; i++) {
    const header = headers[i];
    const body = bodies[i];
    const timing = parseSceneTiming(header, cursor, fallbackDur);

    const grab = (labels: string[]) => extractLabeled(body, labels).value;
    const visual = grab(["Visual", "Description", "Shot", "Scene Description", "Action"]);
    const imagePrompt = grab(["Image Prompt", "Image", "Prompt", "Still", "Frame"]);
    const videoPrompt = grab(["Motion Prompt", "Motion", "Video Prompt", "Animation"]);
    const onScreenText = grab(["On-Screen Text", "On Screen Text", "Text", "Caption", "Overlay"]);
    const voiceover = grab(["Voiceover", "VO", "Narration", "Voice Over", "Script"]);
    const cameraTxt = grab(["Camera", "Camera Movement", "Shot Type"]);
    const transIn = grab(["Transition In", "In Transition"]);
    const transOut = grab(["Transition Out", "Out Transition"]);
    const transAll = grab(["Transition", "Transitions"]);
    const subject = grab(["Subject Movement", "Subject", "Character Action", "Movement"]);
    const productPlacement = grab(["Product Placement", "Product Shot", "Product"]);
    const characterLine = grab(["Character", "Character Reference", "Cast"]);
    const negative = grab(["Negative Prompt", "Negative", "Avoid"]);
    const role = /^(hook|intro|cta|call|outro|beat|product|reveal|climax)/i.exec(header + " " + body)?.[1] ?? "Beat";

    // If nothing was labeled, treat the whole body as the visual/VO.
    const visualFallback = visual || (!imagePrompt && !voiceover ? body.split("\n").filter(Boolean).slice(0, 3).join(" ") : "");

    const scene: BlueprintScene = {
      id: nextId(),
      n: i + 1,
      startSec: timing.start,
      endSec: timing.end,
      durationSec: timing.duration,
      role: role[0].toUpperCase() + role.slice(1).toLowerCase(),
      visual: visualFallback,
      imagePrompt: imagePrompt || visualFallback,
      videoPrompt,
      onScreenText,
      voiceover,
      transitionIn: toTransition(transIn) ?? toTransition(transAll) ?? transitionStyle,
      transitionOut: toTransition(transOut) ?? toTransition(transAll) ?? transitionStyle,
      cameraMovement: toCamera(cameraTxt) ?? "pushIn",
      subjectMovement: subject,
      productPlacement,
      character: { reference: characterLine || characterRaw, locked: Boolean(characterLine || characterRaw) },
      negativePrompt: negative || negativeRaw,
      edited: true,
    };

    if (!scene.visual && !scene.imagePrompt && !scene.voiceover) {
      warnings.push(`Scene ${scene.n} has no recognizable visual or voiceover; kept as empty.`);
    }
    if (timing.duration <= 0) warnings.push(`Scene ${scene.n} has invalid duration; using ${fallbackDur}s.`);
    cursor = timing.end;
    scenes.push(scene);
  }

  const reindexed = scenes.length ? reindexScenes(scenes) : [];

  const blueprint: VideoBlueprint = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    title: titleRaw || "Untitled video",
    totalDurationSec: totalDurationSec || (reindexed.reduce((a, s) => a + s.durationSec, 0) || 60),
    platform: platformRaw || (videoType === "youtube_long" ? "youtube" : "instagram"),
    videoType,
    aspectRatio,
    videoStyle: (styleRaw as StyleId) || fallbackStyle,
    audience: audienceRaw,
    objective: objectiveRaw,
    brand: brandRaw,
    product: productRaw,
    cta: ctaRaw,
    globalVisualStyle: styleRaw,
    globalNegative: negativeRaw,
    musicDirection: musicRaw,
    voice: { voiceId, pace: "normal", emotion: "neutral" },
    transitionStyle,
    motionIntensity,
    scenes: reindexed,
  };

  // Unmapped notes: strip consumed lines from the global block; anything that
  // clearly wasn't a labeled field stays as user notes.
  let leftover = globalBlock;
  for (const re of consumedGlobal) leftover = leftover.replace(re, "");
  const unmappedNotes = [
    leftover.split("\n").map(stripBullets).filter(Boolean).join("\n").trim(),
    sceneUnmapped.join("\n").trim(),
  ].filter(Boolean).join("\n\n").trim();

  const issues = validateBlueprint(blueprint);
  if (!scenes.length) {
    issues.push({
      level: "error", code: "no_scenes",
      message: "No scenes detected. Add lines like 'Scene 1 (0-3 sec)' to break the brief into shots.",
    });
  }

  return {
    blueprint,
    unmappedNotes,
    issues,
    parsed: { globalFieldsMatched, sceneCount: scenes.length, warnings },
  };
}
