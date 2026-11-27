import { CREDIT_FLOOR_USD, MARKUP } from "./model-catalog";

export const ADVANCED_VIDEO_MODELS = {
  "veo-fast": {
    label: "Veo 3.1 Fast — Advanced cinematic",
    endpoint: "fal-ai/veo3.1/fast/image-to-video",
    silentUsdPerSecond: 0.1,
    nativeUsdPerSecond: 0.15,
  },
  "veo-standard": {
    label: "Veo 3.1 Standard — Premium cinematic",
    endpoint: "fal-ai/veo3.1/image-to-video",
    silentUsdPerSecond: 0.2,
    nativeUsdPerSecond: 0.4,
  },
} as const;

export type AdvancedVideoModelId = keyof typeof ADVANCED_VIDEO_MODELS;
export type VideoMotionModelId = "standard" | "premium" | AdvancedVideoModelId;
export type SceneAudioSource = "separate" | "native" | "hybrid";

export const ADVANCED_VIDEO_FEATURE_FLAG = "VIDEO_ADVANCED_MODELS_ENABLED";
export const ADVANCED_VIDEO_PRICING_DATE = "2026-11-27";

// Endpoint-specific contract supplied from fal documentation, 2026-11-27.
export const VEO_CAPABILITIES = {
  imageToVideo: true,
  requiredFields: ["prompt", "image_url"],
  confirmedClipDurations: [4, 6, 8],
  confirmedResolutions: ["720p", "1080p"],
  confirmedAspectRatios: ["16:9", "9:16"],
  confirmedNativeAudioParameter: true,
  productionAvailability: "feature-flagged",
  featureFlag: ADVANCED_VIDEO_FEATURE_FLAG,
} as const;

export type VeoResolution = (typeof VEO_CAPABILITIES.confirmedResolutions)[number];

export function veoSecondsFor(beatSeconds: number) {
  return VEO_CAPABILITIES.confirmedClipDurations.find((seconds) => seconds >= beatSeconds) ?? 8;
}

export function veoProviderInput(input: {
  prompt: string;
  image: string;
  seconds: number;
  aspectRatio: "16:9" | "9:16";
  resolution: VeoResolution;
  nativeAudio: boolean;
}) {
  return {
    prompt: input.prompt,
    image_url: input.image,
    duration: `${input.seconds}s`,
    aspect_ratio: input.aspectRatio,
    resolution: input.resolution,
    generate_audio: input.nativeAudio,
  };
}

export function isAdvancedVideoModel(id: unknown): id is AdvancedVideoModelId {
  return typeof id === "string" && Object.hasOwn(ADVANCED_VIDEO_MODELS, id);
}

export function advancedClipQuote(
  model: AdvancedVideoModelId,
  providerGeneratedSeconds: number,
  nativeAudio: boolean,
) {
  if (!Number.isFinite(providerGeneratedSeconds) || providerGeneratedSeconds <= 0) {
    throw new RangeError("A positive provider-generated clip duration is required");
  }
  const rates = ADVANCED_VIDEO_MODELS[model];
  const credits = (rate: number) =>
    Math.ceil((rate * providerGeneratedSeconds * MARKUP) / CREDIT_FLOOR_USD);
  const motionCredits = credits(rates.silentUsdPerSecond);
  const totalCredits = credits(nativeAudio ? rates.nativeUsdPerSecond : rates.silentUsdPerSecond);
  return { motionCredits, nativeAudioCredits: totalCredits - motionCredits, totalCredits };
}
