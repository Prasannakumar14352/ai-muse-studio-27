// Visual Director — reusable creative engine for the AI Studio.
//
// The user provides a topic (and the pipeline generates a storyboard). This
// module turns each storyboard beat into a fully-realized cinematic image
// prompt: subject, action, environment, camera + lens, lighting, color grade,
// composition, style, negatives, and continuity anchor. Designed to be reused
// by videos, standalone images, carousels, thumbnails, and social posts —
// nothing here depends on the video pipeline.

export type VDStyle =
  | "documentary" | "cinematic" | "realistic" | "ghibli" | "anime"
  | "pixar" | "3d" | "dark_mystery" | "luxury" | "cyberpunk"
  | "minimal_product" | "futuristic";

export type VDRatio = "16:9" | "9:16" | "1:1";

export type ShotType =
  | "wide_establishing" | "hero" | "drone" | "extreme_close_up" | "close_up"
  | "medium" | "over_the_shoulder" | "birds_eye" | "low_angle" | "high_angle"
  | "silhouette" | "macro" | "interior" | "exterior" | "tracking";

export type CameraMove =
  | "static" | "push_in" | "pull_out" | "pan_left" | "pan_right"
  | "tilt_up" | "tilt_down" | "handheld" | "dolly" | "crane";

export type StylePreset = {
  label: string;
  camera: string;         // e.g. "Sony FX6"
  lens: string;           // e.g. "35mm prime"
  aperture: string;       // e.g. "f/2.0"
  lighting: string;       // e.g. "natural daylight, volumetric god rays"
  colorGrade: string;     // e.g. "teal and orange"
  look: string;           // e.g. "National Geographic documentary"
  extras: string[];       // freeform cinematic tokens
  isIllustrated: boolean; // true for ghibli/anime/cartoon (mutes photo-negatives)
};

export const STYLE_PRESETS: Record<VDStyle, StylePreset> = {
  documentary: {
    label: "Documentary",
    camera: "Sony FX6",
    lens: "35mm prime",
    aperture: "f/2.8",
    lighting: "natural daylight, soft ambient fill",
    colorGrade: "muted earthy tones, natural whites",
    look: "National Geographic / BBC documentary photography",
    extras: ["candid framing", "shallow depth of field", "HDR", "ultra detailed"],
    isIllustrated: false,
  },
  cinematic: {
    label: "Cinematic",
    camera: "ARRI Alexa Mini",
    lens: "50mm anamorphic",
    aperture: "f/1.8",
    lighting: "volumetric god rays, moody rim light",
    colorGrade: "teal and orange, high contrast Hollywood grade",
    look: "epic feature-film still",
    extras: ["anamorphic lens flare", "cinematic depth of field", "dramatic composition", "8K"],
    isIllustrated: false,
  },
  realistic: {
    label: "Realistic",
    camera: "Canon EOS R5",
    lens: "85mm prime",
    aperture: "f/1.4",
    lighting: "natural window light, soft key",
    colorGrade: "true-to-life colors, magazine grade",
    look: "modern editorial photography",
    extras: ["photorealistic", "ultra sharp focus", "HDR", "high detail"],
    isIllustrated: false,
  },
  ghibli: {
    label: "Ghibli",
    camera: "hand-painted frame",
    lens: "storybook framing",
    aperture: "n/a",
    lighting: "soft afternoon light, warm ambient glow",
    colorGrade: "Studio Ghibli palette, pastel skies",
    look: "Miyazaki watercolor animation still",
    extras: ["painterly brushwork", "gentle nostalgia", "hand-painted texture"],
    isIllustrated: true,
  },
  anime: {
    label: "Anime",
    camera: "animation cel",
    lens: "cinematic framing",
    aperture: "n/a",
    lighting: "dynamic rim light, dramatic key",
    colorGrade: "saturated pop palette, clean line art",
    look: "modern Japanese anime feature still",
    extras: ["cel-shaded", "expressive characters", "high-contrast shadows"],
    isIllustrated: true,
  },
  pixar: {
    label: "Pixar 3D",
    camera: "virtual cinema camera",
    lens: "35mm equivalent",
    aperture: "f/2.2",
    lighting: "warm family-movie key, soft bounce",
    colorGrade: "vibrant Pixar palette",
    look: "Pixar animated movie still",
    extras: ["stylized 3D", "subsurface scattering", "cute character design"],
    isIllustrated: true,
  },
  "3d": {
    label: "Stylized 3D",
    camera: "virtual cinema camera",
    lens: "50mm equivalent",
    aperture: "f/2.8",
    lighting: "soft studio HDRI, rim light",
    colorGrade: "vibrant, high-fidelity CGI",
    look: "Blender/Octane hero render",
    extras: ["ray-traced reflections", "physically based materials", "8K render"],
    isIllustrated: true,
  },
  dark_mystery: {
    label: "Dark Mystery",
    camera: "ARRI Alexa Mini",
    lens: "40mm prime",
    aperture: "f/1.4",
    lighting: "low-key, deep shadows, single rim light, atmospheric fog",
    colorGrade: "black and midnight-blue, muted greens",
    look: "neo-noir thriller",
    extras: ["chiaroscuro composition", "smoke atmosphere", "cinematic grain"],
    isIllustrated: false,
  },
  luxury: {
    label: "Luxury Editorial",
    camera: "Phase One IQ4",
    lens: "80mm prime",
    aperture: "f/4",
    lighting: "controlled softbox, gold rim",
    colorGrade: "gold and cream, refined highlights",
    look: "high-end fashion editorial",
    extras: ["marble and glass textures", "polished surfaces", "magazine-grade retouch"],
    isIllustrated: false,
  },
  cyberpunk: {
    label: "Cyberpunk",
    camera: "ARRI Alexa Mini",
    lens: "35mm anamorphic",
    aperture: "f/1.8",
    lighting: "neon signage, rain reflections, cyan and pink rim",
    colorGrade: "cyan/magenta neon, deep blacks",
    look: "Blade Runner 2049 street scene",
    extras: ["holographic signage", "rain-slicked pavement", "atmospheric haze"],
    isIllustrated: false,
  },
  minimal_product: {
    label: "Minimal Product",
    camera: "Hasselblad X2D",
    lens: "90mm macro",
    aperture: "f/5.6",
    lighting: "soft north-facing window light, single gentle shadow",
    colorGrade: "off-white palette, natural neutrals",
    look: "Scandinavian product photography",
    extras: ["ample negative space", "clean composition", "razor-sharp focus"],
    isIllustrated: false,
  },
  futuristic: {
    label: "Futuristic",
    camera: "RED V-Raptor",
    lens: "35mm prime",
    aperture: "f/2.0",
    lighting: "cool sterile key, holographic accent",
    colorGrade: "silver, glass, and holographic cyan",
    look: "near-future sci-fi",
    extras: ["chrome surfaces", "holographic UI overlays", "clean geometric composition"],
    isIllustrated: false,
  },
};

/** Global negative-prompt vocabulary. Illustrated styles drop the "cartoon" negative. */
const PHOTO_NEGATIVES = [
  "low quality", "blurry", "deformed", "duplicate", "extra fingers", "bad anatomy",
  "low resolution", "watermark", "logo", "caption", "text", "jpeg artifacts",
  "oversaturated", "cartoon",
];
const ILLUSTRATED_NEGATIVES = [
  "low quality", "blurry", "deformed", "duplicate", "extra fingers", "bad anatomy",
  "low resolution", "watermark", "logo", "caption", "text", "jpeg artifacts",
];

/** Deterministic non-repeating shot-type rotation. Uses the beat index and a
 * small shuffle so consecutive beats never share framing. */
const SHOT_ROTATION: ShotType[] = [
  "wide_establishing", "medium", "close_up", "over_the_shoulder", "low_angle",
  "hero", "drone", "extreme_close_up", "birds_eye", "high_angle", "silhouette",
  "tracking", "macro", "interior", "exterior",
];

const CAMERA_MOVE_ROTATION: CameraMove[] = [
  "push_in", "pan_right", "static", "tilt_up", "pull_out", "pan_left",
  "handheld", "dolly", "tilt_down", "crane",
];

const SHOT_TYPE_PHRASES: Record<ShotType, string> = {
  wide_establishing: "wide establishing shot",
  hero: "hero shot with subject centered heroically",
  drone: "aerial drone shot",
  extreme_close_up: "extreme close-up",
  close_up: "close-up",
  medium: "medium shot",
  over_the_shoulder: "over-the-shoulder shot",
  birds_eye: "top-down bird's eye view",
  low_angle: "dramatic low-angle shot",
  high_angle: "high-angle shot",
  silhouette: "backlit silhouette",
  macro: "macro shot with fine detail",
  interior: "interior shot",
  exterior: "exterior shot",
  tracking: "tracking shot",
};

const CAMERA_MOVE_PHRASES: Record<CameraMove, string> = {
  static: "locked-off camera",
  push_in: "slow push-in",
  pull_out: "smooth pull-out",
  pan_left: "gentle pan left",
  pan_right: "gentle pan right",
  tilt_up: "tilt up",
  tilt_down: "tilt down",
  handheld: "handheld micro-shake",
  dolly: "dolly move",
  crane: "crane move",
};

export type ContinuityCard = {
  /** Short subject name, e.g. "the last human employee". */
  subjectAnchor: string;
  /** Locked physical description (age, hair, build, distinguishing features). */
  characterSheet: string;
  wardrobeAnchor: string;
  locationAnchor: string;
};

/**
 * Extracts a lightweight continuity card so a recurring subject (character,
 * product, or place) stays visually consistent across every generated shot.
 * The character sheet is deliberately specific so the image model locks onto
 * the same face/wardrobe rather than reinventing the subject each beat.
 */
export function buildContinuityCard(title: string, hint?: string): ContinuityCard {
  const t = (title || "").trim();
  const subject = t.length > 0 ? t : (hint || "the central subject");
  const characterSheet = hint && hint.length > 20
    ? hint
    : `one specific protagonist — early 30s, warm brown eyes, short dark hair, ` +
      `neutral navy jacket over a plain grey tee, medium athletic build, ` +
      `clean-shaven, small scar above right eyebrow. This exact same person ` +
      `must appear in every shot with identical face, identical wardrobe, ` +
      `identical hairstyle. Do not swap the character. Do not add extra people ` +
      `unless the beat text explicitly requires them.`;
  return {
    subjectAnchor: subject,
    characterSheet,
    wardrobeAnchor: "identical wardrobe, identical hairstyle, identical face across every shot",
    locationAnchor: "consistent architecture, props, and set design across every shot",
  };
}

export type DirectorInput = {
  title: string;
  styleId: VDStyle;
  ratio: VDRatio;
  /** Voiceover / narration chunk for this beat. Drives subject + action. */
  beatText: string;
  /** Scene-level context (script.scene.visual) used for environment cues. */
  sceneContext?: string;
  /** Optional metadata for scene-aware prompts. */
  sceneNumber?: number;
  chapterLabel?: string | null;
  scenePurpose?: string | null;
  emotion?: string | null;
  /** Global beat index used to rotate shot types + camera moves. */
  beatIndex: number;
  continuity: ContinuityCard;
  /** The most recent chosen shot type, so we never repeat framing back-to-back. */
  previousShotType?: ShotType | null;
};

export type DirectorOutput = {
  prompt: string;              // final, optimizer-ready cinematic prompt
  negativePrompt: string;      // comma-joined negatives (also folded into `prompt`)
  shotType: ShotType;
  cameraMove: CameraMove;
  preset: StylePreset;
  meta: {
    title: string;
    styleId: VDStyle;
    sceneNumber: number | null;
    chapter: string | null;
    emotion: string | null;
    scenePurpose: string | null;
  };
};

function pickShotType(beatIndex: number, previous?: ShotType | null): ShotType {
  let pick = SHOT_ROTATION[beatIndex % SHOT_ROTATION.length];
  if (previous && pick === previous) {
    pick = SHOT_ROTATION[(beatIndex + 1) % SHOT_ROTATION.length];
  }
  return pick;
}

function pickCameraMove(beatIndex: number): CameraMove {
  return CAMERA_MOVE_ROTATION[beatIndex % CAMERA_MOVE_ROTATION.length];
}

/** Detect a rough "time of day / mood" cue from the narration. Cheap heuristics
 * — no LLM call — because the optimizer already enriches the prompt further. */
function inferMoodCues(text: string): { timeOfDay: string; weather: string } {
  const s = text.toLowerCase();
  const timeOfDay =
    /night|midnight|dark/.test(s) ? "night" :
    /dawn|sunrise|morning/.test(s) ? "sunrise" :
    /dusk|sunset|evening/.test(s) ? "golden hour" :
    "diffused daylight";
  const weather =
    /rain|storm|wet/.test(s) ? "light rain, wet reflections" :
    /snow|winter|frozen/.test(s) ? "soft snowfall" :
    /fog|mist|haze/.test(s) ? "atmospheric haze" :
    "clean atmosphere";
  return { timeOfDay, weather };
}

/**
 * Core creative engine: turn one beat into a professional image prompt.
 * Pure function — safe to call from any generator (video, image, carousel,
 * thumbnail, social) without side effects.
 */
export function directBeatPrompt(input: DirectorInput): DirectorOutput {
  const preset = STYLE_PRESETS[input.styleId] ?? STYLE_PRESETS.cinematic;
  const shotType = pickShotType(input.beatIndex, input.previousShotType);
  const cameraMove = pickCameraMove(input.beatIndex);
  const mood = inferMoodCues(input.beatText);

  const negatives = preset.isIllustrated ? ILLUSTRATED_NEGATIVES : PHOTO_NEGATIVES;
  const negativePrompt = negatives.join(", ");

  const sceneCtx = (input.sceneContext ?? "").trim();
  const beat = input.beatText.trim().replace(/\s+/g, " ");
  void input.continuity.subjectAnchor;

  const parts: string[] = [];
  // Character lock FIRST so the model reads it before anything else.
  parts.push(
    `LOCKED CHARACTER SHEET (must match exactly in every image): ` +
    `${input.continuity.characterSheet}`,
  );
  parts.push(`${SHOT_TYPE_PHRASES[shotType]} — ${CAMERA_MOVE_PHRASES[cameraMove]}`);
  parts.push(`Subject: the SAME locked character above, visualizing "${beat}"`);
  if (sceneCtx) parts.push(`Environment: ${sceneCtx}`);
  parts.push(`Time of day: ${mood.timeOfDay}. Atmosphere: ${mood.weather}`);
  parts.push(`Camera: ${preset.camera}, ${preset.lens} at ${preset.aperture}`);
  parts.push(`Lighting: ${preset.lighting}`);
  parts.push(`Color grade: ${preset.colorGrade}`);
  parts.push(`Look: ${preset.look}`);
  if (preset.extras.length) parts.push(preset.extras.join(", "));
  parts.push(
    `Continuity RULES: ${input.continuity.wardrobeAnchor}; ` +
    `${input.continuity.locationAnchor}. ` +
    `The protagonist's face, hairstyle, and outfit MUST be identical to previous shots — ` +
    `do not redesign the character.`,
  );
  if (input.emotion) parts.push(`Emotion: ${input.emotion}`);
  if (input.scenePurpose) parts.push(`Scene purpose: ${input.scenePurpose}`);
  if (input.chapterLabel) parts.push(`Chapter: ${input.chapterLabel}`);
  if (input.sceneNumber != null) parts.push(`Scene ${input.sceneNumber}`);
  parts.push("ultra realistic, HDR, 8K, highly detailed, sharp focus, professional photography");
  parts.push(`Avoid: ${negativePrompt}, different person, changed face, new character, wardrobe change, hairstyle change`);

  const prompt = optimizePrompt(parts.join(". "), input.styleId);

  return {
    prompt,
    negativePrompt,
    shotType,
    cameraMove,
    preset,
    meta: {
      title: input.title,
      styleId: input.styleId,
      sceneNumber: input.sceneNumber ?? null,
      chapter: input.chapterLabel ?? null,
      emotion: input.emotion ?? null,
      scenePurpose: input.scenePurpose ?? null,
    },
  };
}

/**
 * Prompt Optimizer — final polishing pass. Deduplicates repeated cinematic
 * tokens, trims runaway length, and guarantees the "no text/no watermark"
 * clause is present. Kept pure so any generator can call it.
 */
export function optimizePrompt(raw: string, styleId: VDStyle): string {
  let s = raw.replace(/\s+/g, " ").trim();
  // Dedup contiguous duplicate phrases (comma-separated).
  const seen = new Set<string>();
  s = s
    .split(/[.;]\s+/)
    .map((seg) => seg.trim())
    .filter((seg) => {
      if (!seg) return false;
      const key = seg.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(". ");
  if (!/no text|no watermark/i.test(s)) {
    s += ". No text, no watermark, no captions, no logos in the image.";
  }
  // Hard cap so the image API doesn't reject overly long prompts.
  const MAX = 1400;
  if (s.length > MAX) s = s.slice(0, MAX - 1).replace(/,[^,]*$/, "") + "…";
  // Anchor illustrated styles so photorealism cues don't override them.
  if (STYLE_PRESETS[styleId].isIllustrated && !/illustration|animation|painting/i.test(s)) {
    s = `${STYLE_PRESETS[styleId].label} illustration. ${s}`;
  }
  return s;
}
