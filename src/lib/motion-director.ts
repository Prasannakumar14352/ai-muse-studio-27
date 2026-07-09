// Motion Director — decides how every beat should MOVE before it renders.
//
// The old pipeline just cycled 7 basic Ken Burns motions across every beat.
// This director instead:
//   1. Classifies each beat into a SceneType (product showcase, worksheet,
//      hands using product, UI demo, character, etc).
//   2. Picks a MotionStyle from a pool that fits the scene type AND the
//      detected content intent (product marketing → orbit / macro / spin;
//      kids education → page-flip / hand interaction; documentary → slow
//      dolly / crane; etc).
//   3. Picks a TransitionStyle out of that beat (whip-pan, page-flip, flash,
//      mask reveal…) so consecutive beats never feel like a slideshow.
//   4. Emits a short "motionBrief" that gets appended to the image prompt
//      so the still frame is *composed for* the motion — e.g. a page-flip
//      motion needs a top-down hand mid-flip of a worksheet, not a portrait
//      of a person.
//
// All logic here is a deterministic client-side heuristic. No LLM call, no
// network — the director runs during beat expansion so shot planning is
// fast and predictable.

import type { CameraMotion } from "@/lib/video-renderer";
import type { ContentIntent } from "@/lib/creative-director";

// ---------------------------------------------------------------------------
// Motion + transition + scene taxonomies
// ---------------------------------------------------------------------------

/** Superset of CameraMotion — the renderer implements each of these as a
 *  canvas transform. New motions added by the Motion Director. */
export type MotionStyle = CameraMotion
  | "orbit"          // combined pan + scale sweep, gives 3D orbit feel
  | "dollyLeft"      // sideways dolly (like tracking shot)
  | "dollyRight"
  | "craneUp"        // vertical crane rising up
  | "craneDown"      // crane descending
  | "macroPush"      // aggressive macro close-up push
  | "parallax"       // slow horizontal drift w/ slight scale (depth feel)
  | "floating"       // gentle sinusoidal float (product / hero shots)
  | "productSpin"    // horizontal wobble simulating rotation
  | "kineticText"    // subtle bob emphasizing on-screen typography
  | "pageFlip"       // slight rotational reveal (worksheets / documents)
  | "handInteract";  // slow lean-in emphasizing hand-on-object shots

export type TransitionStyle =
  | "cut"
  | "fade"
  | "whipPan"
  | "flash"
  | "slideLeft"
  | "slideUp"
  | "maskCircle"
  | "pageFlip"
  | "zoomBlur";

export type SceneType =
  | "product_showcase"
  | "product_usage"
  | "hands_using_product"
  | "lifestyle"
  | "explainer"
  | "character"
  | "document"       // PDF / printable page
  | "worksheet"      // kids activity page
  | "ui_demo"        // software / dashboard / app
  | "mockup"         // device / packaging mockup
  | "feature_highlight"
  | "cta"
  | "transition";

// ---------------------------------------------------------------------------
// Classification — heuristic from beat text + image prompt
// ---------------------------------------------------------------------------

const KIDS_TOKENS = [
  "worksheet", "coloring", "tracing", "maze", "sticker", "activity",
  "printable", "puzzle", "matching", "letter", "alphabet", "montessori",
  "kindergarten", "preschool", "toddler",
];
const PRODUCT_TOKENS = [
  "product", "mockup", "packaging", "unboxing", "bundle", "pricing",
  "features", "benefits", "buy now", "shop", "purchase",
];
const UI_TOKENS = [
  "dashboard", "app", "software", "screen", "ui", "interface", "click",
  "swipe", "tap", "menu", "settings", "notification",
];
const HAND_TOKENS = [
  "hand", "hands", "finger", "holding", "flipping", "touching",
  "pointing", "using", "writing", "coloring", "tracing",
];
const CHARACTER_TOKENS = [
  "kid", "child", "children", "parent", "mom", "dad", "teacher",
  "student", "family", "smiling", "laughing", "playing",
];
const DOC_TOKENS = [
  "pdf", "page", "document", "printable", "worksheet", "checklist",
  "form", "sheet",
];
const CTA_TOKENS = [
  "download", "get yours", "shop now", "buy", "sign up", "join",
  "subscribe", "start today", "cta", "link in bio",
];
const FEATURE_TOKENS = [
  "feature", "benefit", "why", "included", "included in", "unlock",
  "highlight",
];

function has(text: string, tokens: string[]): boolean {
  const t = text.toLowerCase();
  return tokens.some((k) => t.includes(k));
}

/** Infer a SceneType from the beat's narration + prompt + creative intent. */
export function classifyScene(
  beatText: string,
  imagePrompt: string,
  intent: ContentIntent | null,
): SceneType {
  const combined = `${beatText}\n${imagePrompt}`.toLowerCase();

  if (has(combined, CTA_TOKENS)) return "cta";
  if (has(combined, UI_TOKENS)) return "ui_demo";
  if (has(combined, KIDS_TOKENS) && has(combined, HAND_TOKENS)) return "hands_using_product";
  if (has(combined, KIDS_TOKENS)) return "worksheet";
  if (has(combined, DOC_TOKENS)) return "document";
  if (has(combined, HAND_TOKENS) && has(combined, PRODUCT_TOKENS)) return "hands_using_product";
  if (has(combined, PRODUCT_TOKENS)) {
    if (has(combined, HAND_TOKENS)) return "product_usage";
    return "product_showcase";
  }
  if (has(combined, FEATURE_TOKENS)) return "feature_highlight";
  if (has(combined, CHARACTER_TOKENS)) {
    // Character scenes for a product/education intent lean toward lifestyle,
    // not talking-head presenters.
    if (intent === "digital_product" || intent === "physical_product" ||
        intent === "children_education") return "lifestyle";
    return "character";
  }
  return "explainer";
}

// ---------------------------------------------------------------------------
// Motion pools — chosen per scene type, filtered per intent
// ---------------------------------------------------------------------------

const MOTION_POOL: Record<SceneType, MotionStyle[]> = {
  product_showcase:    ["productSpin", "orbit", "floating", "macroPush", "pushIn"],
  product_usage:       ["handInteract", "macroPush", "dollyRight", "dollyLeft", "pushIn"],
  hands_using_product: ["handInteract", "pageFlip", "macroPush", "tiltDown", "dollyRight"],
  lifestyle:           ["parallax", "dollyLeft", "dollyRight", "craneUp", "pushIn"],
  explainer:           ["pushIn", "dollyRight", "tiltDown", "parallax", "kineticText"],
  character:           ["pushIn", "dollyLeft", "tiltUp", "parallax"],
  document:            ["pageFlip", "tiltDown", "macroPush", "craneDown"],
  worksheet:           ["pageFlip", "handInteract", "tiltDown", "craneDown", "macroPush"],
  ui_demo:             ["pushIn", "tiltDown", "macroPush", "kineticText"],
  mockup:              ["productSpin", "orbit", "floating", "macroPush"],
  feature_highlight:   ["kineticText", "macroPush", "pushIn", "orbit"],
  cta:                 ["pushIn", "kineticText", "productSpin", "floating"],
  transition:          ["zoomIn", "pushIn"],
};

// Intent-specific overrides — if the intent is Digital Product Marketing we
// force product-first motions regardless of scene classification when the
// scene defaults to a character.
const INTENT_MOTION_OVERRIDE: Partial<Record<ContentIntent, Partial<Record<SceneType, MotionStyle[]>>>> = {
  digital_product: {
    character:   ["parallax", "dollyLeft", "dollyRight"], // no static talking heads
    explainer:   ["pageFlip", "pushIn", "macroPush", "handInteract"],
    lifestyle:   ["parallax", "dollyRight", "craneUp", "handInteract"],
  },
  physical_product: {
    character:   ["parallax", "dollyLeft", "dollyRight"],
    explainer:   ["orbit", "productSpin", "macroPush", "pushIn"],
  },
  children_education: {
    character:   ["handInteract", "pageFlip", "dollyRight"],
    explainer:   ["pageFlip", "handInteract", "craneDown", "tiltDown"],
    lifestyle:   ["handInteract", "dollyRight", "craneUp"],
  },
  saas_demo: {
    character:   ["pushIn", "tiltDown"],
    explainer:   ["pushIn", "tiltDown", "kineticText", "macroPush"],
  },
};

// ---------------------------------------------------------------------------
// Transition pools — vary per beat position
// ---------------------------------------------------------------------------

const TRANSITION_POOL: TransitionStyle[] = [
  "fade", "whipPan", "slideLeft", "slideUp", "maskCircle", "zoomBlur", "flash",
];

const TRANSITION_BY_SCENE: Partial<Record<SceneType, TransitionStyle[]>> = {
  worksheet:           ["pageFlip", "slideLeft", "fade"],
  document:            ["pageFlip", "slideUp", "fade"],
  hands_using_product: ["pageFlip", "whipPan", "fade"],
  product_showcase:    ["zoomBlur", "flash", "maskCircle"],
  ui_demo:             ["slideUp", "fade", "slideLeft"],
  cta:                 ["flash", "zoomBlur"],
  feature_highlight:   ["flash", "maskCircle", "zoomBlur"],
};

// ---------------------------------------------------------------------------
// Motion briefs — appended to the image prompt so the still is composed for
// the chosen motion. Without this, a "pageFlip" motion over a portrait of a
// person just looks wrong.
// ---------------------------------------------------------------------------

const MOTION_BRIEF: Record<MotionStyle, string> = {
  zoomIn:       "Framed head-on with breathing room, symmetrical composition; suits a slow push in.",
  zoomOut:      "Wide framing with the subject centered; suits a slow pull out revealing environment.",
  pushIn:       "Camera pushes in — subject dead center, sharp focus, mild depth of field.",
  panLeft:      "Composition with subject on the right third; empty space on the left for the pan.",
  panRight:     "Composition with subject on the left third; empty space on the right for the pan.",
  tiltUp:       "Vertical composition rising from foreground detail to subject.",
  tiltDown:     "Top-down or high angle, camera tilting to reveal — flat lay works perfectly.",

  orbit:        "3/4 hero angle of the product, isolated on a clean stage, ready for an orbit sweep. Studio softbox lighting, shallow depth of field.",
  dollyLeft:    "Wide cinematic frame, subject centered, layered foreground/background for a horizontal tracking dolly LEFT.",
  dollyRight:   "Wide cinematic frame, subject centered, layered foreground/background for a horizontal tracking dolly RIGHT.",
  craneUp:      "Low-angle establishing shot with sky/ceiling visible above — camera cranes UP.",
  craneDown:    "Overhead angle looking down on a flat lay or scene — camera cranes DOWN into it.",
  macroPush:    "Extreme macro close-up: paper texture, product edge detail, ink, thread, glitter. Studio lighting, razor-thin depth of field.",
  parallax:     "Layered composition (clear foreground / midground / background) with the hero on the midground for a parallax drift.",
  floating:     "Hero product isolated on a soft gradient stage, gentle drop shadow, weightless levitating feel.",
  productSpin:  "Product photographed dead-center on a rotating plinth, studio softbox, subtle turntable reflection.",
  kineticText:  "Bold headline typography composited into the frame; hero object supports the words, not fights them.",
  pageFlip:     "Top-down flat lay of a printable / worksheet / PDF page with a hand mid-flip revealing the next page. Warm daylight, wooden desk.",
  handInteract: "Close-up over-the-shoulder of hands using the product — writing, tracing, coloring, tapping, flipping. Natural window light.",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type MotionPlan = {
  sceneType: SceneType;
  motion: MotionStyle;
  transition: TransitionStyle;
  /** Short guidance text to append to the image prompt so the still is composed
   *  for this motion. */
  motionBrief: string;
};

export type PlanBeatMotionInput = {
  beatText: string;
  imagePrompt: string;
  intent: ContentIntent | null;
  /** Global beat index — used to rotate through the pool so consecutive
   *  beats never repeat the same motion or transition. */
  index: number;
  /** True for the first beat of a scene — that beat gets a scene transition;
   *  subsequent beats within the same scene use softer intra-scene cuts. */
  isFirstOfScene: boolean;
};

/** The single entry point the pipeline calls per beat. */
export function planBeatMotion(input: PlanBeatMotionInput): MotionPlan {
  const sceneType = classifyScene(input.beatText, input.imagePrompt, input.intent);

  // Pool selection: intent override wins over the scene-type default.
  const override = input.intent ? INTENT_MOTION_OVERRIDE[input.intent]?.[sceneType] : undefined;
  const pool = override ?? MOTION_POOL[sceneType] ?? MOTION_POOL.explainer;
  const motion = pool[input.index % pool.length];

  // Transition: only "hard" transitions on the FIRST beat of a scene, softer
  // ones (fade / whip) inside a scene.
  const transPool = input.isFirstOfScene
    ? (TRANSITION_BY_SCENE[sceneType] ?? TRANSITION_POOL)
    : ["fade", "whipPan"] as TransitionStyle[];
  const transition = transPool[input.index % transPool.length];

  return {
    sceneType,
    motion,
    transition,
    motionBrief: MOTION_BRIEF[motion] ?? "",
  };
}
