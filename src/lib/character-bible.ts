// Character Consistency Engine — the "casting director + costume designer +
// continuity supervisor" for every AI Studio project.
//
// Solves the "different face / hair / outfit every scene" problem by
// producing an IMMUTABLE Character Bible up front and locking every
// downstream image prompt to it. Also owns environment variety so we don't
// generate "forest, forest, forest" across a project.
//
// Pure functions, no side effects, no LLM calls. A server-side helper can
// upgrade the bible with AI-authored specifics; the deterministic default
// is always sufficient to enforce identity + wardrobe lock.

import { classifyTopic, type TopicBucket } from "./cinematic-engine";
import type { ContinuityCard } from "./visual-director";

export type CharacterBibleField = {
  id: string;                // e.g. "hero_001"
  role: string;              // "protagonist", "mentor", "child", "narrator"
  age: string;
  gender: string;
  ethnicity: string;
  skinTone: string;
  faceShape: string;
  jawline: string;
  eyeColor: string;
  eyebrows: string;
  nose: string;
  lips: string;
  hairColor: string;
  hairStyle: string;
  hairLength: string;
  facialHair: string;
  height: string;
  bodyType: string;
  bodyProportions: string;
  posture: string;
  walkingStyle: string;
  clothing: string;
  shoes: string;
  accessories: string;
  watch: string;
  glasses: string;
  bag: string;
  hat: string;
  jewelry: string;
  emotionProfile: string;
  defaultExpressions: string;
  defaultPose: string;
  visualStyle: string;
  colorPalette: string;
  lightingPreference: string;
};

export type CharacterBible = {
  primary: CharacterBibleField;
  supporting: CharacterBibleField[];
  /** Free-text portrait prompt — used to generate the Master Character Image. */
  masterPortraitPrompt: string;
  /** Optional data-URL / object URL for the generated Master Character Image. */
  masterReferenceUrl?: string | null;
};

// ---------- Deterministic default (topic-aware, richly specified) ----------

const AGE_BY_TOPIC: Partial<Record<TopicBucket, string>> = {
  kids: "8 years old",
  parenting: "mother, mid-30s",
  education: "early 30s",
  history: "late 30s",
  business: "mid-30s",
  finance: "late 30s",
  ai: "early 30s",
  future: "early 30s",
  technology: "early 30s",
  motivation: "early 30s",
  space: "mid-30s",
  science: "mid-30s",
  nature: "mid-30s",
  travel: "late 20s",
  lifestyle: "late 20s",
  product_promo: "early 30s",
  digital_product: "early 30s",
  documentary: "mid-40s",
  marketing: "early 30s",
  news: "late 30s",
  generic: "early 30s",
};

const WARDROBE_BY_TOPIC: Partial<Record<TopicBucket, string>> = {
  business: "tailored charcoal wool blazer over a crisp white oxford shirt, slim dark navy trousers, brown leather belt",
  finance: "navy pinstripe suit, white shirt, burgundy silk tie, polished oxford shoes",
  ai: "matte-black merino turtleneck, dark grey technical trousers, minimal silver-frame glasses",
  future: "matte-black technical zip-up jacket, charcoal trousers, minimal chrome accents",
  technology: "heather-grey crewneck, dark denim, clean white sneakers",
  motivation: "fitted black henley, dark grey joggers, minimalist training shoes",
  documentary: "worn olive field jacket, faded indigo shirt, stone chinos, weathered brown leather boots",
  history: "period-appropriate wool overcoat, high-collar linen shirt, dark trousers, leather satchel",
  kids: "mustard-yellow hoodie with tiny embroidered rocket, dark blue jeans, white sneakers with red laces",
  parenting: "cream cable-knit sweater, high-rise blue jeans, tan loafers, small gold hoop earrings",
  education: "warm caramel corduroy blazer over a soft cream tee, brown chinos, tortoiseshell glasses",
  space: "clean white space-agency polo, navy technical trousers, mission-patch shoulder",
  science: "white lab coat over a soft blue oxford shirt, dark trousers, silver wristwatch",
  nature: "olive utility shirt, quick-dry beige trousers, tan hiking boots, weathered brown leather field belt",
  travel: "faded denim jacket over a plain white tee, sand-colored chinos, canvas sneakers",
  lifestyle: "oatmeal linen shirt, wide-leg cream trousers, minimal leather sandals",
  product_promo: "clean white crewneck, soft grey overshirt, dark denim, minimal white sneakers",
  digital_product: "soft heather-grey hoodie, black joggers, minimalist white sneakers",
  marketing: "navy blazer, white tee, dark denim, clean white sneakers",
  news: "charcoal suit jacket, crisp white shirt, subtle silver tie",
  generic: "neutral navy jacket over a plain grey tee, dark denim, clean white sneakers",
};

function baseFieldFor(topic: TopicBucket, id: string, role: string): CharacterBibleField {
  const wardrobe = WARDROBE_BY_TOPIC[topic] ?? WARDROBE_BY_TOPIC.generic!;
  const age = AGE_BY_TOPIC[topic] ?? AGE_BY_TOPIC.generic!;
  const isKid = topic === "kids";
  return {
    id, role, age,
    gender: isKid ? "child (non-specific)" : "male",
    ethnicity: "warm mid-tone South-Asian",
    skinTone: "warm caramel with subtle golden undertones",
    faceShape: isKid ? "soft round" : "balanced oval with defined jawline",
    jawline: isKid ? "soft rounded" : "clean, subtly angular",
    eyeColor: "warm dark brown",
    eyebrows: "medium-thick, natural arch",
    nose: "straight, medium bridge",
    lips: "medium fullness, natural rosy tone",
    hairColor: "deep coffee brown",
    hairStyle: isKid ? "short tousled fringe" : "textured short crop, side part",
    hairLength: isKid ? "short" : "short (2-3cm)",
    facialHair: isKid ? "none" : "clean-shaven with subtle 5 o'clock shadow",
    height: isKid ? "125cm" : "178cm",
    bodyType: isKid ? "slim, kid proportions" : "lean athletic build",
    bodyProportions: "balanced, natural human proportions",
    posture: "upright, confident, relaxed shoulders",
    walkingStyle: "even, purposeful stride",
    clothing: wardrobe,
    shoes: wardrobe.includes("boots") ? "matches wardrobe" : wardrobe.includes("loafer") ? "tan leather loafers" : "clean white low-top sneakers",
    accessories: "minimal — no extra items unless the scene requires them",
    watch: topic === "finance" || topic === "business" ? "slim silver dial watch on brown leather strap" : "none",
    glasses: topic === "ai" || topic === "education" ? "thin silver-frame round glasses" : "none",
    bag: "none",
    hat: "none",
    jewelry: "none",
    emotionProfile: "grounded, thoughtful, warm",
    defaultExpressions: "soft focused gaze, subtle closed-mouth smile",
    defaultPose: "shoulders squared to camera, slight three-quarter turn",
    visualStyle: "Netflix documentary realism",
    colorPalette: "warm neutrals with cool accent",
    lightingPreference: "soft directional key with gentle rim",
  };
}

/**
 * Build a rich deterministic Character Bible from title + optional research
 * signals. Safe to call synchronously in the client; no LLM required.
 */
export function defaultCharacterBibleFor(
  title: string,
  extraSignal?: string,
): CharacterBible {
  const topic = classifyTopic(`${title} ${extraSignal ?? ""}`);
  const primary = baseFieldFor(topic, "hero_001", "protagonist");
  const supporting: CharacterBibleField[] = [];
  const masterPortraitPrompt = buildMasterPortraitPrompt(primary);
  return { primary, supporting, masterPortraitPrompt, masterReferenceUrl: null };
}

function buildMasterPortraitPrompt(c: CharacterBibleField): string {
  return [
    "Master character reference portrait — a single hero portrait used as the identity anchor for every subsequent scene.",
    `Subject: ${c.role}, ${c.age}, ${c.ethnicity} ${c.gender === "child (non-specific)" ? "child" : c.gender}.`,
    `Skin: ${c.skinTone}. Face shape: ${c.faceShape}, jawline ${c.jawline}. Eyes: ${c.eyeColor}. Eyebrows: ${c.eyebrows}. Nose: ${c.nose}. Lips: ${c.lips}. Facial hair: ${c.facialHair}.`,
    `Hair: ${c.hairColor}, ${c.hairStyle}, length ${c.hairLength}.`,
    `Build: ${c.height}, ${c.bodyType}, ${c.bodyProportions}. Posture: ${c.posture}.`,
    `Wardrobe (LOCKED): ${c.clothing}. Shoes: ${c.shoes}. Accessories: ${c.accessories}. Watch: ${c.watch}. Glasses: ${c.glasses}. Bag: ${c.bag}. Hat: ${c.hat}. Jewelry: ${c.jewelry}.`,
    `Expression: ${c.defaultExpressions}. Pose: ${c.defaultPose}.`,
    "Framing: waist-up three-quarter portrait, subject centered, plain soft neutral studio backdrop, natural softbox key with subtle rim, sharp focus on eyes, shallow depth of field, ARRI Alexa quality, photorealistic 8K.",
    "This portrait is the IDENTITY ANCHOR. Every downstream scene MUST preserve this exact face, hair, wardrobe, and accessories.",
    "No text, no watermark, no captions, no logos.",
  ].join(" ");
}

// ---------- Prompt composition ----------

/** Long-form locked-character block that gets prepended to every beat prompt. */
export function bibleToCharacterSheetText(bible: CharacterBible): string {
  const c = bible.primary;
  return [
    `LOCKED CHARACTER SHEET — id=${c.id} (${c.role}). This exact person MUST appear identically in EVERY shot. Do not swap face, do not redesign, do not age, do not change ethnicity, do not restyle hair, do not change wardrobe, do not add or remove accessories.`,
    `Physical (immutable): ${c.age}, ${c.ethnicity} ${c.gender}, ${c.skinTone} skin, ${c.faceShape} face with ${c.jawline} jawline, ${c.eyeColor} eyes, ${c.eyebrows} eyebrows, ${c.nose} nose, ${c.lips} lips, ${c.facialHair} facial hair, ${c.hairColor} ${c.hairStyle} (${c.hairLength}), ${c.height}, ${c.bodyType}, ${c.bodyProportions}, ${c.posture}.`,
    `Wardrobe (immutable across scenes unless the script explicitly declares a costume change, time jump, flashback, or before/after): ${c.clothing}. Shoes: ${c.shoes}. Accessories: ${c.accessories}. Watch: ${c.watch}. Glasses: ${c.glasses}. Bag: ${c.bag}. Hat: ${c.hat}. Jewelry: ${c.jewelry}.`,
    `Behavior anchors: emotion profile ${c.emotionProfile}; default expression ${c.defaultExpressions}; default pose ${c.defaultPose}.`,
  ].join(" ");
}

/** Bridge to the existing ContinuityCard consumed by `directBeatPrompt`. */
export function bibleToContinuityCard(bible: CharacterBible): ContinuityCard {
  const sheet = bibleToCharacterSheetText(bible);
  return {
    subjectAnchor: `${bible.primary.role} (${bible.primary.id})`,
    characterSheet: sheet,
    wardrobeAnchor: `identical wardrobe (${bible.primary.clothing}), identical shoes (${bible.primary.shoes}), identical hairstyle (${bible.primary.hairStyle}), identical face across every shot`,
    locationAnchor: "consistent art direction, props, and set design across every shot in the project",
  };
}

// ---------- Environment variety ----------

const ENV_POOL: Partial<Record<TopicBucket, string[]>> = {
  business: [
    "top-floor corner office overlooking a rain-slicked metropolitan skyline at dusk",
    "minimalist glass conference room with warm morning sun and floating dust motes",
    "modern loft coworking space with exposed brick and pendant Edison bulbs",
    "airport departure lounge at golden hour with soft window light",
    "boutique hotel lobby with marble floors and warm sconce lighting",
    "quiet rooftop terrace above a busy city at blue hour",
  ],
  finance: [
    "trading floor at 4:00pm with rows of glowing displays",
    "wood-paneled private banking office with green banker's lamp",
    "glass skyscraper elevator lobby with polished brass detailing",
    "quiet corner of an upscale coffee shop with a newspaper and espresso",
    "penthouse study lined with financial reports and a leather chesterfield",
  ],
  ai: [
    "server room aisle bathed in cool cyan uplight, subtle rack blink LEDs",
    "modern research lab with matte-black desks and floating holographic UI",
    "dim home office at 2am, a single monitor casting cool light on the subject",
    "prototype workshop with soldering stations, oscilloscopes, and warm task lights",
    "glass-walled AI startup office at dawn, city skyline behind",
  ],
  kids: [
    "sunlit children's bedroom with a rocket-print quilt and star decals",
    "school library corner with picture books and soft afternoon light",
    "backyard treehouse with dappled leaf shadows and rope ladder",
    "kitchen table with crayons, paper, and a half-eaten sandwich",
    "science-museum dinosaur hall with warm exhibit lighting",
    "rainy-window living room with a fort of pillows and fairy lights",
  ],
  education: [
    "sunlit university classroom with chalkboard equations and worn wooden desks",
    "small campus courtyard at golden hour with autumn leaves",
    "warm study nook with stacked books and a green desk lamp",
    "lecture hall in the last row, sunlight streaming through tall windows",
    "outdoor library steps in early morning with steaming coffee",
  ],
  space: [
    "vast NASA-style mission control at night, banks of glowing screens",
    "clean-room integration bay with a partial satellite under bright key lights",
    "observatory dome at 3am with the milky way overhead",
    "astronaut training pool underwater with god rays and drifting bubbles",
    "quiet suburban backyard with a small telescope and a starlit sky",
  ],
  nature: [
    "dense pine forest with drifting golden-hour mist and moss-covered rocks",
    "coastal cliff at sunrise with crashing waves below",
    "alpine ridge with a lone tree and a wide granite sky",
    "riverbank at blue hour with fireflies and glassy water",
    "high-desert canyon with red rock walls glowing at sunset",
    "boreal lakeshore at dawn with steam rising off the water",
  ],
  history: [
    "candlelit study lined with parchment scrolls and leather-bound tomes",
    "cobblestone alley in a fog-shrouded old European city at dusk",
    "stone-walled monastery cloister with slanted afternoon light",
    "ancient library with towering shelves and dust in slanted sunbeams",
    "seaside dock at dawn with wooden fishing boats and rope",
  ],
  motivation: [
    "empty gym at 5am with a single overhead spotlight and chalk in the air",
    "misty mountain trail at sunrise with the subject cresting the ridge",
    "boxing ring at dusk with warm overhead lamps",
    "empty stadium seats at dawn with the subject alone in the aisle",
    "long empty highway at sunrise with warm horizon glow",
  ],
  documentary: [
    "field-research tent at dusk lit by a warm lantern",
    "kitchen table interview with soft window light and a mug of tea",
    "rural roadside at golden hour with wind-blown grass",
    "workshop backroom with tools, notes, and a single hanging bulb",
    "quiet church interior with stained-glass color washing the pews",
  ],
  digital_product: [
    "creator's desk with dual monitors, warm ring light, and neatly stacked notebooks",
    "minimalist Scandinavian workspace with a plant, a Kinsta mug, and morning light",
    "coffee shop window seat with a laptop, latte, and rain outside",
    "clean home studio with acoustic panels and a soft key light",
  ],
  product_promo: [
    "sunlit Scandinavian kitchen countertop with the product hero-lit",
    "matte-white photography studio with a single softbox from camera left",
    "warm bedside table at dawn with the product beside a book and mug",
    "glass office lobby with the product on a dark plinth under a spotlight",
  ],
  travel: [
    "narrow lantern-lit alley in an old-town district at dusk",
    "coastal promenade at golden hour with palms and long shadows",
    "mountain village square at dawn with mist between the buildings",
    "train window seat at sunrise with rolling countryside outside",
    "rooftop bar overlooking a foreign skyline at blue hour",
  ],
  lifestyle: [
    "sunlit apartment kitchen with pour-over coffee and steam",
    "linen-draped bedroom in soft morning light with an open novel",
    "outdoor cafe patio at golden hour with wicker chairs and warm bulbs",
    "leafy balcony garden at sunrise with a watering can and mug",
  ],
  technology: [
    "sleek Apple-store-style flagship interior with mirrored floors",
    "prototype hardware lab with exposed PCBs and warm task lamps",
    "midnight desk with a single monitor and a mechanical keyboard glow",
    "glass startup office at dawn with the city skyline behind",
  ],
  future: [
    "chrome-and-glass city plaza at dusk with drifting neon signage above",
    "sterile white corridor with soft holographic accent lighting",
    "night highway with autonomous vehicles and long light trails",
    "orbital station observation window at earthrise",
  ],
  science: [
    "clean biology lab with warm task lights over a microscope",
    "field-research site at golden hour with instruments on a folding table",
    "particle-physics observation deck with subtle blue LED accents",
    "geology outcrop at sunrise with rock samples in a canvas bag",
  ],
  marketing: [
    "creative agency loft with mood boards and warm pendant lights",
    "coffee shop meeting corner with a notebook and two lattes",
    "modern brand studio with color-graded walls and a hero prop",
    "rooftop pitch meeting at golden hour",
  ],
  news: [
    "broadcast studio with cool key lights and city-skyline backdrop",
    "quiet newsroom bullpen at midnight with monitor glow",
    "rain-slicked press-conference exterior at dusk",
  ],
  generic: [
    "warm minimalist interior with soft window light and layered depth",
    "quiet urban side-street at blue hour with reflective pavement",
    "leafy park path at golden hour with dappled shadows",
    "modern glass office lobby with morning sunlight",
    "cozy kitchen at dawn with steam rising from a mug",
    "rain-slicked rooftop at dusk with distant city glow",
  ],
};

/**
 * Deterministically pick an environment for beat `index` that avoids the last
 * `recent` picks (up to 3). Guarantees variety across a project.
 */
export function pickEnvironmentForBeat(
  topic: TopicBucket,
  index: number,
  recent: string[] = [],
): string {
  const pool = ENV_POOL[topic] ?? ENV_POOL.generic!;
  const avoid = new Set(recent.slice(-3));
  for (let step = 0; step < pool.length; step++) {
    const pick = pool[(index + step) % pool.length];
    if (!avoid.has(pick)) return pick;
  }
  return pool[index % pool.length];
}

/** Convenience: full environment pool for a topic, for callers that want to
 * manage their own rotation. */
export function environmentPoolFor(topic: TopicBucket): string[] {
  return (ENV_POOL[topic] ?? ENV_POOL.generic!).slice();
}
