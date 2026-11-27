import { describe, expect, it } from "vitest";
import { assessVideoAssets, durationFinding } from "../video-quality";
import { audioSignal } from "../video-quality-browser";
import { frameBoundaries } from "../studio-server-render";
import { proRenderManifest } from "../pro-render-manifest";

const input = {
  scenes: [
    { n: 1, voiceover: "Welcome", visual: "First shot" },
    { n: 2, voiceover: " welcome ", visual: "Second shot" },
  ],
  shots: [{ id: "shot-1", status: "done", kind: "image", previewUrl: "blob:shot" }],
  duration: 5,
  language: "Telugu",
  narration: [{ n: 1, duration: 6 }],
  narrationEnabled: true,
  characterRequested: true,
  fullMotion: true,
  audio: [{ id: "music-1", label: "music", status: "failed" }],
};

describe("video quality evidence", () => {
  it("blocks missing requested audio and records advisory script and motion findings", () => {
    const findings = assessVideoAssets(input);
    expect(
      findings.filter((finding) => finding.blocksApproval).map((finding) => finding.id),
    ).toEqual(["narration-2", "track-music-1"]);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "repeat-2", result: "warning" }),
        expect.objectContaining({ id: "telugu-1", result: "warning" }),
        expect.objectContaining({ id: "still-shot-1", result: "warning" }),
        expect.objectContaining({ id: "character-identity", result: "not checked" }),
      ]),
    );
  });

  it("does not require narration when explicitly disabled", () => {
    const findings = assessVideoAssets({ ...input, narrationEnabled: false, audio: [] });
    expect(findings.some((finding) => finding.blocksApproval)).toBe(false);
  });

  it("distinguishes silence and full-scale samples and rejects excessive drift", () => {
    const sample = (values: number[]) =>
      audioSignal({
        length: values.length,
        numberOfChannels: 1,
        getChannelData: () => Float32Array.from(values),
      });
    expect(sample([0, 0])).toEqual({ peakDbfs: -Infinity, fullScaleShare: 0 });
    expect(sample([1, 0.5, 0, -1])).toEqual({ peakDbfs: 0, fullScaleShare: 0.5 });
    expect(durationFinding(29.8, 30, 24).passed).toBe(true);
    expect(durationFinding(28.8, 30, 24).passed).toBe(false);
  });
});

describe("studio manifest timing", () => {
  it("rounds cumulative boundaries so short-shot rounding cannot accumulate", () => {
    const frames = frameBoundaries(Array(12).fill(2.5 / 12), 24);
    expect(frames.at(-1)).toBe(60);
    expect(frames.slice(1).every((end, i) => end > frames[i])).toBe(true);
  });

  it("accepts only allowlisted movement and treats overlay text as bounded data", () => {
    const input = {
      version: 2,
      projectId: "087674c0-30ab-4e2c-a02a-dcd97ec35949",
      projectScope: "studio",
      resolution: "4k",
      fps: 24,
      aspectRatio: "16:9",
      quality: "high",
      fit: "crop",
      audioSource: "separate",
      scenes: [
        {
          path: "user/shot.jpg",
          kind: "image",
          frames: 24,
          sceneId: "scene-1",
          movement: "push",
          entrance: "flash",
          overlay: "హనుమంతుడు",
        },
      ],
      audio: [],
    };
    expect(proRenderManifest.parse(input).scenes[0].sceneId).toBe("scene-1");
    expect(
      proRenderManifest.safeParse({
        ...input,
        scenes: [{ ...input.scenes[0], movement: "arbitrary-filter" }],
      }).success,
    ).toBe(false);
  });
});
