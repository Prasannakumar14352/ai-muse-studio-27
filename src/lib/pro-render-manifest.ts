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
    sceneId: z.string().min(1).max(80).optional(),
    movement: z.enum(["static", "push", "pull", "pan-left", "pan-right"]).default("static"),
    overlay: z.string().max(240).optional(),
    entrance: z.enum(["cut", "flash"]).default("cut"),
    kind: z.enum(["image", "clip"]),
    frames: z.number().int().min(1).max(900),
    trimFrame: z.number().int().min(0).max(5400).default(0),
    nativeGain: z.number().min(0).max(1).default(0),
  })
  .strict();
const layer = z
  .object({
    path: storagePath,
    rate: z.number().min(1).max(1.35).default(1),
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
    version: z.union([z.literal(1), z.literal(2)]),
    projectId: z.string().uuid(),
    projectScope: z.enum(["cloud", "studio"]).default("cloud"),
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
    if (
      manifest.version === 1 &&
      (manifest.projectScope === "studio" ||
        manifest.scenes.some(
          (item) =>
            item.overlay !== undefined || item.movement !== "static" || item.entrance !== "cut",
        ) ||
        manifest.audio.some((item) => item.rate !== 1))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Studio effects and playback rate require manifest v2",
      });
    }
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
