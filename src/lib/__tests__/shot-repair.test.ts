import { describe, expect, it } from "vitest";
import { shotRepairPlan } from "../shot-repair";

describe("selective shot repair", () => {
  it("does not generate motion for a still-only repair in Full Motion", () => {
    expect(shotRepairPlan("image", true).generateMotion).toBe(false);
  });

  it("requires a saved still and disables implicit still fallback for motion-only repair", () => {
    expect(shotRepairPlan("motion", false)).toEqual({
      requiresExistingStill: true,
      generateMotion: true,
      permitsStillFallback: false,
    });
  });

  it("keeps timeline motion and fallback behavior for whole-shot generation", () => {
    expect(shotRepairPlan("shot", true)).toEqual({
      requiresExistingStill: false,
      generateMotion: true,
      permitsStillFallback: true,
    });
    expect(shotRepairPlan("shot", false).generateMotion).toBe(false);
  });
});
