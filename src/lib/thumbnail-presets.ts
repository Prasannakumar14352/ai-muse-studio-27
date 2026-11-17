// Extended presets & enums for the pro Thumbnail Studio wizard.
// Kept as string literal unions so they serialize cleanly to server fns.

export type PlatformId =
  | "youtube" | "youtube_shorts" | "instagram" | "facebook"
  | "linkedin" | "pinterest" | "tiktok" | "x";

export const PLATFORMS: { id: PlatformId; label: string; defaultRatio: AspectRatioId }[] = [
  { id: "youtube",        label: "YouTube",         defaultRatio: "16:9" },
  { id: "youtube_shorts", label: "YouTube Shorts",  defaultRatio: "9:16" },
  { id: "instagram",      label: "Instagram",       defaultRatio: "4:5"  },
  { id: "facebook",       label: "Facebook",        defaultRatio: "16:9" },
  { id: "linkedin",       label: "LinkedIn",        defaultRatio: "16:9" },
  { id: "pinterest",      label: "Pinterest",       defaultRatio: "2:3"  },
  { id: "tiktok",         label: "TikTok",          defaultRatio: "9:16" },
  { id: "x",              label: "X (Twitter)",     defaultRatio: "16:9" },
];

export type AspectRatioId = "16:9" | "9:16" | "4:5" | "1:1" | "3:4" | "2:3" | "custom";

export const ASPECT_RATIOS: { id: AspectRatioId; label: string; w: number; h: number }[] = [
  { id: "16:9",   label: "16:9 (YouTube)",   w: 1536, h: 1024 },
  { id: "9:16",   label: "9:16 (Shorts)",    w: 1024, h: 1536 },
  { id: "4:5",    label: "4:5 (Instagram)",  w: 1024, h: 1280 },
  { id: "1:1",    label: "1:1",              w: 1024, h: 1024 },
  { id: "3:4",    label: "3:4",              w: 1024, h: 1365 },
  { id: "2:3",    label: "2:3 (Pinterest)",  w: 1024, h: 1536 },
  { id: "custom", label: "Custom",           w: 1024, h: 1024 },
];

export type ExtendedStyleId =
  | "mrbeast" | "magnates" | "james_jani" | "documentary" | "netflix"
  | "future_civ" | "minimal" | "cinematic" | "dark_mystery"
  | "tech" | "business" | "educational" | "kids" | "gaming"
  | "finance" | "real_estate" | "luxury" | "podcast" | "travel"
  | "cooking" | "fitness";

export const EXTENDED_STYLES: { id: ExtendedStyleId; label: string; hint: string }[] = [
  { id: "mrbeast",       label: "MrBeast",            hint: "hyper-saturated, giant subject, shock face" },
  { id: "magnates",      label: "MagnatesMedia",      hint: "gold+black cinematic, giant scale, awe" },
  { id: "james_jani",    label: "James Jani",         hint: "editorial documentary, blue accents" },
  { id: "documentary",   label: "Documentary",        hint: "National Geographic / BBC" },
  { id: "netflix",       label: "Netflix",            hint: "streaming key art, prestige drama" },
  { id: "future_civ",    label: "Future Civilization",hint: "cyberpunk neon, sci-fi awe" },
  { id: "minimal",       label: "Minimal",            hint: "clean, single object, negative space" },
  { id: "cinematic",     label: "Cinematic",          hint: "teal-orange split, feature-film still" },
  { id: "dark_mystery",  label: "Dark Mystery",       hint: "noir chiaroscuro, red rim" },
  { id: "tech",          label: "Tech",               hint: "sleek blue product on dark, holographic UI" },
  { id: "business",      label: "Business",           hint: "corporate polish, navy + gold, sharp suit" },
  { id: "educational",   label: "Educational",        hint: "friendly bright, chalkboard, icons" },
  { id: "kids",          label: "Kids",               hint: "bright primaries, cartoon energy, big smiles" },
  { id: "gaming",        label: "Gaming",             hint: "neon RGB, high-energy, glowing weapons/UI" },
  { id: "finance",       label: "Finance",            hint: "green candlesticks, gold coins, wealth cues" },
  { id: "real_estate",   label: "Real Estate",        hint: "luxury home wide shot, golden hour, aspirational" },
  { id: "luxury",        label: "Luxury",             hint: "black + gold, Rolls Royce polish, premium" },
  { id: "podcast",       label: "Podcast",            hint: "warm studio, microphone, guest portrait" },
  { id: "travel",        label: "Travel",             hint: "epic wide landscape, golden hour, tiny human for scale" },
  { id: "cooking",       label: "Cooking",            hint: "top-down food styling, steam, warm kitchen" },
  { id: "fitness",       label: "Fitness",            hint: "dramatic gym lighting, sweat, muscle definition" },
];

export type TextOverlayMode = "auto" | "custom" | "none";

export type SubjectId =
  | "man" | "woman" | "child" | "ai_robot" | "product" | "building"
  | "animal" | "vehicle" | "logo" | "upload" | "custom";

export const SUBJECTS: { id: SubjectId; label: string; prompt: string }[] = [
  { id: "man",       label: "Man",           prompt: "confident adult man" },
  { id: "woman",     label: "Woman",         prompt: "confident adult woman" },
  { id: "child",     label: "Child",         prompt: "expressive child" },
  { id: "ai_robot",  label: "AI Robot",      prompt: "sleek humanoid AI robot with glowing eyes" },
  { id: "product",   label: "Product",       prompt: "hero product on stage" },
  { id: "building",  label: "Building",      prompt: "iconic building at giant scale" },
  { id: "animal",    label: "Animal",        prompt: "expressive animal hero" },
  { id: "vehicle",   label: "Vehicle",       prompt: "cinematic vehicle, low angle" },
  { id: "logo",      label: "Logo",          prompt: "clean logomark" },
  { id: "upload",    label: "Uploaded Image",prompt: "user-provided subject" },
  { id: "custom",    label: "Custom",        prompt: "" },
];

export type ExpressionId =
  | "happy" | "shocked" | "excited" | "thinking" | "fear"
  | "angry" | "confident" | "confused" | "none";
export const EXPRESSIONS: { id: ExpressionId; label: string }[] = [
  { id: "happy",     label: "Happy" },
  { id: "shocked",   label: "Shocked" },
  { id: "excited",   label: "Excited" },
  { id: "thinking",  label: "Thinking" },
  { id: "fear",      label: "Fear" },
  { id: "angry",     label: "Angry" },
  { id: "confident", label: "Confident" },
  { id: "confused",  label: "Confused" },
  { id: "none",      label: "No Face" },
];

export type BackgroundId =
  | "realistic" | "studio" | "office" | "city" | "nature" | "cyberpunk"
  | "luxury" | "space" | "minimal" | "abstract" | "classroom" | "dark";
export const BACKGROUNDS: { id: BackgroundId; label: string; prompt: string }[] = [
  { id: "realistic", label: "Realistic", prompt: "photorealistic real-world scene" },
  { id: "studio",    label: "Studio",    prompt: "seamless studio backdrop, softbox lighting" },
  { id: "office",    label: "Office",    prompt: "modern glass office interior, blurred" },
  { id: "city",      label: "City",      prompt: "cinematic city skyline at dusk" },
  { id: "nature",    label: "Nature",    prompt: "epic natural landscape, dramatic sky" },
  { id: "cyberpunk", label: "Cyberpunk", prompt: "neon cyberpunk alley, rain, holograms" },
  { id: "luxury",    label: "Luxury",    prompt: "opulent black + gold interior" },
  { id: "space",     label: "Space",     prompt: "deep space, nebula, planets" },
  { id: "minimal",   label: "Minimal",   prompt: "clean neutral backdrop, negative space" },
  { id: "abstract",  label: "Abstract",  prompt: "abstract shapes and gradients" },
  { id: "classroom", label: "Classroom", prompt: "modern classroom, warm natural light" },
  { id: "dark",      label: "Dark",      prompt: "moody near-black background, single rim light" },
];

export type LightingId =
  | "golden_hour" | "studio" | "neon" | "moody" | "soft"
  | "high_contrast" | "sunset" | "blue";
export const LIGHTINGS: { id: LightingId; label: string; prompt: string }[] = [
  { id: "golden_hour",  label: "Golden Hour",  prompt: "warm golden-hour sunlight, long shadows" },
  { id: "studio",       label: "Studio",       prompt: "even studio softbox lighting" },
  { id: "neon",         label: "Neon",         prompt: "neon rim light, magenta + cyan" },
  { id: "moody",        label: "Moody",        prompt: "low-key moody lighting, deep shadows" },
  { id: "soft",         label: "Soft",         prompt: "soft diffused daylight" },
  { id: "high_contrast",label: "High Contrast",prompt: "extreme contrast, single hard key light" },
  { id: "sunset",       label: "Sunset",       prompt: "sunset orange/pink sky glow" },
  { id: "blue",         label: "Blue",         prompt: "cool cinematic blue lighting" },
];

export type PaletteId =
  | "auto" | "warm" | "cool" | "orange" | "blue" | "purple"
  | "black_gold" | "green" | "brand";
export const PALETTES: { id: PaletteId; label: string; hint: string }[] = [
  { id: "auto",       label: "Auto",         hint: "" },
  { id: "warm",       label: "Warm",         hint: "warm oranges, reds, yellows" },
  { id: "cool",       label: "Cool",         hint: "cool blues, teals" },
  { id: "orange",     label: "Orange",       hint: "orange dominant palette" },
  { id: "blue",       label: "Blue",         hint: "blue dominant palette" },
  { id: "purple",     label: "Purple",       hint: "purple / violet palette" },
  { id: "black_gold", label: "Black & Gold", hint: "black background with gold accents" },
  { id: "green",      label: "Green",        hint: "rich green palette" },
  { id: "brand",      label: "Brand Colors", hint: "use brand kit colors" },
];

export type CtrOptionId =
  | "large_face" | "eye_contact" | "rule_of_thirds" | "large_text"
  | "high_contrast" | "blur_bg" | "mobile_optimized" | "safe_text_area";
export const CTR_OPTIONS: { id: CtrOptionId; label: string }[] = [
  { id: "large_face",       label: "Large Face" },
  { id: "eye_contact",      label: "Eye Contact" },
  { id: "rule_of_thirds",   label: "Rule of Thirds" },
  { id: "large_text",       label: "Large Readable Text" },
  { id: "high_contrast",    label: "High Contrast" },
  { id: "blur_bg",          label: "Blur Background" },
  { id: "mobile_optimized", label: "Mobile Optimized" },
  { id: "safe_text_area",   label: "Safe Text Area" },
];

export type QualityId = "fast" | "balanced" | "ultra";
export const QUALITIES: { id: QualityId; label: string; imageQuality: "low" | "medium" | "high" }[] = [
  { id: "fast",     label: "Fast",     imageQuality: "low"    },
  { id: "balanced", label: "Balanced", imageQuality: "medium" },
  { id: "ultra",    label: "Ultra",    imageQuality: "high"   },
];

export type ConceptCount = 4 | 8 | 12 | 16;

export type BrandKitOptions = {
  useLogo: boolean;
  useColors: boolean;
  useFont: boolean;
  useWatermark: boolean;
};

export type ThumbnailBrief = {
  title: string;
  prompt: string;
  platform: PlatformId;
  aspectRatio: AspectRatioId;
  customWidth?: number;
  customHeight?: number;
  styleId: ExtendedStyleId;
  textMode: TextOverlayMode;
  customText: string;
  subjectId: SubjectId;
  customSubject: string;
  expression: ExpressionId;
  background: BackgroundId;
  lighting: LightingId;
  palette: PaletteId;
  ctrOptions: CtrOptionId[];
  brand: BrandKitOptions;
  conceptCount: ConceptCount;
  quality: QualityId;
  /** Optional data URL for the primary subject reference (face-preserve). */
  subjectImage?: string;
  /** Optional data URLs for secondary reference images (objects/context). */
  referenceImages?: string[];
  /** Optional overrides — when empty, the AI optimizer infers them. */
  overrideSubjectAction?: string;
  overrideBackground?: string;
  overrideCameraAngle?: string;
};

export type PlannedBrief = {
  sceneDescription: string;
  positivePrompt: string;
  negativePrompt: string;
  thumbnailText: string;
  /** True when the app draws the text (regional-language topic or text) instead of the image model. */
  textOverlay?: boolean;
  composition: string;
  cameraAngle: string;
  lighting: string;
  colorPalette: string;
  ctrTips: string[];
};

export type ThumbnailQualityReport = {
  ctrScore: number;
  readability: number;
  contrast: number;
  mobileVisibility: number;
  faceDetection: number;
  textBalance: number;
  brandConsistency: number;
  notes: string[];
};

export type ReverseEngineered = {
  style: string;
  composition: string;
  lighting: string;
  cameraAngle: string;
  colors: string[];
  prompt: string;
  negativePrompt: string;
  fontSuggestions: string[];
  textPlacement: string;
};

export function defaultBrief(): ThumbnailBrief {
  return {
    title: "",
    prompt: "",
    platform: "youtube",
    aspectRatio: "16:9",
    styleId: "mrbeast",
    textMode: "auto",
    customText: "",
    subjectId: "man",
    customSubject: "",
    expression: "shocked",
    background: "realistic",
    lighting: "high_contrast",
    palette: "auto",
    ctrOptions: ["large_face", "eye_contact", "large_text", "high_contrast"],
    brand: { useLogo: false, useColors: false, useFont: false, useWatermark: false },
    conceptCount: 4,
    quality: "balanced",
  };
}

export function ratioSize(brief: Pick<ThumbnailBrief, "aspectRatio" | "customWidth" | "customHeight">): { w: number; h: number; ratio: string } {
  if (brief.aspectRatio === "custom") {
    const w = brief.customWidth  ?? 1280;
    const h = brief.customHeight ?? 720;
    return { w, h, ratio: `${w}:${h}` };
  }
  const found = ASPECT_RATIOS.find((r) => r.id === brief.aspectRatio) ?? ASPECT_RATIOS[0];
  return { w: found.w, h: found.h, ratio: brief.aspectRatio };
}
