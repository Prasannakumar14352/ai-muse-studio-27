import { describe, expect, it } from "vitest";
import { buildCopyPrompt, lintCopy } from "@/lib/promo-studio/copy.server";

const v = {
  hook: "Make reels fast",
  headline: "One app for content",
  cta: "Start free",
  caption: "c",
  hashtags: ["#a", "#b", "#c"],
};

describe("promo copy", () => {
  it("passes clean copy", () => {
    expect(lintCopy(v, null)).toEqual([]);
  });
  it("flags prices, percents, 'off' and stray codes but not the offer code", () => {
    const w = lintCopy({ ...v, headline: "Get 50% off with DIWALI50 for ₹99" }, null);
    expect(w.length).toBe(4);
    expect(lintCopy({ ...v, headline: "Use DIWALI50" }, "DIWALI50")).toEqual([]);
  });
  it("puts the site in the honesty rules and asks for exact carousel slides", () => {
    const p = buildCopyPrompt({
      kb: "facts",
      appUrl: "https://x.example",
      honestyRules: "Link: {SITE}",
      template: "feature_spotlight",
      format: "carousel",
      language: "te",
      variants: 2,
      slides: 4,
      assets: [],
      offerTitle: null,
    });
    expect(p.system).toContain("https://x.example");
    expect(p.system).toContain("Telugu script");
    expect(JSON.parse(p.user).slide_rule).toContain("Exactly 4 middle slides");
  });
});
