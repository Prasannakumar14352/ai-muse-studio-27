/**
 * Model Studio catalog — the "Merlin-style" list of third-party models users
 * can run directly (video / image / voice). Client-safe: no secrets here.
 *
 * PRICING RULE (the part that makes money):
 *   credits = ceil(providerCostUsd × MARKUP / CREDIT_FLOOR_USD)
 *
 * CREDIT_FLOOR_USD is the LOWEST price a user ever pays for one credit across
 * all plans and packs (today: Pro yearly, $390 / 36,000 credits = $0.0108). Pricing
 * against the floor means even the cheapest credit still earns MARKUP× the
 * provider cost, so no plan can run the business at a loss on these models.
 *
 * If you change plan prices or credit amounts in the pricing_plans /
 * credit_packs tables, update CREDIT_FLOOR_USD to the new lowest $/credit.
 *
 * providerCost values are fal.ai list prices (checked Nov 2026). Prices change —
 * re-check https://fal.ai/pricing before launch and whenever fal updates them.
 * Entries marked `estimate: true` were not confirmed and are set on the
 * high side on purpose.
 */

export const CREDIT_FLOOR_USD = 0.0108;
export const MARKUP = 2.0;

export type ModelKind = "video" | "image" | "audio";

export type ModelParams = {
  durationSec?: number;
  aspectRatio?: string;
  textLength?: number;
  numImages?: number;
};

export type CatalogModel = {
  id: string;
  kind: ModelKind;
  label: string;
  vendor: string;
  description: string;
  /** fal.ai endpoint id (used with https://queue.fal.run/<endpoint>). */
  endpoint: string;
  badge?: string;
  estimate?: boolean;
  durations?: number[];
  aspectRatios?: string[];
  voices?: string[];
  maxChars?: number;
  /** Provider cost in USD for one run with these params. */
  costUsd: (p: ModelParams) => number;
};

const VIDEO_RATIOS = ["16:9", "9:16", "1:1"];
const ELEVEN_VOICES = [
  "Aria",
  "Sarah",
  "Laura",
  "Charlotte",
  "Roger",
  "Charlie",
  "George",
  "Brian",
];

export const MODEL_CATALOG: CatalogModel[] = [
  // ── Video ────────────────────────────────────────────────────────────
  {
    id: "seedance-2-fast",
    kind: "video",
    label: "Seedance 2.0 Fast",
    vendor: "ByteDance",
    description: "Quick, cheaper Seedance renders with native audio. 720p.",
    endpoint: "bytedance/seedance-2.0/fast/text-to-video",
    badge: "Best value",
    durations: [5, 10],
    aspectRatios: VIDEO_RATIOS,
    costUsd: (p) => 0.2419 * (p.durationSec ?? 5),
  },
  {
    id: "seedance-2",
    kind: "video",
    label: "Seedance 2.0",
    vendor: "ByteDance",
    description: "Full-quality Seedance 2.0 with native audio. 720p.",
    endpoint: "bytedance/seedance-2.0/text-to-video",
    badge: "Popular",
    durations: [5, 10],
    aspectRatios: VIDEO_RATIOS,
    costUsd: (p) => 0.303 * (p.durationSec ?? 5),
  },
  {
    id: "seedance-2-5",
    kind: "video",
    label: "Seedance 2.5",
    vendor: "ByteDance",
    description: "ByteDance's newest model — cinematic camera control and physics. 720p.",
    endpoint: "bytedance/seedance-2.5/text-to-video",
    badge: "Newest",
    durations: [5, 10],
    aspectRatios: VIDEO_RATIOS,
    costUsd: (p) => 0.473 * (p.durationSec ?? 5),
  },

  // ── Image ────────────────────────────────────────────────────────────
  {
    id: "flux-schnell",
    kind: "image",
    label: "FLUX.1 Schnell",
    vendor: "Black Forest Labs",
    description: "Very fast, low-cost images. Great for drafts and volume.",
    endpoint: "fal-ai/flux/schnell",
    badge: "Fastest",
    estimate: true,
    aspectRatios: ["1:1", "9:16", "16:9"],
    costUsd: (p) => 0.005 * (p.numImages ?? 1),
  },
  {
    id: "flux-dev",
    kind: "image",
    label: "FLUX.1 Dev",
    vendor: "Black Forest Labs",
    description: "Higher-detail images with better prompt following.",
    endpoint: "fal-ai/flux/dev",
    estimate: true,
    aspectRatios: ["1:1", "9:16", "16:9"],
    costUsd: (p) => 0.03 * (p.numImages ?? 1),
  },

  // ── Voice (all languages) ────────────────────────────────────────────
  {
    id: "eleven-multilingual-v2",
    kind: "audio",
    label: "ElevenLabs Multilingual v2",
    vendor: "ElevenLabs",
    description: "Stable, natural narration in 29 languages (incl. Hindi, Tamil).",
    endpoint: "fal-ai/elevenlabs/tts/multilingual-v2",
    voices: ELEVEN_VOICES,
    maxChars: 2500,
    costUsd: (p) => (0.1 * Math.max(1, p.textLength ?? 0)) / 1000,
  },
  {
    id: "eleven-v3",
    kind: "audio",
    label: "ElevenLabs v3",
    vendor: "ElevenLabs",
    description:
      "Most expressive voice model, 70+ languages. Test Telugu output before promising it.",
    endpoint: "fal-ai/elevenlabs/tts/eleven-v3",
    badge: "70+ languages",
    estimate: true,
    voices: ELEVEN_VOICES,
    maxChars: 2500,
    costUsd: (p) => (0.2 * Math.max(1, p.textLength ?? 0)) / 1000,
  },
];

export function findModel(id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** Credits charged for one run. Same function on client (display) and server (billing). */
export function creditsFor(model: CatalogModel, p: ModelParams): number {
  const usd = model.costUsd(p);
  return Math.max(1, Math.ceil((usd * MARKUP) / CREDIT_FLOOR_USD));
}
