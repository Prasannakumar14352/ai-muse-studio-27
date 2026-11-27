import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultVideoExport, exportDimensions, browserExportSchema } from "../video-export";
import { proRenderManifest } from "../pro-render-manifest";
import { transcodeToMp4 } from "../transcode.server";
import { validateVeoImage, veoRequest } from "../veo-motion.server";

afterEach(() => vi.unstubAllEnvs());

describe("professional export settings", () => {
  it("keeps browser defaults and maps source-independent canvas dimensions", () => {
    expect(defaultVideoExport("9:16")).toMatchObject({
      fps: 30,
      resolution: "720p",
      format: "mp4",
    });
    expect(exportDimensions("1080p", "16:9")).toEqual([1920, 1080]);
    expect(exportDimensions("1080p", "9:16")).toEqual([1080, 1920]);
    expect(exportDimensions("720p", "1:1")).toEqual([720, 720]);
    expect(exportDimensions("4k", "1:1")).toEqual([2160, 2160]);
    expect(
      browserExportSchema.safeParse({ ...defaultVideoExport("16:9"), resolution: "4k" }).success,
    ).toBe(false);
  });

  const manifest = {
    version: 1,
    projectId: "087674c0-30ab-4e2c-a02a-dcd97ec35949",
    resolution: "4k",
    fps: 24,
    aspectRatio: "16:9",
    quality: "standard",
    fit: "fit",
    audioSource: "hybrid",
    scenes: [{ kind: "clip", path: "user/clip.mp4", frames: 24, nativeGain: 0.5 }],
    audio: [{ path: "user/music.mp3", track: "music", frames: 24, startFrame: 0, gain: 0.2 }],
  };

  it("rejects unsafe paths, unsupported transitions and tracks outside the timeline", () => {
    expect(proRenderManifest.safeParse(manifest).success).toBe(true);
    expect(proRenderManifest.safeParse({ ...manifest, audioSource: "native" }).success).toBe(false);
    expect(
      proRenderManifest.safeParse({
        ...manifest,
        scenes: [{ ...manifest.scenes[0], path: "user/../clip.mp4" }],
      }).success,
    ).toBe(false);
    expect(
      proRenderManifest.safeParse({
        ...manifest,
        scenes: [{ ...manifest.scenes[0], transition: "fade" }],
      }).success,
    ).toBe(false);
    expect(
      proRenderManifest.safeParse({ ...manifest, audio: [{ ...manifest.audio[0], startFrame: 1 }] })
        .success,
    ).toBe(false);
  });

  it("validates Veo media kind, resolution and aspect ratio independently of browser export", () => {
    const input = {
      model: "veo-fast",
      jobId: manifest.projectId,
      shotId: "shot-1",
      prompt: "Animate the subject",
      image: "data:image/png;base64,iVBORw0KGgo=",
      beatSeconds: 3.5,
      aspectRatio: "16:9",
      resolution: "1080p",
      nativeAudio: true,
    };
    expect(veoRequest.safeParse(input).success).toBe(true);
    expect(veoRequest.safeParse({ ...input, resolution: "4k" }).success).toBe(false);
    expect(veoRequest.safeParse({ ...input, aspectRatio: "1:1" }).success).toBe(false);
    expect(validateVeoImage(input.image)).toBe(true);
    expect(validateVeoImage("https://example.com/public.jpg")).toBe(false);
    expect(validateVeoImage("data:image/png;base64,SGVsbG8=")).toBe(false);
  });
});

const ffmpeg = process.env.FFMPEG_PATH ?? "/usr/bin/ffmpeg";
const ffprobe = process.env.FFPROBE_PATH ?? "/usr/bin/ffprobe";
let mediaTools = true;
try {
  execFileSync(ffmpeg, ["-version"]);
  execFileSync(ffprobe, ["-version"]);
} catch {
  mediaTools = false;
}

it.skipIf(!mediaTools)(
  "encodes and probes configured 1080p / 24 FPS with AAC",
  async () => {
    vi.stubEnv("FFMPEG_PATH", ffmpeg);
    vi.stubEnv("FFPROBE_PATH", ffprobe);
    const dir = await mkdtemp(join(tmpdir(), "professional-export-test-"));
    try {
      const input = join(dir, "source.webm");
      execFileSync(ffmpeg, [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:d=1:r=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-c:v",
        "libvpx-vp9",
        "-c:a",
        "libopus",
        "-shortest",
        input,
      ]);
      const result = await transcodeToMp4(await readFile(input), "landscape", {
        ...defaultVideoExport("16:9"),
        resolution: "1080p",
        fps: 24,
      });
      const output = join(dir, "out.mp4");
      await writeFile(output, result);
      const metadata = JSON.parse(
        execFileSync(ffprobe, ["-v", "error", "-show_streams", "-of", "json", output], {
          encoding: "utf8",
        }),
      );
      expect(metadata.streams[0]).toMatchObject({
        width: 1920,
        height: 1080,
        avg_frame_rate: "24/1",
      });
      expect(metadata.streams[1]).toMatchObject({ codec_name: "aac", sample_rate: "48000" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  30000,
);
