import { describe, expect, it, vi } from "vitest";
import { duckUnderSpeech, scheduleAudioMix } from "../audio-mixer";
import { fitNarrationToSlots, slotsForTarget } from "../render-timeline";

// Regression: "voiceover is overlapping". Two sources of overlap are covered:
// 1) one scene's narration still playing when the next scene's narration starts;
// 2) speech baked into AI clips (hybrid/native clip audio) talking over the voiceover.

function fakeContext() {
  const sources: Array<{ start: number; stop: number }> = [];
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const context = {
    createGain: () => ({ ...node(), gain: parameter() }),
    createDynamicsCompressor: () => ({ ...node(), threshold: parameter(), ratio: parameter() }),
    createBufferSource: () => {
      const entry = { start: 0, stop: 0 };
      sources.push(entry);
      return {
        ...node(),
        playbackRate: parameter(),
        loop: false,
        start: (t: number) => (entry.start = t),
        stop: (t: number) => (entry.stop = t),
      };
    },
  } as unknown as BaseAudioContext;
  return { context, sources };
}

describe("voiceover never overlaps itself", () => {
  it("fits long narration into fixed-length slots without spilling into the next scene", () => {
    // 60s Short, 15 scenes, narration far longer than the slots (the reported case).
    const planned = Array.from({ length: 15 }, () => 4);
    const slots = slotsForTarget(planned, 60);
    const audio = Array.from({ length: 15 }, (_, i) => 5.5 + (i % 3)); // 5.5–7.5s lines
    const fits = fitNarrationToSlots(slots, audio);
    const { context, sources } = fakeContext();
    const { speech } = scheduleAudioMix({
      context,
      destination: {} as AudioNode,
      time: 0,
      durations: slots,
      sceneIds: slots.map((_, i) => String(i)),
      narration: audio.map((duration) => ({ duration }) as AudioBuffer),
      rates: fits.map((fit) => fit.rate),
      cuts: fits.map((fit) => (fit.trimmed ? fit.playSec : null)),
      assets: [],
      settings: { voiceoverEnabled: true, narrationVolume: 1 },
    });
    expect(sources).toHaveLength(15);
    let sceneStart = 0;
    sources.forEach((s, i) => {
      expect(s.start).toBeCloseTo(sceneStart, 6);
      // Each line stops before its own slot ends, so it can't run under the next line.
      expect(s.stop).toBeLessThanOrEqual(sceneStart + slots[i] + 1e-6);
      if (i > 0) expect(s.start).toBeGreaterThanOrEqual(sources[i - 1].stop - 1e-6);
      sceneStart += slots[i];
    });
    expect(speech.length).toBeGreaterThan(0);
  });

  it("ducks clip audio whenever the voiceover is speaking", () => {
    const gain = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    } as unknown as AudioParam;
    duckUnderSpeech(gain, 0.5, [{ start: 1, end: 3 }], 10);
    const ramps = (gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls;
    expect(ramps[0]).toEqual([0.5 * 0.12, 11]); // down when speech starts
    expect(ramps[1]).toEqual([0.5, 13.25]); // back up after release
  });
});
