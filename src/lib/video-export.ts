import { z } from "zod";

export const browserExportSchema = z.object({
  resolution: z.enum(["720p", "1080p"]),
  fps: z.union([z.literal(24), z.literal(30)]),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  quality: z.enum(["standard", "high", "maximum"]),
  format: z.enum(["mp4", "webm"]),
  fit: z.enum(["fit", "crop"]),
  subtitles: z.boolean(),
});
export type VideoExportSettings = z.infer<typeof browserExportSchema>;

export function defaultVideoExport(
  aspectRatio: VideoExportSettings["aspectRatio"],
): VideoExportSettings {
  return {
    resolution: "720p",
    fps: 30,
    aspectRatio,
    quality: "standard",
    format: "mp4",
    fit: "crop",
    subtitles: true,
  };
}

export function exportDimensions(
  resolution: VideoExportSettings["resolution"] | "4k",
  aspectRatio: VideoExportSettings["aspectRatio"],
): [number, number] {
  const height = { "720p": 720, "1080p": 1080, "4k": 2160 }[resolution];
  const width = Math.round((height * 16) / 9);
  if (aspectRatio === "1:1") return [height, height];
  return aspectRatio === "9:16" ? [height, width] : [width, height];
}

export function exportEncoding(settings: VideoExportSettings) {
  const quality = {
    standard: { multiplier: 1, crf: 23, audioKbps: 128 },
    high: { multiplier: 1.5, crf: 19, audioKbps: 192 },
    maximum: { multiplier: 2, crf: 16, audioKbps: 256 },
  }[settings.quality];
  const base = settings.resolution === "1080p" ? 8_000_000 : 4_000_000;
  return { ...quality, videoBps: base * quality.multiplier };
}
