import { z } from "zod";

const storagePath = z
  .string()
  .min(3)
  .max(240)
  .regex(/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/)
  .refine((value) => !value.startsWith("/") && !value.includes("//"));
const scene = z
  .object({
    path: storagePath,
    kind: z.enum(["image", "clip"]),
    frames: z.number().int().min(1).max(900),
    trimFrame: z.number().int().min(0).max(5400).default(0),
    nativeGain: z.number().min(0).max(1).default(0),
  })
  .strict();
const layer = z
  .object({
    path: storagePath,
    track: z.enum(["narration", "music", "ambience", "sfx"]),
    startFrame: z.number().int().min(0),
    frames: z.number().int().min(1),
    gain: z.number().min(0).max(1),
    loop: z.boolean().default(false),
    fadeFrames: z.number().int().min(0).max(150).default(0),
  })
  .strict();

export const proRenderManifest = z
  .object({
    version: z.literal(1),
    projectId: z.string().uuid(),
    resolution: z.enum(["720p", "1080p", "4k"]),
    fps: z.union([z.literal(24), z.literal(30)]),
    aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
    quality: z.enum(["standard", "high", "maximum"]),
    fit: z.enum(["fit", "crop"]),
    audioSource: z.enum(["separate", "native", "hybrid"]),
    duckMusic: z.boolean().default(true),
    scenes: z.array(scene).min(1).max(40),
    audio: z.array(layer).max(48),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const frames = manifest.scenes.reduce((sum, item) => sum + item.frames, 0);
    if (
      frames > manifest.fps * 180 ||
      manifest.audio.some((item) => item.startFrame + item.frames > frames)
    ) {
      ctx.addIssue({ code: "custom", message: "Render timeline exceeds its bounds" });
    }
    if (
      (manifest.audioSource === "native" && manifest.audio.length) ||
      manifest.scenes.some(
        (item) =>
          item.nativeGain > 0 && (item.kind !== "clip" || manifest.audioSource === "separate"),
      )
    ) {
      ctx.addIssue({ code: "custom", message: "Audio tracks conflict with the audio source" });
    }
  });

export type ProRenderManifest = z.infer<typeof proRenderManifest>;
