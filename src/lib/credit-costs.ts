// Single source of truth for how much each generation action costs. Used by
// the admin "Credits & Pricing Guide" section and safe to reuse elsewhere.

export type CreditCostRow = {
  id: string;
  label: string;
  category: "Text" | "Image" | "Carousel" | "Video" | "Audio";
  credits: number | string;   // number for a fixed cost, string for a formula
  unit: string;               // "per generation", "per slide", "per 30s", ...
  notes: string;
};

export const CREDIT_COSTS: CreditCostRow[] = [
  { id: "script",      label: "Script + captions + hashtags",     category: "Text",     credits: 1,        unit: "per project",     notes: "AI-written script, on-screen text, caption, and hashtag pack." },
  { id: "image",       label: "AI image (single)",                category: "Image",    credits: 1,        unit: "per image",       notes: "One high-resolution AI image render at your chosen aspect ratio." },
  { id: "image_regen", label: "Regenerate scene image",           category: "Image",    credits: 1,        unit: "per image",       notes: "Only re-renders the affected scene after you tweak its prompt." },
  { id: "carousel",    label: "Instagram-style carousel",         category: "Carousel", credits: "1 + N",  unit: "1 script + 1 per slide", notes: "1 credit for the AI copy, plus 1 credit per rendered slide image (N = slide count, 3–10)." },
  { id: "short_reel",  label: "Short reel (≤ 60s)",               category: "Video",    credits: "1 + S",  unit: "1 script + 1 per scene image", notes: "1 credit for the script + 1 credit per scene image. Typical short reel: 6–12 credits." },
  { id: "long_video",  label: "Long video (up to 30 min)",        category: "Video",    credits: "1 + S",  unit: "1 script + 1 per scene image", notes: "Scene count scales with duration (~1 scene per 8s). A 5-min video ≈ 38 credits, 15-min ≈ 113 credits." },
  { id: "render",      label: "Final video render (in-browser)",  category: "Video",    credits: 0,        unit: "free",            notes: "Rendered client-side after images and voiceover are ready — no extra credits." },
  { id: "voiceover",   label: "Voiceover (text-to-speech)",       category: "Audio",    credits: 1,        unit: "per scene batch", notes: "Generates spoken audio for every scene in the current project." },
  { id: "caption_only",label: "Caption pack only",                category: "Text",     credits: 1,        unit: "per pack",        notes: "Caption + hashtag bundle without images or video." },
];

export const CREDIT_GUIDE_INTRO = [
  "Credits are consumed only when generation actually runs. Failed generations are refunded automatically.",
  "You can top up credits any time from Settings → Plans & credits. Admins can also add credits manually from this panel.",
  "Regeneration of a single asset (one image, one scene) only costs that asset — not the whole project.",
];

export function getPlanGenerationEstimate(credits: number): {
  images: number;
  carousels: number;
  shortReels: number;
  longVideos: number;
} | null {
  if (credits <= 0) return null;
  // Estimates based on CREDIT_COSTS:
  //   - AI image: 1 credit per image
  //   - Carousel: 1 script + 1 per slide (avg 5 slides = 5 credits)
  //   - Short reel: 1 script + 1 per scene image (avg 8 scenes = 9 credits)
  //   - Long video: 1 script + 1 per scene image (~1 scene per 8s; 5 min ≈ 38 scenes = 38 credits)
  return {
    images: credits,
    carousels: Math.floor(credits / 5),
    shortReels: Math.floor(credits / 9),
    longVideos: Math.floor(credits / 38),
  };
}
