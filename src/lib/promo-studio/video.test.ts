import { describe, expect, it } from "vitest";
import {
  estimateVoiceUsd,
  PROMO_VOICE_TURBO,
  PROMO_VOICE_V3,
} from "@/lib/promo-studio/prices.server";
import { PROMO_VIDEO_LENGTHS, promoVideoSceneCount } from "@/lib/promo-studio/constants";
import { buildVideoPrompt } from "@/lib/promo-studio/video-script.server";

describe("promo video", () => {
  it("prices voice per character (Telugu uses v3 at twice the price)", () => {
    expect(estimateVoiceUsd(PROMO_VOICE_TURBO, 1000)).toBeCloseTo(0.05, 6);
    expect(estimateVoiceUsd(PROMO_VOICE_V3, 1000)).toBeCloseTo(0.1, 6);
  });
  it("keeps scene counts sensible for every allowed length", () => {
    for (const s of [...PROMO_VIDEO_LENGTHS.short, ...PROMO_VIDEO_LENGTHS.regular]) {
      const n = promoVideoSceneCount(s);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(12);
    }
  });
  it("asks for the exact scene count and forbids codes and prices", () => {
    const p = buildVideoPrompt({
      kb: "facts",
      honestyRules: "Link: {SITE}",
      appUrl: "https://x.example",
      template: "product_tour",
      format: "short",
      seconds: 30,
      scenes: 5,
      language: "te",
      assets: [{ label: "dash", featureTag: "other" }],
      offerTitle: null,
      defaultCta: "Start free",
    });
    expect(p.system).toContain("exactly 5 scenes");
    expect(p.system).toContain("Never write a discount code");
    expect(p.system).toContain("Telugu");
  });
});
