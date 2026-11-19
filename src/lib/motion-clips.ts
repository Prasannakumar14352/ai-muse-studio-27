/**
 * Real motion for story videos: a scene's still image is animated into a short
 * AI video clip (image-to-video on fal.ai). Client-safe — no secrets here.
 *
 * Pricing uses the same rule as Model Studio (see model-catalog.ts):
 *   credits = ceil(providerCostUsd × MARKUP / CREDIT_FLOOR_USD)
 * fal list prices checked 19 Nov 2026 — re-check when fal changes them.
 */
import { CREDIT_FLOOR_USD, MARKUP } from "@/lib/model-catalog";

export type MotionMode = "off" | "key" | "full";
export type MotionTier = "standard" | "premium";

export type MotionModel = {
  tier: MotionTier;
  label: string;
  endpoint: string;
  usdPerSecond: number;
  /** Fixed clip lengths the model accepts (Kling: 5 or 10 s). Empty = any length. */
  fixedDurations: number[];
  /**
   * Seconds fal actually bills at minimum per clip. H3 returns up to ~0.7 s
   * more than requested and bills a floor: 21 real 3.5 s clips cost $2.20
   * (≈ $0.105 each ≈ 5.6 s), so price from that, not the request.
   */
  minBilledSeconds: number;
  minSeconds: number;
  maxSeconds: number;
};

export const MOTION_MODELS: Record<MotionTier, MotionModel> = {
  standard: {
    tier: "standard",
    label: "Standard motion (MiniMax H3 Turbo)",
    endpoint: "minimax/h3-max-turbo/image-to-video",
    usdPerSecond: 0.01875,
    fixedDurations: [],
    minBilledSeconds: 5.6,
    minSeconds: 2,
    maxSeconds: 10,
  },
  premium: {
    tier: "premium",
    label: "Premium motion (Kling 2.5 Turbo Pro)",
    endpoint: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    usdPerSecond: 0.07,
    fixedDurations: [5, 10],
    minBilledSeconds: 5,
    minSeconds: 5,
    maxSeconds: 10,
  },
};

/** "Key moments" = the hook plus one clip about every this many seconds. */
export const KEY_MOMENT_EVERY_SEC = 30;
/** Seconds of video per beat (matches the pipeline's TARGET_BEAT_SEC). */
export const BEAT_SEC = 3.5;
/** Longest video that may use "Full motion" (every beat animated). */
export const FULL_MOTION_MAX_SEC = 300;

/** Number of clips "Key moments" makes for a video with this many beats. */
export function keyMomentClipCount(totalBeats: number): number {
  const seconds = totalBeats * BEAT_SEC;
  return Math.min(totalBeats, Math.max(3, 1 + Math.round(seconds / KEY_MOMENT_EVERY_SEC)));
}

/** The clip length actually requested from the provider for a beat. */
export function clipSecondsFor(tier: MotionTier, beatSeconds: number): number {
  const m = MOTION_MODELS[tier];
  const want = Math.min(m.maxSeconds, Math.max(m.minSeconds, beatSeconds));
  if (m.fixedDurations.length) {
    return m.fixedDurations.find((d) => d >= want) ?? m.fixedDurations[m.fixedDurations.length - 1];
  }
  return Math.round(want * 10) / 10;
}

/** Credits for one clip. Same function on client (display) and server (billing). */
export function motionClipCredits(tier: MotionTier, beatSeconds: number): number {
  const m = MOTION_MODELS[tier];
  const secs = Math.max(clipSecondsFor(tier, beatSeconds), m.minBilledSeconds);
  const usd = secs * m.usdPerSecond;
  return Math.max(1, Math.ceil((usd * MARKUP) / CREDIT_FLOOR_USD));
}

/**
 * Which beats get a real clip. "key" = the first beat (the hook) plus about
 * one beat every 30 s, evenly spread; "full" = every beat.
 */
export function pickMotionBeats(totalBeats: number, mode: MotionMode): number[] {
  if (mode === "off" || totalBeats <= 0) return [];
  if (mode === "full") return Array.from({ length: totalBeats }, (_, i) => i);
  const n = keyMomentClipCount(totalBeats);
  if (n === 1) return [0];
  const picks = new Set<number>([0]);
  for (let k = 1; k < n; k++) picks.add(Math.round((k * (totalBeats - 1)) / (n - 1)));
  // Fill any collisions (very short videos) with the next free beat.
  for (let i = 0; picks.size < n && i < totalBeats; i++) picks.add(i);
  return [...picks].sort((a, b) => a - b);
}

/** Total credits for a video, shown before rendering. */
export function estimateMotionCredits(
  totalBeats: number,
  beatSeconds: number,
  mode: MotionMode,
  tier: MotionTier,
): { clips: number; credits: number } {
  const clips = pickMotionBeats(totalBeats, mode).length;
  return { clips, credits: clips * motionClipCredits(tier, beatSeconds) };
}

/** Motion prompt for the image-to-video model: animate what's in the frame, keep it text-free. */
export function motionPromptFor(sceneVisual: string, cameraHint?: string): string {
  const visual = sceneVisual.trim().slice(0, 600);
  return [
    `Animate this exact image: ${visual || "the scene"}.`,
    `Natural, believable motion — people move, gesture and react; hair, cloth, light and background details move subtly.`,
    cameraHint ? `Camera: ${cameraHint}.` : `Camera: gentle cinematic movement.`,
    `Keep the same characters, faces, outfits and setting as the image. No new people.`,
    `No text, captions, letters or logos.`,
  ].join(" ");
}
