// Promo Studio enums shared by client and server. They mirror the CHECK constraints in
// supabase/migrations/20261127090000_promo_studio.sql. No secrets, no server imports.

export const PROMO_TEMPLATES = ["feature_spotlight", "offer_festival", "before_after"] as const;
export type PromoTemplate = (typeof PROMO_TEMPLATES)[number];

export const PROMO_FORMATS = ["image", "carousel", "story"] as const;
export type PromoFormat = (typeof PROMO_FORMATS)[number];

export const PROMO_SIZES = ["4:5", "1:1", "9:16"] as const;
export type PromoSize = (typeof PROMO_SIZES)[number];

export const PROMO_LANGUAGES = ["en", "te", "hi"] as const;
export type PromoLanguage = (typeof PROMO_LANGUAGES)[number];

export const PROMO_STATUSES = ["draft", "approved", "scheduled", "posted", "archived"] as const;
export type PromoStatus = (typeof PROMO_STATUSES)[number];

export const PROMO_FEATURE_TAGS = [
  "images",
  "carousels",
  "thumbnails",
  "video",
  "voice",
  "captions",
  "research",
  "planner",
  "pricing",
  "other",
] as const;
export type PromoFeatureTag = (typeof PROMO_FEATURE_TAGS)[number];

/** Final creative size in pixels (the rendered PNG/JPEG). */
export const SIZE_PX: Record<PromoSize, { width: number; height: number }> = {
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** Cost-log step / provider values (promo_cost_log CHECKs). */
export const PROMO_SPEND_STEPS = ["copy", "background", "video", "voice", "transcode"] as const;
export type PromoSpendStep = (typeof PROMO_SPEND_STEPS)[number];
export const PROMO_PROVIDERS = ["openrouter", "fal"] as const;
export type PromoProvider = (typeof PROMO_PROVIDERS)[number];
export const PROMO_UNIT_TYPES = [
  "input_tokens+output_tokens",
  "megapixels",
  "images",
  "characters",
  "seconds",
] as const;
export type PromoUnitType = (typeof PROMO_UNIT_TYPES)[number];

/* ---------- Promo videos (Step 1: generated in the browser, downloaded as MP4) ---------- */
export const PROMO_VIDEO_TEMPLATES = [
  "product_tour",
  "feature_spotlight",
  "offer",
  "faceless_explainer",
  "telugu_voiceover",
] as const;
export type PromoVideoTemplate = (typeof PROMO_VIDEO_TEMPLATES)[number];

/** short = YouTube Shorts / Reels 9:16; regular = YouTube 16:9. */
export const PROMO_VIDEO_FORMATS = ["short", "regular"] as const;
export type PromoVideoFormat = (typeof PROMO_VIDEO_FORMATS)[number];

/** Allowed lengths (seconds) per format, and the scene count the script is written for. */
export const PROMO_VIDEO_LENGTHS: Record<PromoVideoFormat, readonly number[]> = {
  short: [15, 30, 45],
  regular: [45, 60, 90],
};
export function promoVideoSceneCount(seconds: number): number {
  return Math.min(12, Math.max(3, Math.round(seconds / 6)));
}

/** Frame size the scene stills are drawn at (the renderer scales them to its canvas). */
export const PROMO_VIDEO_FRAME: Record<PromoVideoFormat, { width: number; height: number }> = {
  short: { width: 1080, height: 1920 },
  regular: { width: 1920, height: 1080 },
};
