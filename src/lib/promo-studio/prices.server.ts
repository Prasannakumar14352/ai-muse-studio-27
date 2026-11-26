/**
 * Promo Studio provider prices (USD per unit) and worst-case estimates. Server-only.
 *
 * Estimates are deliberately worst-case (bounded by max_tokens / rounded-up megapixels), so a
 * reservation at the estimate is never lower than the real bill in practice.
 *
 * Checked 2026-11-26:
 *  - OpenRouter /models/google/gemini-2.5-flash/endpoints: prompt $0.0000003/token,
 *    completion and internal_reasoning $0.0000025/token.
 *  - fal fal-ai/flux/schnell model page: $0.003 per megapixel, rounded UP to the nearest megapixel.
 */
import type { PromoSize } from "./constants";

export const PROMO_COPY_MODEL = "google/gemini-2.5-flash";
export const PROMO_BG_MODEL = "fal-ai/flux/schnell";

/** Background endpoints the code allows. promo_settings.bg_models is intersected with this. */
export const PROMO_BG_MODEL_ALLOWLIST: readonly string[] = [PROMO_BG_MODEL];

export const PROMO_PRICES = {
  [PROMO_COPY_MODEL]: { provider: "openrouter", inputPerToken: 0.0000003, outputPerToken: 0.0000025 },
  [PROMO_BG_MODEL]: { provider: "fal", perMegapixel: 0.003 },
} as const;

export type PromoPricedModel = keyof typeof PROMO_PRICES;

export function isPricedModel(model: string): model is PromoPricedModel {
  return Object.prototype.hasOwnProperty.call(PROMO_PRICES, model);
}

/** Copy call bounds (design §6.1). */
export const COPY_MAX_TOKENS = 1800;
export const COPY_MAX_INPUT_TOKENS = 8000;
/** liveKb is sliced to this many characters so the input stays ≤ 8k tokens. */
export const COPY_KB_MAX_CHARS = 12_000;

/** AI background size per creative size: kept ≤ 1,000,000 px so it bills as 1 MP. */
export const BG_SIZE_PX: Record<PromoSize, { width: number; height: number }> = {
  "4:5": { width: 880, height: 1104 },
  "1:1": { width: 992, height: 992 },
  "9:16": { width: 736, height: 1312 },
};

/** Round UP to whole micro-dollars (promo_cost_log.est_usd is numeric(12,6)). */
export function roundUsd(v: number): number {
  return Math.ceil(v * 1e6 - 1e-6) / 1e6;
}

/** Rough token count for an input string length (≈3.5 chars per token). */
export function approxTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 3.5);
}

/**
 * Worst-case cost of one copy call: input tokens (capped at 8k) at the prompt price plus the
 * full max_tokens at the completion price. Without inputChars the input is taken at its cap.
 */
export function estimateCopyUsd(opts: { inputChars?: number } = {}): number {
  const p = PROMO_PRICES[PROMO_COPY_MODEL];
  const input = opts.inputChars === undefined ? COPY_MAX_INPUT_TOKENS : Math.min(approxTokens(opts.inputChars), COPY_MAX_INPUT_TOKENS);
  return roundUsd(input * p.inputPerToken + COPY_MAX_TOKENS * p.outputPerToken);
}

/** Megapixels billed by fal for a size (rounded up). */
export function billedMegapixels(width: number, height: number): number {
  return Math.ceil((width * height) / 1e6);
}

/** Cost of one flux/schnell background at the given pixel size. */
export function estimateBackgroundUsd(opts: { width: number; height: number }): number {
  return roundUsd(billedMegapixels(opts.width, opts.height) * PROMO_PRICES[PROMO_BG_MODEL].perMegapixel);
}

/**
 * Worst-case cost of one Generate click: one copy call for all variants, plus one background per
 * variant when aiBackground is on (shared by all slides of a carousel).
 */
export function estimateRequestUsd(opts: {
  size: PromoSize;
  variants: number;
  aiBackground: boolean;
  inputChars?: number;
}): number {
  const copy = estimateCopyUsd({ inputChars: opts.inputChars });
  const bg = opts.aiBackground ? opts.variants * estimateBackgroundUsd(BG_SIZE_PX[opts.size]) : 0;
  return roundUsd(copy + bg);
}
