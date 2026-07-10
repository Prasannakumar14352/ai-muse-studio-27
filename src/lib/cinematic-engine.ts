// Cinematic Prompt Engine — universal, topic-aware inference layer that
// transforms a raw beat + scene context into rich Netflix-doc / Apple-commercial
// grade cinematic direction. Pure functions, no side effects, no LLM calls.
//
// Used by `visual-director.ts` to enrich prompts so the platform never emits
// generic descriptions like "person walking in forest" or "office".

export type TopicBucket =
  | "documentary" | "ai" | "business" | "finance" | "motivation" | "history"
  | "parenting" | "kids" | "education" | "product_promo" | "digital_product"
  | "technology" | "space" | "future" | "science" | "nature" | "lifestyle"
  | "marketing" | "news" | "travel" | "generic";

export function classifyTopic(input: string): TopicBucket {
  const s = (input || "").toLowerCase();
  const has = (...w: string[]) => w.some((k) => s.includes(k));
  if (has("ai ", "artificial intelligence", "chatgpt", "llm", "neural", "agent", "machine learning")) return "ai";
  if (has("kids", "children", "toddler", "preschool")) return "kids";
  if (has("parent", "mom", "dad", "family")) return "parenting";
  if (has("learn", "student", "school", "class", "lesson", "education", "teach")) return "education";
  if (has("space", "cosmos", "galaxy", "planet", "nasa", "astronaut", "universe")) return "space";
  if (has("future", "2050", "2100", "sci-fi", "sci fi")) return "future";
  if (has("science", "research", "biology", "physics", "chemistry", "lab", "experiment")) return "science";
  if (has("history", "century", "ancient", "world war", "empire", "medieval", "roman")) return "history";
  if (has("money", "finance", "invest", "stock", "wealth", "economy", "trading", "wall street")) return "finance";
  if (has("business", "startup", "founder", "ceo", "company", "corporate")) return "business";
  if (has("motivat", "mindset", "success", "grit", "discipline")) return "motivation";
  if (has("product", "launch", "sale", "shop", "brand deal")) return "product_promo";
  if (has("ebook", "course", "digital download", "template", "notion", "printable")) return "digital_product";
  if (has("tech", "gadget", "device", "iphone", "hardware", "software")) return "technology";
  if (has("nature", "forest", "wildlife", "ocean", "mountain", "river", "jungle")) return "nature";
  if (has("travel", "city", "country", "destination", "trip")) return "travel";
  if (has("market", "ads", "advert", "growth")) return "marketing";
  if (has("news", "breaking", "report")) return "news";
  if (has("lifestyle", "wellness", "routine", "morning", "aesthetic")) return "lifestyle";
  if (has("documentary", "true story", "case study")) return "documentary";
  return "generic";
}

export type CameraKit = { camera: string; lens: string; aperture: string };

// Rotating agency-tier camera bodies so consecutive scenes don't repeat gear.
const CAMERA_ROTATION: CameraKit[] = [
  { camera: "ARRI Alexa Mini LF", lens: "50mm anamorphic Master Prime", aperture: "T1.9" },
  { camera: "Sony A7R V", lens: "50mm f/1.2 GM prime", aperture: "f/1.4" },
  { camera: "RED V-Raptor 8K VV", lens: "35mm Signature Prime", aperture: "T1.8" },
  { camera: "Sony FX6", lens: "24-70mm f/2.8 GM II", aperture: "f/2.8" },
  { camera: "Canon EOS R5C", lens: "85mm f/1.2 RF", aperture: "f/1.4" },
  { camera: "Phase One IQ4 150MP", lens: "80mm Blue Ring", aperture: "f/4" },
  { camera: "Hasselblad X2D 100C", lens: "90mm XCD V", aperture: "f/2.5" },
  { camera: "ARRI Alexa 35", lens: "40mm Cooke S7/i", aperture: "T2" },
];

export function pickCameraKit(beatIndex: number, styleHint?: string): CameraKit {
  const s = (styleHint || "").toLowerCase();
  if (s.includes("luxury")) return { camera: "Phase One IQ4 150MP", lens: "80mm Blue Ring", aperture: "f/4" };
  if (s.includes("cyberpunk")) return { camera: "ARRI Alexa Mini LF", lens: "35mm anamorphic", aperture: "T1.9" };
  return CAMERA_ROTATION[beatIndex % CAMERA_ROTATION.length];
}

// Emotion inference from narration verbs / sentiment cues.
export type Emotion =
  | "hope" | "curiosity" | "fear" | "wonder" | "isolation" | "achievement"
  | "peace" | "suspense" | "excitement" | "joy" | "focus" | "reflection";

export function inferEmotion(beatText: string, fallback?: string | null): Emotion {
  const s = beatText.toLowerCase();
  if (fallback) {
    const f = fallback.toLowerCase() as Emotion;
    if (["hope","curiosity","fear","wonder","isolation","achievement","peace","suspense","excitement","joy","focus","reflection"].includes(f)) return f;
  }
  if (/afraid|threat|danger|risk|collapse|crisis/.test(s)) return "fear";
  if (/alone|isolat|silent|empty|abandoned/.test(s)) return "isolation";
  if (/wonder|discover|reveal|amaz|breathtak/.test(s)) return "wonder";
  if (/win|achiev|breakthrough|record|top of/.test(s)) return "achievement";
  if (/calm|peace|quiet|still|serene/.test(s)) return "peace";
  if (/wait|about to|edge|tension|reveal/.test(s)) return "suspense";
  if (/fast|rush|explode|surge|launch/.test(s)) return "excitement";
  if (/joy|laugh|celebrate|smile|delight/.test(s)) return "joy";
  if (/focus|concentrate|precise|craft/.test(s)) return "focus";
  if (/think|wonder|ponder|question/.test(s)) return "reflection";
  if (/hope|dream|future|rise/.test(s)) return "hope";
  return "curiosity";
}

// Topic → default palette suggestions (Hollywood grade names, not brand tokens).
export function palettesForTopic(topic: TopicBucket): string[] {
  switch (topic) {
    case "ai":
    case "technology":
    case "future": return ["cool cyan and midnight blue with warm skin tones", "silver, glass, and holographic teal", "black and neon magenta with cyan rim"];
    case "space": return ["deep obsidian black with warm ember highlights", "cosmic indigo and star-white", "orange planetary glow against void black"];
    case "finance":
    case "business": return ["navy and gold with soft ivory", "graphite grey with copper accents", "editorial black and cream"];
    case "motivation": return ["golden sunrise amber over deep teal", "warm cinematic orange and steel blue", "high-contrast black with sunset gold"];
    case "history": return ["muted sepia and candlelight amber", "aged parchment cream with charcoal", "moody oil-painting umber"];
    case "kids":
    case "parenting": return ["warm sunlit yellows and soft pastels", "creamy peach with mint accents", "storybook golden hour"];
    case "education": return ["chalk white and ink navy with warm oak", "editorial cream with forest green"];
    case "nature": return ["deep forest greens and misty grey-blue", "warm earth ochre and moss", "sunrise gold on wet leaves"];
    case "science": return ["clinical white with saturated single-color accent", "cool lab blue with warm skin tones"];
    case "product_promo":
    case "digital_product":
    case "marketing": return ["clean off-white with a single brand accent", "moody charcoal with product-lit halo", "warm gradient studio backdrop"];
    case "documentary":
    case "news": return ["muted earthy documentary palette", "natural desaturated tones with a single warm rim"];
    case "travel":
    case "lifestyle": return ["golden hour warm oranges over cool shadow", "editorial pastel with morning haze"];
    default: return ["cinematic teal and orange", "muted natural tones with a single warm accent"];
  }
}

export function pickPalette(topic: TopicBucket, beatIndex: number): string {
  const list = palettesForTopic(topic);
  return list[beatIndex % list.length];
}

// Topic → rich environment expansion. Never returns single-word locations.
export function enrichEnvironment(raw: string | undefined, topic: TopicBucket, timeOfDay: string): string {
  const base = (raw || "").trim();
  if (base.length > 30) return base; // caller already gave us a rich description
  const detail = (() => {
    switch (topic) {
      case "ai": return `sleek research lab bathed in cool monitor glow, holographic UI panels floating over glass desks, ${timeOfDay} light bleeding through floor-to-ceiling windows`;
      case "technology": return `modern minimalist workspace with brushed-aluminium surfaces and warm practical lights, faint device LEDs, ${timeOfDay} ambient wash`;
      case "business": return `top-floor corner office overlooking a rainy metropolitan skyline, glass walls reflecting ${timeOfDay} city light, subtle rain streaks on windows`;
      case "finance": return `hushed penthouse trading floor with dark walnut and brass, multi-monitor glow, ${timeOfDay} skyline through tall windows`;
      case "motivation": return `empty urban rooftop at ${timeOfDay}, city grid stretching to horizon, low wind moving loose fabric`;
      case "history": return `candle-lit chamber with weathered stone walls, dust motes drifting through window shafts, ${timeOfDay} amber slanting across parchment`;
      case "kids": return `sunlit playroom with warm wooden toys and hand-painted walls, soft ${timeOfDay} light dappling the floor, no logos, no branded packaging`;
      case "parenting": return `warm family kitchen with morning light through sheer curtains, ${timeOfDay} tones, small lived-in details on the counter`;
      case "education": return `bright modern classroom with oak desks and green plants, chalk dust in a shaft of ${timeOfDay} light`;
      case "product_promo": return `minimalist studio set with sculpted gradient backdrop, controlled softbox key, single sharp shadow, ${timeOfDay} inspired accent`;
      case "digital_product": return `clean matte desk with a single opened laptop, warm practical lamp, ${timeOfDay} light through blinds, notebook and coffee out of focus`;
      case "space": return `orbital viewport onto a curved planetary horizon, thin atmosphere glow, cabin interior lit by soft instrument panels`;
      case "future": return `near-future city plaza with holographic wayfinding, gentle mist and chrome architecture at ${timeOfDay}`;
      case "science": return `research laboratory with clean epoxy floors, gleaming stainless steel and a single glowing reactive element, ${timeOfDay} through frosted glass`;
      case "nature": return `dense pine forest with drifting ${timeOfDay} mist, golden light filtering through towering trunks, moss-covered rocks in foreground`;
      case "travel": return `narrow cobblestone street of an old European quarter, glowing lanterns and reflections on wet stone, ${timeOfDay} sky`;
      case "lifestyle": return `sunlit minimalist apartment with linen curtains, ceramic mug on wooden counter, ${timeOfDay} light across a plant`;
      case "marketing": return `editorial studio set with a warm gradient wall, single practical, ${timeOfDay} inspired rim light`;
      case "news":
      case "documentary": return `real-world environment captured verité-style, natural imperfect surfaces, ${timeOfDay} available light`;
      default: return `richly detailed real-world setting with layered foreground and background elements, ${timeOfDay} light shaping the scene`;
    }
  })();
  return base ? `${detail} — ${base}` : detail;
}

// Topic-aware environmental storytelling props (small details that sell realism).
export function storyDetailsFor(topic: TopicBucket, beatIndex: number): string {
  const pools: Record<TopicBucket, string[]> = {
    ai: ["glowing code reflected on glasses", "server rack blinking in background", "handwritten notes beside a laptop", "steam rising from a coffee mug"],
    technology: ["cable neatly coiled on desk", "smartphone face-down beside notebook", "faint LED indicators in background", "dust particles in a light shaft"],
    business: ["condensation on a glass of water", "leather notebook slightly open", "distant blurred meeting through glass", "coffee ring on a document"],
    finance: ["fountain pen on a signed page", "muted stock ticker glow on the wall", "espresso cup on a marble desk"],
    motivation: ["wind moving loose fabric", "beads of sweat catching rim light", "worn training shoes in foreground"],
    history: ["candle wax pooled on a wooden table", "dust drifting through a window shaft", "aged leather-bound book slightly open"],
    kids: ["hand-drawn crayon art on the floor", "wooden blocks half stacked", "small footprints in flour", "sunlight catching soap bubbles"],
    parenting: ["a child's mug beside a parent's coffee", "folded laundry on a sunlit bench", "family photo slightly in focus"],
    education: ["chalk dust drifting in sunlight", "open notebook with neat handwriting", "colored markers on a desk"],
    product_promo: ["single sharp product shadow", "reflection catching the product edge", "subtle dust particles in beam"],
    digital_product: ["cursor gently blinking on a clean UI", "notebook with a sketched wireframe", "warm cup of tea steaming"],
    space: ["reflection of instruments in a visor", "microgravity dust particles drifting", "planet glow reflected on metal"],
    future: ["holographic UI panels flickering", "rain sliding down chrome", "AR overlays hovering over hands"],
    science: ["liquid slowly swirling in glass", "instrument LED reflecting on glasses", "steam rising from a beaker"],
    nature: ["dew on leaves catching rim light", "insect drifting through sunbeam", "wind moving tall grass"],
    lifestyle: ["steam curling from a ceramic mug", "linen curtain gently moving", "book open on a sunlit bench"],
    marketing: ["gradient light spilling on a product edge", "single practical flare across lens"],
    travel: ["puddle reflecting neon signage", "steam rising from street food", "map corner fluttering in breeze"],
    news: ["notepad and pen mid-write", "microphone slightly in frame", "crowd reflected in glass"],
    documentary: ["worn hands turning a page", "sunlight through a doorway", "a single tear catching light"],
    generic: ["dust drifting through a light shaft", "steam rising softly", "wind gently moving fabric"],
  };
  const list = pools[topic] ?? pools.generic;
  return list[beatIndex % list.length];
}

export type MoodCues = { timeOfDay: string; weather: string; energy: "low" | "medium" | "high" };

export function inferMood(beatText: string): MoodCues {
  const s = beatText.toLowerCase();
  const timeOfDay =
    /night|midnight|dark/.test(s) ? "deep night with practical lights" :
    /dawn|sunrise|early morning/.test(s) ? "soft sunrise, low sun" :
    /morning/.test(s) ? "clean morning light" :
    /dusk|sunset|evening/.test(s) ? "warm golden hour" :
    /noon|midday/.test(s) ? "high noon key light" :
    "diffused overcast daylight";
  const weather =
    /rain|storm|wet/.test(s) ? "light rain with wet reflective surfaces" :
    /snow|winter|frozen/.test(s) ? "soft snowfall, breath visible" :
    /fog|mist|haze/.test(s) ? "volumetric atmospheric haze" :
    "clean atmosphere with subtle dust particles in light";
  const energy =
    /explode|rush|surge|launch|attack|race|shock/.test(s) ? "high" :
    /calm|peace|slow|still|silent|quiet/.test(s) ? "low" : "medium";
  return { timeOfDay, weather, energy: energy as MoodCues["energy"] };
}

// Cinematic lighting recipe — chosen from topic + mood, not a fixed default.
export function lightingRecipe(topic: TopicBucket, mood: MoodCues, emotion: Emotion): string {
  if (emotion === "fear" || emotion === "isolation" || emotion === "suspense")
    return "low-key chiaroscuro, single hard rim light, deep negative fill, subtle atmospheric haze";
  if (emotion === "hope" || emotion === "joy" || emotion === "achievement")
    return "warm golden key with soft bounce fill, gentle lens flare, elevated exposure on skin tones";
  if (topic === "product_promo" || topic === "digital_product" || topic === "marketing")
    return "controlled softbox key with hair rim, gentle gradient backdrop, single crisp shadow";
  if (topic === "space" || topic === "future" || topic === "ai")
    return "cool motivated key from screens or practicals, warm skin fill, subtle volumetric beams";
  if (mood.timeOfDay.includes("golden"))
    return "golden hour cross-light, warm rim, soft ambient bounce";
  return "naturalistic key with soft fill, gentle rim separation, motivated practicals";
}

// Small self-review heuristic. Returns issues that must be repaired.
export function reviewPromptQuality(prompt: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 10;
  const generic = ["person walking in forest", "woman smiling", "office", "kids playing", "man in office"];
  for (const g of generic) if (prompt.toLowerCase().includes(g)) { issues.push(`generic phrase: "${g}"`); score -= 3; }
  if (!/[0-9]{2}mm/.test(prompt)) { issues.push("no lens focal length"); score -= 1; }
  if (!/f\/|T[12]/.test(prompt)) { issues.push("no aperture"); score -= 1; }
  if (!/light|lit|golden hour|rim|softbox|volumetric/i.test(prompt)) { issues.push("no lighting direction"); score -= 2; }
  if (!/palette|grade|tones|cyan|amber|teal|orange|gold|ivory|charcoal/i.test(prompt)) { issues.push("no color grade"); score -= 1; }
  if (prompt.length < 350) { issues.push("prompt too short — lacks cinematic detail"); score -= 2; }
  return { score: Math.max(0, score), issues };
}
