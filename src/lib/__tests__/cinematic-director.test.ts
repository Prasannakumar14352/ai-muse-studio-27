import { describe, expect, it } from "vitest";
import { bibleToContinuityCard, defaultCharacterBibleFor } from "../character-bible";
import { CINEMATIC_STYLES, directBeatPrompt, STYLE_PRESETS } from "../visual-director";

const title = "Hanuman — The Awakening of Divine Power";
const instructions =
  "Respectful Hanuman depiction with a simian face, traditional ornaments and a golden aura.";
const bible = defaultCharacterBibleFor(title, undefined, `${title}. ${instructions}`);
const base = {
  title,
  ratio: "16:9",
  beatIndex: 0,
  continuity: bibleToContinuityCard(bible),
} as const;

describe("cinematic visual direction", () => {
  it.each(Object.entries(CINEMATIC_STYLES))("resolves the %s preset", (id, preset) => {
    const styleId = id as keyof typeof CINEMATIC_STYLES;
    const result = directBeatPrompt({
      ...base,
      styleId,
      beatText: "The hero runs into the clearing",
    });
    expect(result.preset.label).toBe(preset.label);
    expect(result.prompt).toContain(preset.description);
    expect(result.negativePrompt).toContain(preset.negative);
  });

  it("preserves the legacy preset IDs and resolves their prompts", () => {
    const legacy = [
      "3d",
      "ghibli",
      "anime",
      "realistic",
      "pixar",
      "cinematic",
      "documentary",
      "dark_mystery",
      "luxury",
      "cyberpunk",
      "minimal_product",
      "futuristic",
    ] as const;
    for (const styleId of legacy) {
      const result = directBeatPrompt({
        ...base,
        styleId,
        beatText: "A guide walks through a park",
      });
      expect(result.preset).toBe(STYLE_PRESETS[styleId]);
      expect(result.prompt.length).toBeGreaterThan(0);
    }
  });

  it("retains scene and character directions when framing an aerial action shot", () => {
    const scene = "Hanuman flies above enormous ocean waves toward golden Lanka";
    const result = directBeatPrompt({
      ...base,
      styleId: "indian_mythology",
      beatText: "హనుమంతుడు సముద్రం మీదుగా ఎగిరాడు",
      sceneContext: scene,
      environmentOverride: scene,
      visualInstructions: instructions,
    });
    expect(result.shotType).toBe("drone");
    expect(result.hasCharacter).toBe(true);
    expect(result.prompt).toContain(scene);
    expect(result.prompt).toContain(instructions);
    expect(result.prompt).not.toContain("white low-top sneakers");
    expect(bible.masterPortraitPrompt).toContain("simian face");
    expect(bible.masterPortraitPrompt).toContain("skin or fur");
  });

  it("varies framing across consecutive beats with similar action", () => {
    const result = directBeatPrompt({
      ...base,
      styleId: "indian_mythology",
      beatText: "He leaps from the mountain",
      previousShotType: "low_angle",
    });
    expect(result.shotType).not.toBe("low_angle");
  });
});
