// Thumbnail Director — creative engine for professional YouTube thumbnails.
//
// This module owns EVERY creative decision that goes into a high-CTR thumbnail
// so both the standalone Thumbnails page and the Video Studio's thumbnail step
// produce identical, layered output:
//
//   Video Topic
//     ↓ Research  → detect emotion, subject cues, contrast opportunities
//     ↓ CTR       → pick composition archetype (giant subject, split, hero face…)
//     ↓ Concept   → 4 distinct concepts (Fear / Curiosity / Documentary / Minimal)
//     ↓ Compose   → layer plan (BG, subject, secondary, effects, text, glow, grade)
//     ↓ Text      → 2–5 word high-CTR headline + placement + color
//
// The pipeline runner (thumbnail-agents.ts) turns each `ThumbnailPlan` into real
// image layers. Renderer is HTML/CSS overlay (html-to-image PNG export) so text
// stays perfectly spelled, editable, and 1280×720.

import { STYLE_PRESETS, type VDStyle } from "@/lib/visual-director";

// ---------------- Types ----------------

export type Emotion = "fear" | "shock" | "curiosity" | "mystery" | "hope" | "awe" | "urgency";

export type CompositionArchetype =
  | "giant_subject_vs_tiny_human"
  | "shocked_hero_face"
  | "split_before_after"
  | "vs_confrontation"
  | "foreground_object_bg_scene"
  | "silhouette_negative_space"
  | "documentary_hero"
  | "minimal_object";

export type TextPlacement = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

export type TextStyle = {
  color: string;          // hex
  outline: string;        // hex, drawn as text-stroke
  glow: string;           // rgba/hex for text-shadow bloom
  fontWeight: 900 | 800;
  italic: boolean;
  fontFamily: "Impact" | "Bebas" | "Anton" | "Inter";
  transform: "uppercase" | "none";
};

export type ColorGrade = {
  primary: string;    // hex
  accent: string;     // hex
  vignette: number;   // 0..1
  contrast: number;   // 0..1
  saturation: number; // 0..1 target
  overlay: string;    // css gradient string laid over the composed layers
};

export type ThumbnailStyleId =
  | "mrbeast" | "magnates" | "james_jani" | "documentary"
  | "dark_mystery" | "netflix" | "future_civ" | "minimal" | "cinematic";

export type ThumbnailStylePreset = {
  id: ThumbnailStyleId;
  label: string;
  vdStyle: VDStyle;
  colorGrade: ColorGrade;
  textStyle: TextStyle;
  archetype: CompositionArchetype;
  emotionBias: Emotion;
  bgPromptModifier: string;
  subjectPromptModifier: string;
  ctrNotes: string;
};

export type LayerSpec = {
  key: "background" | "subject" | "secondary" | "effects" | "lighting" | "text" | "glow" | "grade" | "sharpen";
  label: string;
  description: string;
  visible: boolean;
  editable: boolean;
};

export type ThumbnailConcept = {
  id: string;
  label: string;                     // "Fear", "Curiosity", "Documentary", "Minimal"
  emotion: Emotion;
  archetype: CompositionArchetype;
  headline: string;                  // 2–5 words, ALL CAPS
  subHeadline?: string;              // optional smaller kicker
  textPlacement: TextPlacement;
  textStyle: TextStyle;
  colorGrade: ColorGrade;
  style: ThumbnailStylePreset;
  backgroundPrompt: string;
  subjectPrompt: string;             // main hero subject, transparent PNG
  secondarySubjectPrompt: string | null; // optional secondary (for VS/split concepts)
  layers: LayerSpec[];
  ctrScore: number;                  // 0..100 (self-rated by the director)
  reasoning: string;                 // short human-readable "why this works"
};

export type ThumbnailPlan = {
  topic: string;
  detectedEmotion: Emotion;
  keywords: string[];
  concepts: ThumbnailConcept[];      // always 4
};

// ---------------- Style presets ----------------

const RED = "#EF3340";
const YELLOW = "#FFD400";
const ORANGE = "#FF7A18";
const WHITE = "#FFFFFF";
const BLACK = "#0B0B0F";
const GOLD = "#D4A83A";
const CYAN = "#22D3EE";

function stylePreset(
  id: ThumbnailStyleId,
  label: string,
  vdStyle: VDStyle,
  archetype: CompositionArchetype,
  emotionBias: Emotion,
  colorGrade: ColorGrade,
  textStyle: TextStyle,
  bgPromptModifier: string,
  subjectPromptModifier: string,
  ctrNotes: string,
): ThumbnailStylePreset {
  return { id, label, vdStyle, archetype, emotionBias, colorGrade, textStyle, bgPromptModifier, subjectPromptModifier, ctrNotes };
}

export const THUMBNAIL_STYLE_PRESETS: ThumbnailStylePreset[] = [
  stylePreset(
    "mrbeast", "MrBeast", "cinematic", "shocked_hero_face", "shock",
    { primary: RED, accent: YELLOW, vignette: 0.35, contrast: 0.85, saturation: 0.95,
      overlay: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)" },
    { color: YELLOW, outline: BLACK, glow: "rgba(0,0,0,0.9)", fontWeight: 900, italic: false, fontFamily: "Impact", transform: "uppercase" },
    "hyper-saturated background, extreme rim light, cinematic teal-and-orange, wide 16:9, empty area on left for headline",
    "single hero subject front-lit and rim-lit, shocked or intense expression, colorful clothing, glossy magazine finish, isolated on transparent background",
    "Face 40% of frame, giant object, extreme contrast, saturated primary colors",
  ),
  stylePreset(
    "magnates", "MagnatesMedia", "cinematic", "giant_subject_vs_tiny_human", "awe",
    { primary: GOLD, accent: BLACK, vignette: 0.5, contrast: 0.9, saturation: 0.7,
      overlay: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%)" },
    { color: WHITE, outline: BLACK, glow: "rgba(0,0,0,0.9)", fontWeight: 900, italic: false, fontFamily: "Anton", transform: "uppercase" },
    "epic wide cinematic environment, atmospheric haze, volumetric god rays, gold-and-black grade, corporate documentary poster energy",
    "iconic hero object or figure at giant scale, backlit rim light, cinematic silhouette, isolated on transparent background",
    "Scale differences, negative space, documentary awe",
  ),
  stylePreset(
    "james_jani", "James Jani", "documentary", "documentary_hero", "curiosity",
    { primary: "#1E7BFF", accent: WHITE, vignette: 0.4, contrast: 0.75, saturation: 0.6,
      overlay: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%)" },
    { color: WHITE, outline: "#0F172A", glow: "rgba(0,0,0,0.8)", fontWeight: 800, italic: false, fontFamily: "Inter", transform: "uppercase" },
    "clean editorial documentary background, muted colors, cool blue accents, wide framing",
    "single confident hero subject, editorial lighting, expressive but controlled, isolated on transparent background",
    "Curiosity-driven, editorial polish, mid-scale subject",
  ),
  stylePreset(
    "documentary", "Documentary", "documentary", "documentary_hero", "curiosity",
    { primary: "#2A5D9F", accent: "#F2C744", vignette: 0.45, contrast: 0.7, saturation: 0.55,
      overlay: "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.6) 100%)" },
    { color: WHITE, outline: BLACK, glow: "rgba(0,0,0,0.85)", fontWeight: 800, italic: false, fontFamily: "Inter", transform: "uppercase" },
    "National Geographic / BBC documentary photography, natural lighting, earthy palette, wide establishing framing",
    "documentary hero subject, candid framing, natural expression, isolated on transparent background",
    "Journalistic curiosity, natural palette, single strong subject",
  ),
  stylePreset(
    "dark_mystery", "Dark Mystery", "dark_mystery", "silhouette_negative_space", "mystery",
    { primary: "#0B0B0F", accent: RED, vignette: 0.75, contrast: 0.95, saturation: 0.5,
      overlay: "radial-gradient(ellipse at 30% 40%, rgba(239,51,64,0.15) 0%, rgba(0,0,0,0.85) 80%)" },
    { color: RED, outline: BLACK, glow: "rgba(239,51,64,0.55)", fontWeight: 900, italic: true, fontFamily: "Bebas", transform: "uppercase" },
    "low-key noir background, deep shadows, single red rim light, atmospheric fog, cinematic grain",
    "backlit silhouette or partially-shadowed subject, mysterious, single rim light, isolated on transparent background",
    "Mystery, chiaroscuro, deep negative space, single red accent",
  ),
  stylePreset(
    "netflix", "Netflix", "cinematic", "hero_face" as CompositionArchetype ?? "shocked_hero_face", "urgency",
    { primary: "#E50914", accent: WHITE, vignette: 0.6, contrast: 0.9, saturation: 0.75,
      overlay: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)" },
    { color: WHITE, outline: "#E50914", glow: "rgba(229,9,20,0.55)", fontWeight: 900, italic: false, fontFamily: "Bebas", transform: "uppercase" },
    "streaming series key art background, deep blacks, single dramatic light source, prestige cinematic composition",
    "hero portrait or figure, dramatic key light, cinematic wardrobe, isolated on transparent background",
    "Prestige-drama key art, red accent, cinematic drop shadows",
  ),
  stylePreset(
    "future_civ", "Future Civilization", "cyberpunk", "foreground_object_bg_scene", "awe",
    { primary: CYAN, accent: "#F97316", vignette: 0.4, contrast: 0.9, saturation: 0.9,
      overlay: "radial-gradient(ellipse at 30% 60%, rgba(34,211,238,0.2) 0%, rgba(0,0,0,0.7) 100%)" },
    { color: WHITE, outline: BLACK, glow: "rgba(34,211,238,0.6)", fontWeight: 900, italic: false, fontFamily: "Anton", transform: "uppercase" },
    "futuristic city or interior, neon signage, atmospheric haze, cyan/magenta grade, holographic accents, wide 16:9",
    "sci-fi subject (robot, AI, silhouette, cyber-figure), neon rim light, isolated on transparent background",
    "Sci-fi awe, neon rim, future civilization energy",
  ),
  stylePreset(
    "minimal", "Minimal", "minimal_product", "minimal_object", "curiosity",
    { primary: "#0F172A", accent: ORANGE, vignette: 0.15, contrast: 0.6, saturation: 0.5,
      overlay: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 100%)" },
    { color: BLACK, outline: WHITE, glow: "rgba(0,0,0,0.15)", fontWeight: 900, italic: false, fontFamily: "Inter", transform: "uppercase" },
    "clean minimal background, off-white/neutral palette, soft studio window light, ample negative space",
    "single iconic object, studio product lighting, sharp focus, isolated on transparent background",
    "Negative space, single object, Scandinavian polish",
  ),
  stylePreset(
    "cinematic", "Cinematic", "cinematic", "split_before_after", "urgency",
    { primary: "#FF7A18", accent: CYAN, vignette: 0.5, contrast: 0.9, saturation: 0.85,
      overlay: "linear-gradient(90deg, rgba(34,211,238,0.15) 0%, transparent 50%, rgba(255,122,24,0.15) 100%)" },
    { color: WHITE, outline: BLACK, glow: "rgba(0,0,0,0.85)", fontWeight: 900, italic: false, fontFamily: "Impact", transform: "uppercase" },
    "cinematic split composition, left cold desaturated blue, right warm saturated orange, anamorphic lens flare, wide 16:9",
    "hero subject bridging both halves, half-lit cold and warm, isolated on transparent background",
    "Before/After contrast, teal-orange split, feature-film still",
  ),
];

export function findStylePreset(id: ThumbnailStyleId): ThumbnailStylePreset {
  return THUMBNAIL_STYLE_PRESETS.find((s) => s.id === id) ?? THUMBNAIL_STYLE_PRESETS[0];
}

// ---------------- Emotion + text engines ----------------

const EMOTION_KEYWORDS: Record<Emotion, string[]> = {
  fear:      ["end", "extinction", "last", "collapse", "die", "killed", "gone", "over", "died", "fired", "destroyed"],
  shock:     ["shocking", "unbelievable", "wtf", "insane", "crazy", "impossible", "banned"],
  curiosity: ["secret", "hidden", "why", "how", "truth", "revealed", "inside", "behind"],
  mystery:   ["mystery", "unknown", "vanished", "disappeared", "conspiracy", "dark"],
  hope:      ["saved", "future", "hope", "rebirth", "new", "reborn", "rise"],
  awe:       ["biggest", "largest", "first", "greatest", "epic", "massive", "world", "planet"],
  urgency:   ["2025", "2030", "2045", "2050", "today", "now", "warning", "before", "final"],
};

function detectEmotion(topic: string): Emotion {
  const s = topic.toLowerCase();
  let best: { e: Emotion; score: number } = { e: "curiosity", score: 0 };
  for (const [e, words] of Object.entries(EMOTION_KEYWORDS) as [Emotion, string[]][]) {
    const score = words.reduce((n, w) => n + (s.includes(w) ? 1 : 0), 0);
    if (score > best.score) best = { e, score };
  }
  return best.e;
}

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","in","on","for","with","is","are","was","were","be","been",
  "that","this","it","as","at","by","from","how","why","what","when","who","which","will",
]);

function keywords(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .slice(0, 8);
}

/** Build a 2-5 word high-CTR headline from the topic. */
function generateHeadline(topic: string, emotion: Emotion): string {
  const kws = keywords(topic);
  const key = kws[0] ?? "future";
  const key2 = kws[1] ?? kws[0] ?? "world";
  const templates: Record<Emotion, string[]> = {
    fear:      [`THE LAST ${key.toUpperCase()}`, `${key.toUpperCase()} IS DEAD`, "WORK IS OVER", "HUMANS FIRED", `THE END OF ${key.toUpperCase()}`],
    shock:     [`${key.toUpperCase()} WON`, `AI ATE ${key.toUpperCase()}`, "IT HAPPENED", "NO ONE SAW THIS"],
    curiosity: [`INSIDE ${key.toUpperCase()}`, `WHY ${key.toUpperCase()}?`, "THE REAL STORY", `THE ${key.toUpperCase()} TRUTH`],
    mystery:   [`WHAT HAPPENED TO ${key.toUpperCase()}?`, `${key.toUpperCase()} VANISHED`, "NO ONE KNOWS"],
    hope:      [`${key.toUpperCase()} REBORN`, "THE NEW WORLD", `${key.toUpperCase()} RISES`],
    awe:       [`THE LAST ${key.toUpperCase()}`, `${key.toUpperCase()} vs ${key2.toUpperCase()}`, "2045", "THE FINAL CITY"],
    urgency:   ["2045", "IT'S TOO LATE", "BEFORE 2030", `${key.toUpperCase()} NOW`],
  };
  const pool = templates[emotion];
  // Pick shortest-fitting headline; enforce hard 2-5 word cap.
  const pick = pool
    .map((h) => h.trim())
    .filter((h) => {
      const w = h.split(/\s+/).length;
      return w >= 2 && w <= 5;
    })[0] ?? pool[0];
  return pick.toUpperCase();
}

// ---------------- Layer + concept builders ----------------

function defaultLayers(hasSecondary: boolean): LayerSpec[] {
  return [
    { key: "background", label: "Background",       description: "AI-generated cinematic environment", visible: true,           editable: true  },
    { key: "subject",    label: "Main Subject",     description: "Hero subject on transparent PNG",    visible: true,           editable: true  },
    { key: "secondary",  label: "Secondary Subject",description: "Optional VS / split subject",        visible: hasSecondary,   editable: true  },
    { key: "effects",    label: "Effects",          description: "Motion, particles, lens flare",      visible: true,           editable: false },
    { key: "lighting",   label: "Lighting",         description: "Rim + key light overlay",            visible: true,           editable: false },
    { key: "text",       label: "Title Text",       description: "HTML/CSS overlay — perfectly spelled", visible: true,         editable: true  },
    { key: "glow",       label: "Text Glow",        description: "Soft bloom behind the headline",     visible: true,           editable: true  },
    { key: "grade",      label: "Color Grade",      description: "Cinematic color overlay",            visible: true,           editable: true  },
    { key: "sharpen",    label: "Final Sharpen",    description: "CSS sharpen + contrast pass",        visible: true,           editable: false },
  ];
}

function bestPlacement(archetype: CompositionArchetype): TextPlacement {
  switch (archetype) {
    case "shocked_hero_face":         return "top-right";
    case "giant_subject_vs_tiny_human": return "top-left";
    case "split_before_after":        return "center";
    case "vs_confrontation":          return "center";
    case "foreground_object_bg_scene":return "bottom-left";
    case "silhouette_negative_space": return "top-right";
    case "documentary_hero":          return "bottom-left";
    case "minimal_object":            return "bottom-right";
    default:                           return "bottom-left";
  }
}

function buildBackgroundPrompt(topic: string, preset: ThumbnailStylePreset): string {
  return [
    `Cinematic YouTube thumbnail BACKGROUND ONLY for the topic "${topic}".`,
    `${preset.bgPromptModifier}.`,
    `Ultra sharp, 16:9, poster-grade composition, extreme contrast, high dynamic range, 8K detail.`,
    `Leave clear negative space so a subject can be composited on top.`,
    `ABSOLUTELY NO text, letters, numbers, watermarks, logos, captions, or UI in the image.`,
  ].join(" ");
}

function buildSubjectPrompt(topic: string, preset: ThumbnailStylePreset, subjectHint: string): string {
  return [
    `High-CTR YouTube thumbnail SUBJECT for "${topic}": ${subjectHint}.`,
    `${preset.subjectPromptModifier}.`,
    `Studio-quality, sharp focus, dramatic rim + key lighting, cinematic composition.`,
    `Isolated on a fully transparent background (PNG cutout) — no floor, no shadow plane, no environment.`,
    `NO text, letters, numbers, watermarks, logos.`,
  ].join(" ");
}

function subjectHintForTopic(topic: string): string {
  const s = topic.toLowerCase();
  if (/robot|ai|machine|algorithm/.test(s))            return "expressive humanoid robot or AI figure, glowing eyes";
  if (/city|urban|skyline/.test(s))                    return "iconic futuristic city landmark at giant scale";
  if (/car|vehicle|driver/.test(s))                    return "hero vehicle, low-angle, cinematic";
  if (/school|education|student/.test(s))              return "abandoned classroom hero object (desk, chalkboard) or lone student";
  if (/money|rich|poor|wealth|bank/.test(s))           return "iconic money/wealth symbol at giant scale";
  if (/planet|space|earth|mars/.test(s))               return "hero planet or spacecraft, backlit rim light";
  if (/factory|industrial/.test(s))                    return "massive industrial machinery, backlit";
  if (/office|work|job|employee/.test(s))              return "single lone office worker, dramatic expression";
  if (/explosion|war|destruction/.test(s))             return "iconic explosion or aftermath object";
  return "single expressive human hero character reacting with awe and shock, front-lit and rim-lit";
}

function secondarySubjectHintForTopic(topic: string): string | null {
  const s = topic.toLowerCase();
  if (/ai|robot|machine/.test(s) && /human|worker|employee|job/.test(s))
    return "small human silhouette confronting the AI/robot, low-angle";
  if (/rich|poor|wealth/.test(s)) return "contrast figure representing the opposite side, small scale";
  if (/before|after|then|now|old|new|future/.test(s)) return "smaller 'before' state object for scale contrast";
  return null;
}

function buildConcept(
  topic: string,
  label: string,
  emotion: Emotion,
  styleId: ThumbnailStyleId,
  archetype: CompositionArchetype,
  ctrScore: number,
  reasoning: string,
): ThumbnailConcept {
  const preset = findStylePreset(styleId);
  const headline = generateHeadline(topic, emotion);
  const subjectHint = subjectHintForTopic(topic);
  const secondaryHint = secondarySubjectHintForTopic(topic);
  const bg = buildBackgroundPrompt(topic, preset);
  const subject = buildSubjectPrompt(topic, preset, subjectHint);
  const secondary = secondaryHint ? buildSubjectPrompt(topic, preset, secondaryHint) : null;
  return {
    id: crypto.randomUUID(),
    label,
    emotion,
    archetype,
    headline,
    textPlacement: bestPlacement(archetype),
    textStyle: preset.textStyle,
    colorGrade: preset.colorGrade,
    style: preset,
    backgroundPrompt: bg,
    subjectPrompt: subject,
    secondarySubjectPrompt: secondary,
    layers: defaultLayers(Boolean(secondary)),
    ctrScore,
    reasoning,
  };
}

// ---------------- Public API ----------------

/** Plan 4 thumbnail concepts (Fear / Curiosity / Documentary / Minimal) for a topic. */
export function planThumbnails(topic: string): ThumbnailPlan {
  const clean = (topic ?? "").trim();
  const detectedEmotion = detectEmotion(clean);
  const kws = keywords(clean);
  const concepts: ThumbnailConcept[] = [
    buildConcept(clean, "Fear",       "fear",      "mrbeast",     "shocked_hero_face",         92,
      "MrBeast-tier shock face + saturated color pop. Highest raw CTR for emotional topics."),
    buildConcept(clean, "Curiosity",  "curiosity", "future_civ",  "foreground_object_bg_scene",88,
      "Neon future-civ cue triggers curiosity; giant object anchors the eye."),
    buildConcept(clean, "Documentary","curiosity", "documentary", "documentary_hero",          82,
      "James Jani / ColdFusion editorial framing — trusted, high-CTR for long-form docs."),
    buildConcept(clean, "Minimal",    "mystery",   "minimal",     "minimal_object",            76,
      "Negative space + single iconic object. Stands out in a busy feed."),
  ];
  return { topic: clean, detectedEmotion, keywords: kws, concepts };
}

/** List the concept "moods" so the UI can render selectors without importing internals. */
export const CONCEPT_MOODS: { id: string; label: string; emotion: Emotion; styleId: ThumbnailStyleId }[] = [
  { id: "fear",        label: "Fear",        emotion: "fear",      styleId: "mrbeast" },
  { id: "curiosity",   label: "Curiosity",   emotion: "curiosity", styleId: "future_civ" },
  { id: "documentary", label: "Documentary", emotion: "curiosity", styleId: "documentary" },
  { id: "minimal",     label: "Minimal",     emotion: "mystery",   styleId: "minimal" },
];

/** Regenerate the headline for a concept (useful when the user re-rolls text). */
export function rerollHeadline(concept: ThumbnailConcept): string {
  return generateHeadline(concept.headline, concept.emotion) || concept.headline;
}

/** Convenience: default style preset the standalone Thumbnails page opens with. */
export const DEFAULT_STYLE: ThumbnailStyleId = "mrbeast";

/** Placeholder to prevent unused-import errors when composing new features. */
export const _KNOWN_VD_STYLES = Object.keys(STYLE_PRESETS) as VDStyle[];
