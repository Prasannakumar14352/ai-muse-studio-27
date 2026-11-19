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
  { id: "image",       label: "AI image (standard)",              category: "Image",    credits: 1,        unit: "per image",       notes: "Fast, high-quality render (FLUX). Used for scene images, carousels and most thumbnails." },
  { id: "image_hd",    label: "AI image (HD) or image edit",      category: "Image",    credits: 8,        unit: "per image",       notes: "Google Gemini image model: HD/Ultra renders, upscale, remove background, inpaint, outpaint, magic eraser, reference images." },
  { id: "image_regen", label: "Regenerate scene image",           category: "Image",    credits: 1,        unit: "per image",       notes: "Only re-renders the affected scene after you tweak its prompt." },
  { id: "carousel",    label: "Instagram-style carousel",         category: "Carousel", credits: "1 + N",  unit: "1 script + 1 per slide", notes: "1 credit for the AI copy, plus 1 credit per rendered slide image (N = slide count, 3–10)." },
  { id: "voiceover",   label: "Voiceover (any language)",         category: "Audio",    credits: 1,        unit: "per 100 characters", notes: "ElevenLabs multilingual voice. A typical scene (1–2 sentences) is about 2 credits." },
  { id: "short_reel",  label: "Short reel (≤ 60s)",               category: "Video",    credits: "1 + S + V", unit: "script + scene images + voice", notes: "1 for the script, 1 per scene image, voice per 100 characters. Typical 8-scene reel with voice: about 25 credits." },
  { id: "long_video",  label: "Long video (up to 30 min)",        category: "Video",    credits: "1 + S + V", unit: "script + scene images + voice", notes: "About 1 scene per 8s. A 5-min video with voiceover is about 85 credits." },
  { id: "render",      label: "Final video render (in-browser)",  category: "Video",    credits: 0,        unit: "free",            notes: "Rendered in your browser after images and voiceover are ready — no extra credits." },
  { id: "caption_only",label: "Caption pack only",                category: "Text",     credits: 1,        unit: "per pack",        notes: "Caption + hashtag bundle without images or video." },
  { id: "model_studio",label: "Model Studio (Seedance, FLUX, ElevenLabs)", category: "Video", credits: "varies", unit: "shown before you generate", notes: "Priced per model from its real cost. Example: Seedance 2.0 Fast 5s ≈ 224 credits." },
];

export const CREDIT_GUIDE_INTRO = [
  "Credits are consumed only when generation actually runs. Failed generations are refunded automatically.",
  "You can top up credits any time from Settings → Plans & credits. Admins can also add credits manually from this panel.",
  "Regeneration of a single asset (one image, one scene) only costs that asset — not the whole project.",
];

// Per-asset credit costs used across the pricing page + estimator.
// Kept in sync with CREDIT_COSTS above.
export const ASSET_CREDIT_COST = {
  image: 1,          // 1 credit per standard AI image (HD/edits: 6)
  carousel: 5,       // 1 script + ~4 slides
  shortReel: 25,     // 1 script + ~8 scene images + ~16 voice credits
  longVideo: 85,     // 5-minute video: 1 script + ~37 scene images + ~45 voice credits
} as const;

export type AssetKey = keyof typeof ASSET_CREDIT_COST;

export const ASSET_META: Record<AssetKey, { label: string; cost: number; unit: string }> = {
  image:     { label: "AI image",           cost: ASSET_CREDIT_COST.image,     unit: "per image" },
  carousel:  { label: "Carousel (5 slides)", cost: ASSET_CREDIT_COST.carousel,  unit: "per carousel" },
  shortReel: { label: "Short reel with voice",  cost: ASSET_CREDIT_COST.shortReel, unit: "per reel" },
  longVideo: { label: "5-min video with voice", cost: ASSET_CREDIT_COST.longVideo, unit: "per video" },
};

export function getPlanGenerationEstimate(credits: number): {
  images: number;
  carousels: number;
  shortReels: number;
  longVideos: number;
} | null {
  if (credits <= 0) return null;
  return {
    images: Math.floor(credits / ASSET_CREDIT_COST.image),
    carousels: Math.floor(credits / ASSET_CREDIT_COST.carousel),
    shortReels: Math.floor(credits / ASSET_CREDIT_COST.shortReel),
    longVideos: Math.floor(credits / ASSET_CREDIT_COST.longVideo),
  };
}


/**
 * Rough credit estimate shown before "Generate" (script + scene images +
 * narration). Matches the per-unit prices above; actual use may differ a
 * little with the final script length.
 */
export function estimateProjectCredits(opts: {
  contentType: string;
  lengthSec?: number;
  slideCount?: number;
}): { total: number; parts: string } {
  if (opts.contentType === "carousel") {
    const n = Math.max(3, Math.min(10, opts.slideCount ?? 7));
    return { total: 1 + n, parts: `1 for the copy + ${n} slide images` };
  }
  const len = Math.max(15, opts.lengthSec ?? (opts.contentType === "long_video" ? 90 : 30));
  const scenes = opts.contentType === "long_video" ? Math.ceil(len / 8) : Math.max(4, Math.ceil(len / 3.5));
  const voice = Math.ceil((len * 2.5 * 6) / 100); // ~2.5 words/s, ~6 chars/word, 1 credit / 100 chars
  return { total: 1 + scenes + voice, parts: `1 script + ${scenes} scene images + ~${voice} narration` };
}
