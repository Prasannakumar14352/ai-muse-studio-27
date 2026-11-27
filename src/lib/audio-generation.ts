import { z } from "zod";
import { CREDIT_FLOOR_USD, MARKUP } from "./model-catalog";

export const AUDIO_PRICING_VERSION = "2026-11-27";
export const AUDIO_MODELS = {
  music: "elevenlabs/music/v2.5",
  sfx: "elevenlabs/sound-effects/v3",
  ambience: "elevenlabs/sound-effects/v3",
} as const;

export const AUDIO_MOODS = [
  "Auto",
  "Epic cinematic",
  "Divine orchestral",
  "Indian devotional instrumental",
  "Adventure",
  "Emotional piano",
  "Suspense",
  "Dark cinematic",
  "Peaceful",
  "Corporate",
  "Futuristic",
  "Upbeat",
] as const;

export const DEFAULT_AUDIO_SETTINGS = {
  voiceoverEnabled: true,
  backgroundMusicEnabled: false,
  soundEffectsEnabled: false,
  ambienceEnabled: false,
  musicMood: "Auto" as (typeof AUDIO_MOODS)[number],
  musicPrompt: "",
  narrationVolume: 1,
  musicVolume: 0.25,
  sfxVolume: 0.5,
  ambienceVolume: 0.15,
  autoDucking: true,
  loopMusic: true,
  fadeInSeconds: 1,
  fadeOutSeconds: 2,
};

export type AudioSettings = Partial<typeof DEFAULT_AUDIO_SETTINGS>;
export type AudioTrackType = keyof typeof AUDIO_MODELS;

export const AUDIO_LIMITS = { music: 1, sfx: 4, ambience: 3 } as const;

export const audioRequest = z
  .object({
    jobId: z.string().uuid(),
    track: z.enum(["music", "sfx", "ambience"]),
    slot: z.number().int().nonnegative(),
    revision: z.number().int().min(0).max(2).default(0),
    prompt: z.string().trim().min(3).max(1200),
    duration: z.number().finite(),
  })
  .superRefine((input, ctx) => {
    const min = input.track === "music" ? 3 : 0.5;
    const max = input.track === "music" ? 600 : 30;
    if (
      /\b(?:imitate|soundalike|in the style of|cover version of|sample the recording)\b/i.test(
        input.prompt,
      )
    ) {
      ctx.addIssue({ code: "custom", message: "Request an original audio asset" });
    }
    if (input.duration < min || input.duration > max || input.slot >= AUDIO_LIMITS[input.track]) {
      ctx.addIssue({ code: "custom", message: "Audio duration or track count exceeds limits" });
    }
  })
  .transform((input) => ({
    ...input,
    duration: input.track === "music" ? Math.round(input.duration * 1000) / 1000 : input.duration,
  }));

export type AudioRequest = z.infer<typeof audioRequest>;

export function audioCostUsd(track: AudioTrackType, seconds: number) {
  return track === "music" ? Math.ceil(seconds / 60) * 0.6 : seconds * 0.002;
}

export function audioCredits(track: AudioTrackType, seconds: number) {
  return Math.max(1, Math.ceil((audioCostUsd(track, seconds) * MARKUP) / CREDIT_FLOOR_USD));
}

export function buildAudioProviderInput(input: AudioRequest) {
  if (input.track === "music") {
    return {
      prompt: input.prompt,
      music_length_ms: Math.round(input.duration * 1000),
      force_instrumental: true,
      output_format: "mp3_48000_192",
      enable_safety_checker: true,
    };
  }
  return {
    text: input.prompt,
    duration_seconds: input.duration,
    prompt_influence: 0.5,
    loop: input.track === "ambience",
    output_format: "mp3_44100_128",
    enable_safety_checker: true,
  };
}

export type GeneratedAudio = {
  assetId: string;
  track: AudioTrackType;
  status: "submitting" | "queued" | "ready" | "failed" | "uncertain";
  credits: number;
  duration: number;
  url?: string;
  error?: string;
};
