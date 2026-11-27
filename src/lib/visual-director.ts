// Visual Director — reusable creative engine for the AI Studio.
//
// Turns each storyboard beat into a Netflix-doc / Apple-commercial grade
// cinematic prompt. Composes: locked character, shot type, camera kit, lens,
// aperture, lighting recipe, environment expansion, story details, mood,
// palette, emotion, and continuity anchor. All inference is deterministic
// and topic-aware via `cinematic-engine.ts` — no LLM calls in this file.

import {
  classifyTopic,
  pickCameraKit,
  inferEmotion,
  pickPalette,
  enrichEnvironment,
  storyDetailsFor,
  inferMood,
  lightingRecipe,
  reviewPromptQuality,
} from "./cinematic-engine";

export const CINEMATIC_STYLES = {
  indian_mythology: {
    label: "Indian Mythology",
    description: "Photorealistic Indian epic mythology with respectful depictions, traditional costumes and ornaments, ancient Indian architecture, epic scale, and realistic fabric and skin or fur textures",
    lighting: "divine golden lighting with volumetric rays",
    palette: "gold, saffron, and deep ocean blue",
    lens: "35mm anamorphic",
    negative: "anachronistic objects unless the story explicitly requests them",
    continuity: "preserve canonical or user-specified features, including non-human anatomy, ornaments and traditional clothing",
    music: "divine orchestral instrumental with Indian instrumentation",
    sound: "scene-specific natural ambience and restrained divine accents",
    thumbnail: "ancient",
    accent: "#d97706",
    renderer: "ancient",
  },
  epic_fantasy: {
    label: "Epic Fantasy",
    description: "Expansive fantasy landscapes, detailed costumes and creatures, dramatic skies, grounded magical energy and dynamic action compositions",
    lighting: "dramatic rim light and atmospheric fog",
    palette: "deep forest green, indigo, and amber",
    lens: "28mm anamorphic",
    negative: "inconsistent creature anatomy or arbitrary changes to magical effects",
    continuity: "lock creature anatomy, silhouette, costume, accessories and magical attributes",
    music: "epic cinematic adventure instrumental",
    sound: "environmental textures and action-specific magic or impacts",
    thumbnail: "cinematic",
    accent: "#7c3aed",
    renderer: "cinematic",
  },
  photorealistic_cinema: {
    label: "Photorealistic Cinema",
    description: "Feature-film photography with natural skin texture, realistic anatomy and motion, environmental detail and cinematic depth of field",
    lighting: "physically plausible motivated light with natural bounce",
    palette: "film-inspired natural colors with restrained contrast",
    lens: "50mm prime",
    negative: "plastic skin, exaggerated movement or impossible shadows",
    continuity: "preserve face, build, complexion, hairstyle, costume and accessories across shots",
    music: "restrained instrumental film score driven by scene emotion",
    sound: "realistic location ambience and synchronized Foley",
    thumbnail: "realistic",
    accent: "#64748b",
    renderer: "realistic",
  },
} as const;

export type CinematicStyleId = keyof typeof CINEMATIC_STYLES;

export function cinematicStyleFor(style: string) {
  return Object.hasOwn(CINEMATIC_STYLES, style)
    ? CINEMATIC_STYLES[style as CinematicStyleId]
    : undefined;
}

export type VDStyle =
  | "documentary" | "cinematic" | "realistic" | "ghibli" | "anime"
  | "pixar" | "3d" | "dark_mystery" | "luxury" | "cyberpunk"
  | "minimal_product" | "futuristic" | CinematicStyleId;

export type VDRatio = "16:9" | "9:16" | "1:1";

export type ShotType =
  | "wide_establishing" | "hero" | "drone" | "extreme_close_up" | "close_up"
  | "medium" | "over_the_shoulder" | "birds_eye" | "low_angle" | "high_angle"
  | "silhouette" | "macro" | "interior" | "exterior" | "tracking";

export type CameraMove =
  | "static" | "push_in" | "pull_out" | "pan_left" | "pan_right"
  | "tilt_up" | "tilt_down" | "handheld" | "dolly" | "crane" | "orbit";

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

const CINEMATIC_PRESETS = Object.fromEntries(
  Object.entries(CINEMATIC_STYLES).map(([id, style]) => [id, {
    label: style.label,
    camera: "ARRI Alexa Mini",
    lens: style.lens,
    aperture: "f/2.8",
    lighting: style.lighting,
    colorGrade: style.palette,
    look: style.description,
    extras: [style.continuity],
    isIllustrated: false,
  }]),
) as Record<CinematicStyleId, StylePreset>;

export const STYLE_PRESETS: Record<VDStyle, StylePreset> = {
  ...CINEMATIC_PRESETS,
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

/** Global negative-prompt vocabulary. Illustrated styles drop the photo-only
 * negatives (cartoon/anime/illustration/cgi) so those styles aren't fought. */
const PHOTO_NEGATIVES = [
  "low quality", "low resolution", "blurry", "noise", "artifacts", "jpeg artifacts",
  "oversaturated", "deformed anatomy", "bad anatomy", "distorted body",
  "bad hands", "extra fingers", "duplicate people", "cropped face", "bad eyes",
  "text", "logo", "watermark", "caption",
  "cartoon", "anime", "illustration", "cgi",
  "different person", "changed face", "new character", "identity drift",
  "wardrobe change", "hairstyle change", "outfit change", "accessory change",
];
const ILLUSTRATED_NEGATIVES = [
  "low quality", "low resolution", "blurry", "noise", "artifacts", "jpeg artifacts",
  "deformed anatomy", "bad anatomy", "distorted body",
  "bad hands", "extra fingers", "duplicate people", "cropped face", "bad eyes",
  "text", "logo", "watermark", "caption",
  "different character", "identity drift", "wardrobe change", "hairstyle change",
];

/** Deterministic non-repeating shot-type rotation. Uses the beat index and a
 * small shuffle so consecutive beats never share framing. */
const SHOT_ROTATION: ShotType[] = [
  "wide_establishing", "medium", "close_up", "over_the_shoulder", "low_angle",
  "hero", "drone", "extreme_close_up", "birds_eye", "high_angle", "silhouette",
  "tracking", "macro", "interior", "exterior",
];

/**
 * Shot types that show the place, objects or details rather than the
 * protagonist. They keep a video from becoming 20 face close-ups in a row,
 * and they don't need the character reference image (cheaper to render).
 */
export const CHARACTER_FREE_SHOTS: ReadonlySet<ShotType> = new Set<ShotType>([
  "wide_establishing", "drone", "birds_eye", "macro", "exterior",
]);

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
  orbit: "controlled orbital camera movement around the subject",
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

export type CreativeBriefLite = {
  visualHero: string;
  visualStyle: string;
  cameraStyle: string;
  sceneComposition: string;
  paletteHint: string;
  avoid: string[];
  intent: string;
};

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
  /** Optional Creative Director brief — steers hero subject + avoid list. */
  brief?: CreativeBriefLite | null;
  /** Optional environment override — bypasses cinematic-engine enrichment
   * so the caller (Character Bible pipeline) can rotate locations across
   * beats to guarantee variety. */
  environmentOverride?: string | null;
  visualInstructions?: string;
  /** Optional Master Character Reference URL — surfaced in the prompt as an
   * identity anchor cue for models that support reference-image conditioning. */
  masterReferenceUrl?: string | null;
};

export type DirectorOutput = {
  prompt: string;              // final, optimizer-ready cinematic prompt
  negativePrompt: string;      // comma-joined negatives (also folded into `prompt`)
  shotType: ShotType;
  /** False for b-roll shots that show no person (see CHARACTER_FREE_SHOTS). */
  hasCharacter: boolean;
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

/**
 * Core creative engine: turn one beat into a Netflix-grade cinematic prompt.
 * Pure function. Topic-aware: infers palette, environment, lighting recipe,
 * emotion, and story details from the beat + title without any LLM call.
 */
/** Indic, Arabic, CJK, Cyrillic, Thai… — scripts image models can't render and shouldn't try. */
const NON_LATIN_SCRIPT = /[\u0400-\u04FF\u0590-\u06FF\u0900-\u0DFF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/;

const SCENE_CAMERA_MOVES: Partial<Record<ShotType, CameraMove>> = {
  drone: "crane",
  low_angle: "tilt_up",
  extreme_close_up: "push_in",
  wide_establishing: "pull_out",
  tracking: "dolly",
  hero: "orbit",
};

function inferCinematicShot(action: string): ShotType | undefined {
  if (/\b(flies|flying|soars|aerial)\b/i.test(action)) return "drone";
  if (/\b(leaps?|jumps?|charges?)\b/i.test(action)) return "low_angle";
  if (/\b(remembers?|realizes?|whispers?)\b/i.test(action)) return "extreme_close_up";
  if (/\b(overlook\w*|horizon|establishing)\b/i.test(action)) return "wide_establishing";
  if (/\b(runs?|walks?|chases?)\b/i.test(action)) return "tracking";
  if (/\b(reveals?|awakens?|transforms?)\b/i.test(action)) return "hero";
}

export function directBeatPrompt(input: DirectorInput): DirectorOutput {
  const preset = STYLE_PRESETS[input.styleId] ?? STYLE_PRESETS.cinematic;
  const cinematicStyle = cinematicStyleFor(input.styleId);
  const action = `${input.beatText} ${input.sceneContext ?? ""}`;
  const preferredShot = cinematicStyle ? inferCinematicShot(action) : undefined;
  const shotType = preferredShot && preferredShot !== input.previousShotType
    ? preferredShot
    : pickShotType(input.beatIndex, input.previousShotType);
  const cameraMove = (cinematicStyle && SCENE_CAMERA_MOVES[shotType]) || pickCameraMove(input.beatIndex);

  const topic = classifyTopic(`${input.title} ${input.beatText} ${input.sceneContext ?? ""} ${input.brief?.intent ?? ""}`);
  const mood = inferMood(input.beatText);
  const emotion = inferEmotion(input.beatText, input.emotion ?? null);
  const cameraKit = preset.isIllustrated || cinematicStyle
    ? { camera: preset.camera, lens: preset.lens, aperture: preset.aperture }
    : pickCameraKit(input.beatIndex, input.styleId);
  const palette = cinematicStyle?.palette || input.brief?.paletteHint || pickPalette(topic, input.beatIndex);
  const environment = input.environmentOverride && input.environmentOverride.trim().length > 0
    ? input.environmentOverride.trim()
    : enrichEnvironment(input.sceneContext, topic, mood.timeOfDay);
  const storyDetail = storyDetailsFor(topic, input.beatIndex);
  const lighting = preset.isIllustrated || cinematicStyle ? preset.lighting : lightingRecipe(topic, mood, emotion);

  const negatives = preset.isIllustrated ? ILLUSTRATED_NEGATIVES : PHOTO_NEGATIVES;
  const negativePrompt = [...negatives, ...(cinematicStyle ? [cinematicStyle.negative] : [])].join(", ");

  const beat = input.beatText.trim().replace(/\s+/g, " ");
  // The beat is the spoken line, often in Telugu/Hindi/etc. Quoting it in the
  // prompt makes image models paint it as (garbled) text, so non-Latin lines
  // are left out and described through the scene's English visual instead,
  // and English lines are paraphrased without quotes.
  const sceneVisual = (input.sceneContext ?? "").trim();
  const beatIdea = NON_LATIN_SCRIPT.test(beat)
    ? (sceneVisual || "the moment described by the scene")
    : `the idea: ${beat.replace(/["“”'‘’]/g, "")}`;
  void input.continuity.subjectAnchor;

  // B-roll shots show the place / objects, not the protagonist.
  const hasCharacter = !CHARACTER_FREE_SHOTS.has(shotType)
    || Boolean(cinematicStyle && /\b(stands?|flies|flying|soars|overlooks?)\b/i.test(action));

  const compose = (retry: boolean): string => {
    const parts: string[] = [];
    // What the frame IS comes first: image models weight the start of the
    // prompt most, and the length cap trims from the end. Putting the long
    // character sheet first used to turn every shot into a face close-up.
    parts.push(
      `Shot: ${SHOT_TYPE_PHRASES[shotType]} with ${CAMERA_MOVE_PHRASES[cameraMove]}, ` +
      `composed on the rule of thirds with layered foreground, midground, and background`,
    );
    parts.push(
      hasCharacter
        ? `Subject: the protagonist described below, acting out ${beatIdea} — show the action and setting, not just a portrait`
        : `Subject: show ${beatIdea} through the place, objects and details — no close-up of any person's face`,
    );
    if (sceneVisual && sceneVisual !== environment) parts.push(`Scene direction: ${sceneVisual}`);
    parts.push(`Environment: ${environment}`);
    if (input.visualInstructions) parts.push(`User visual instructions: ${input.visualInstructions}`);
    if (cinematicStyle) {
      parts.push(`Visual style: ${cinematicStyle.description}. ${cinematicStyle.continuity}. Avoid: ${cinematicStyle.negative}`);
      if (shotType === "low_angle") parts.push("Use a brief slow-motion accent at the peak of the action");
    }
    if (hasCharacter) {
      parts.push(
        `LOCKED CHARACTER SHEET (must match exactly in every image): ` +
        `${input.continuity.characterSheet}`,
      );
    }
    if (input.brief) {
      parts.push(
        `CREATIVE DIRECTOR (obey strictly): intent=${input.brief.intent}; ` +
        `visual hero=${input.brief.visualHero}; style=${input.brief.visualStyle}; ` +
        `camera=${input.brief.cameraStyle}; composition=${input.brief.sceneComposition}; ` +
        `palette=${input.brief.paletteHint}.`,
      );
    }
    if (!sceneVisual) parts.push(`Environmental storytelling detail: ${storyDetail}`);
    parts.push(`Time of day: ${mood.timeOfDay}. Atmosphere: ${mood.weather}. Energy: ${mood.energy}`);
    parts.push(`Camera: ${cameraKit.camera}, ${cameraKit.lens} at ${cameraKit.aperture}, shallow depth of field, sharp focus on ${hasCharacter ? "subject eyes" : "the key detail"}`);
    parts.push(`Lighting: ${lighting}`);
    parts.push(`Color palette and grade: ${palette}`);
    parts.push(`Look: ${preset.look} — Netflix documentary / Apple commercial / National Geographic quality`);
    if (preset.extras.length) parts.push(preset.extras.join(", "));
    if (hasCharacter) {
      parts.push(
        `Continuity RULES: ${input.continuity.wardrobeAnchor}; ` +
        `${input.continuity.locationAnchor}. ` +
        `The protagonist's face, hairstyle, and outfit MUST be identical to previous shots — ` +
        `do not redesign the character.`,
      );
    } else {
      parts.push(`Continuity RULES: ${input.continuity.locationAnchor}`);
    }
    parts.push(`Emotion driving the frame: ${emotion}${input.scenePurpose ? ` — ${input.scenePurpose}` : ""}`);
    // Chapter / scene numbers are not added: models tend to print them as labels.
    parts.push(
      "photorealistic, ultra realistic texture, HDR, 8K, premium color grading, " +
      "subtle film grain, ARRI / Sony / RED cinema quality, ultra detailed, sharp focus, " +
      "professional cinematography — never stock-photo, never generic",
    );
    if (retry) {
      parts.push(
        "MUST be a specific cinematic frame with named lighting, layered composition, " +
        "and rich environmental detail — no single-word settings, no generic descriptions",
      );
    }
    const briefAvoid = input.brief?.avoid?.length ? `, ${input.brief.avoid.join(", ")}` : "";
    const identityAvoid = hasCharacter
      ? ", different person, changed face, new character, wardrobe change, hairstyle change"
      : ", portrait, face close-up";
    parts.push(`Avoid: ${negativePrompt}, generic stock photography, single-word locations${identityAvoid}${briefAvoid}`);
    return optimizePrompt(parts.join(". "), input.styleId);
  };

  // Self-review + one automatic repair pass if the heuristic score is low.
  let prompt = compose(false);
  const review = reviewPromptQuality(prompt);
  if (review.score < 8) prompt = compose(true);

  return {
    prompt,
    negativePrompt,
    shotType,
    hasCharacter,
    cameraMove,
    preset,
    meta: {
      title: input.title,
      styleId: input.styleId,
      sceneNumber: input.sceneNumber ?? null,
      chapter: input.chapterLabel ?? null,
      emotion,
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
  // Hard cap so the image API doesn't reject overly long prompts. The most
  // important parts (shot, subject, environment, character) come first.
  const MAX = 2000;
  if (s.length > MAX) s = s.slice(0, MAX - 1).replace(/,[^,]*$/, "") + "…";
  // Added after the cap so it can never be trimmed away.
  // Always end with the text ban (after the cap so it can never be trimmed).
  // Captions are drawn by the app with real fonts, so the image must be clean.
  s += ". Absolutely no written words, letters, numbers, captions, subtitles, signs, labels, watermarks or logos anywhere in the image.";
  // Anchor illustrated styles so photorealism cues don't override them.
  if (STYLE_PRESETS[styleId]?.isIllustrated && !/illustration|animation|painting/i.test(s)) {
    s = `${STYLE_PRESETS[styleId].label} illustration. ${s}`;
  }
  return s;
}
