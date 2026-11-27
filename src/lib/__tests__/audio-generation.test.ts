import { afterEach, describe, expect, it, vi } from "vitest";
import {
  audioCostUsd,
  audioCredits,
  audioRequest,
  AUDIO_MODELS,
  buildAudioProviderInput,
} from "../audio-generation";
import { maximumAudioCredits, planVideoAudio } from "../audio-plan";
import { audioPlacements, mixWindows, scheduleAudioMix } from "../audio-mixer";
import { falPoll, falSubmit } from "../fal.server";
import { isMp3 } from "../audio-provider.server";

const jobId = "087674c0-30ab-4e2c-a02a-dcd97ec35949";
const input = {
  jobId,
  track: "music" as const,
  slot: 0,
  revision: 0,
  prompt: "Original score",
  duration: 30,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("documented audio contracts", () => {
  it("submits music with integer milliseconds and instrumental safety settings", () => {
    expect(buildAudioProviderInput(input)).toEqual({
      prompt: "Original score",
      music_length_ms: 30000,
      force_instrumental: true,
      output_format: "mp3_48000_192",
      enable_safety_checker: true,
    });
  });

  it("uses the same effects API for ambience with looping enabled", () => {
    const sfx = buildAudioProviderInput({ ...input, track: "sfx", duration: 0.5 });
    expect(sfx).toEqual({
      text: "Original score",
      duration_seconds: 0.5,
      prompt_influence: 0.5,
      loop: false,
      output_format: "mp3_44100_128",
      enable_safety_checker: true,
    });
    expect(buildAudioProviderInput({ ...input, track: "ambience" })).toMatchObject({ loop: true });
  });

  it("enforces model duration, slot, and input boundaries", () => {
    for (const duration of [3, 600])
      expect(audioRequest.safeParse({ ...input, duration }).success).toBe(true);
    for (const duration of [2.99, 600.01, Infinity]) {
      expect(audioRequest.safeParse({ ...input, duration }).success).toBe(false);
    }
    expect(audioRequest.safeParse({ ...input, track: "sfx", duration: 30 }).success).toBe(true);
    expect(audioRequest.safeParse({ ...input, track: "sfx", duration: 30.01 }).success).toBe(false);
    expect(audioRequest.safeParse({ ...input, track: "ambience", slot: 3 }).success).toBe(false);
  });

  it("rounds music billing up by minute and uses per-second effects billing", () => {
    expect([30, 60, 60.001, 90].map((seconds) => audioCostUsd("music", seconds))).toEqual([
      0.6, 0.6, 1.2, 1.2,
    ]);
    expect(audioCredits("music", 30)).toBe(112);
    expect(audioCredits("sfx", 3)).toBe(2);
    expect(audioCredits("ambience", 15)).toBe(6);
  });

  it.each(["music", "sfx", "ambience"] as const)(
    "reads the REST envelope for %s",
    async (track) => {
      vi.stubEnv("FAL_KEY", "test-only");
      const statusUrl = "https://queue.fal.run/test/status";
      const responseUrl = "https://queue.fal.run/test";
      const output = "https://v3.fal.media/files/test.mp3";
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ request_id: "test", status_url: statusUrl, response_url: responseUrl }),
        )
        .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
        .mockResolvedValueOnce(Response.json({ audio: { url: output } }));
      vi.stubGlobal("fetch", fetchMock);
      const submitted = await falSubmit(
        AUDIO_MODELS[track],
        buildAudioProviderInput({ ...input, track }),
      );
      expect(fetchMock.mock.calls[0][0]).toBe(`https://queue.fal.run/${AUDIO_MODELS[track]}`);
      await expect(falPoll(submitted.statusUrl, submitted.responseUrl, "audio")).resolves.toEqual({
        state: "completed",
        outputUrl: output,
      });
    },
  );

  it("rejects missing credentials before fetch", async () => {
    vi.stubEnv("FAL_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(falSubmit(AUDIO_MODELS.music, {})).rejects.toThrow("FAL_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats rate limits as pending and rejects a completed response with no audio", async () => {
    vi.stubEnv("FAL_KEY", "test-only");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
        .mockResolvedValueOnce(Response.json({}, { status: 429 }))
        .mockResolvedValueOnce(Response.json({ status: "COMPLETED" }))
        .mockResolvedValueOnce(Response.json({ audio: {} })),
    );
    await expect(
      falPoll("https://queue.fal.run/status", "https://queue.fal.run/result", "audio"),
    ).resolves.toEqual({ state: "pending" });
    await expect(
      falPoll("https://queue.fal.run/status", "https://queue.fal.run/result", "audio"),
    ).resolves.toMatchObject({ state: "failed" });
  });

  it("rejects non-audio and structurally truncated MP3 data", () => {
    expect(isMp3(new TextEncoder().encode("<html>bad gateway</html>"))).toBe(false);
    const frames = new Uint8Array(834);
    frames.set([255, 251, 144, 0], 0);
    frames.set([255, 251, 144, 0], 417);
    expect(isMp3(frames)).toBe(true);
    expect(isMp3(frames.slice(0, -1))).toBe(false);
  });
});

const scenes = [
  { n: 1, audioSceneId: "ocean", visual: "Hanuman overlooks ocean waves", image_prompt: "" },
  { n: 2, audioSceneId: "leap", visual: "Hanuman leaps above the ocean", image_prompt: "" },
  { n: 3, audioSceneId: "temple", visual: "Temple in Golden Lanka", image_prompt: "" },
];
const story = {
  jobId,
  title: "Hanuman",
  style: "Indian Mythology",
  musicDirection: "Divine orchestral",
  duration: 30,
  scenes,
};

describe("audio planning and final timeline", () => {
  it("plans no paid calls for a legacy project or disabled audio", () => {
    expect(planVideoAudio(story)).toEqual([]);
    expect(maximumAudioCredits({}, 30)).toBe(0);
  });

  it("groups ambience and uses stable IDs for action-specific cues", () => {
    const tracks = planVideoAudio({
      ...story,
      settings: { backgroundMusicEnabled: true, ambienceEnabled: true, soundEffectsEnabled: true },
    });
    expect(tracks.find((track) => track.request.track === "music")?.request.prompt).toContain(
      "Divine orchestral",
    );
    expect(tracks.find((track) => track.request.track === "sfx")?.sceneIds).toEqual(["leap"]);
    expect(tracks.find((track) => track.request.track === "ambience")?.sceneIds).toEqual([
      "ocean",
      "leap",
    ]);
  });

  it("places effects on reordered and trimmed scenes and drops removed scenes", () => {
    const windows = mixWindows([1, 2, 3], ["leap", "leap", "ocean"]);
    expect(audioPlacements("sfx", ["leap", "temple"], 0.25, windows, 6)).toEqual([
      { start: 0.25, end: 3, sceneId: "leap" },
    ]);
    expect(audioPlacements("ambience", ["leap", "ocean"], 0, windows, 6)[0].end).toBe(6);
    expect(audioPlacements("sfx", ["ocean"], 3, windows, 6)).toEqual([]);
  });

  it("schedules looping music without narration and stops at video end", () => {
    const parameter = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    });
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const source = {
      ...node(),
      playbackRate: parameter(),
      start: vi.fn(),
      stop: vi.fn(),
      loop: false,
    };
    const makeGain = vi.fn(() => ({ ...node(), gain: parameter() }));
    const context = {
      createGain: makeGain,
      createDynamicsCompressor: () => ({ ...node(), threshold: parameter(), ratio: parameter() }),
      createBufferSource: () => source,
    } as unknown as BaseAudioContext;
    scheduleAudioMix({
      context,
      destination: {} as AudioNode,
      time: 2,
      durations: [4],
      sceneIds: ["a"],
      narration: [],
      rates: [],
      cuts: [],
      settings: { voiceoverEnabled: false, musicVolume: 0.2 },
      assets: [{ track: "music", sceneIds: [], offset: 0, buffer: { duration: 1 } as AudioBuffer }],
    });
    expect(source.loop).toBe(true);
    expect(source.start).toHaveBeenCalledWith(2);
    expect(source.stop).toHaveBeenCalledWith(6);
    expect(makeGain.mock.results[1].value.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0.2,
      3,
    );
  });
});
