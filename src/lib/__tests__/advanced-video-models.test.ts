import { describe, expect, it } from "vitest";
import {
  ADVANCED_VIDEO_MODELS,
  VEO_CAPABILITIES,
  advancedClipQuote,
  isAdvancedVideoModel,
  veoProviderInput,
  veoSecondsFor,
} from "../advanced-video-models";
import { clipSecondsFor, motionClipCredits, MOTION_MODELS } from "../motion-clips";

describe("advanced video capability registry", () => {
  it("keeps endpoint-specific IDs and the supplied capability limits", () => {
    expect(ADVANCED_VIDEO_MODELS["veo-fast"].endpoint).toBe("fal-ai/veo3.1/fast/image-to-video");
    expect(ADVANCED_VIDEO_MODELS["veo-standard"].endpoint).toBe("fal-ai/veo3.1/image-to-video");
    expect(VEO_CAPABILITIES.requiredFields).toEqual(["prompt", "image_url"]);
    expect(VEO_CAPABILITIES.productionAvailability).toBe("feature-flagged");
    expect(VEO_CAPABILITIES.confirmedClipDurations).toEqual([4, 6, 8]);
    expect(VEO_CAPABILITIES.confirmedNativeAudioParameter).toBe(true);
    expect(isAdvancedVideoModel("toString")).toBe(false);
    expect(isAdvancedVideoModel("veo-fast")).toBe(true);
  });

  it("rounds motion up to 4, 6, or 8 provider seconds and sends explicit audio", () => {
    expect([3.5, 4.1, 6.1, 9].map(veoSecondsFor)).toEqual([4, 6, 8, 8]);
    expect(
      veoProviderInput({
        prompt: "Natural motion",
        image: "source",
        seconds: 6,
        aspectRatio: "9:16",
        resolution: "1080p",
        nativeAudio: false,
      }),
    ).toEqual({
      prompt: "Natural motion",
      image_url: "source",
      duration: "6s",
      aspect_ratio: "9:16",
      resolution: "1080p",
      generate_audio: false,
    });
  });

  it("quotes generated seconds separately from native audio uplift", () => {
    expect(advancedClipQuote("veo-fast", 4, true)).toEqual({
      motionCredits: 75,
      nativeAudioCredits: 37,
      totalCredits: 112,
    });
    expect(advancedClipQuote("veo-standard", 4, false).totalCredits).toBe(149);
    expect(advancedClipQuote("veo-standard", 4, true).totalCredits).toBe(297);
    expect(() => advancedClipQuote("veo-fast", NaN, true)).toThrow(RangeError);
  });

  it("preserves both legacy tier endpoints and billing", () => {
    expect(MOTION_MODELS.standard.endpoint).toBe("minimax/h3-max-turbo/image-to-video");
    expect(MOTION_MODELS.premium.endpoint).toBe("fal-ai/kling-video/v2.5-turbo/pro/image-to-video");
    expect(clipSecondsFor("standard", 3.5)).toBe(3.5);
    expect(clipSecondsFor("premium", 3.5)).toBe(5);
    expect(motionClipCredits("standard", 3.5)).toBe(20);
    expect(motionClipCredits("premium", 3.5)).toBe(65);
  });
});
