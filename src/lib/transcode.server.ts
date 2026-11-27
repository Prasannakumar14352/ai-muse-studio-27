import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { exportDimensions, exportEncoding, type VideoExportSettings } from "./video-export";
// Server-side MP4 conversion with ffmpeg.
//
// The browser can only record WebM (Chrome/Firefox) at the canvas size, and
// that WebM has no duration in its header ("Infinity" in players, no seeking).
// Instagram Reels and YouTube Shorts want H.264 MP4 at 1080×1920, so every
// rendered video is converted here: scaled/padded to 1080p, H.264 High +
// AAC, `+faststart` so the duration and index sit at the front of the file.

import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TranscodeShape = "vertical" | "landscape" | "square";

const SIZE: Record<TranscodeShape, [number, number]> = {
  vertical: [1080, 1920],
  landscape: [1920, 1080],
  square: [1080, 1080],
};

const RUNTIME_BIN = "/tmp/cf-ffmpeg";
const RELEASE_URL = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz";

/**
 * Path to an ffmpeg binary. Uses the one bundled by `ffmpeg-static`; if the
 * deploy didn't include it (serverless bundlers sometimes drop binaries), it
 * downloads the same static build into /tmp once per warm instance.
 */
async function ffmpegPath(): Promise<string> {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default?: string | null } | string;
    const p = typeof mod === "string" ? mod : mod.default;
    if (p && existsSync(p)) return p;
  } catch { /* not bundled */ }
  if (existsSync(RUNTIME_BIN)) return RUNTIME_BIN;
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("ffmpeg binary is not available on this server");
  }
  const res = await fetch(RELEASE_URL);
  if (!res.ok) throw new Error(`Couldn't fetch ffmpeg (${res.status})`);
  const gz = new Uint8Array(await res.arrayBuffer());
  const tmp = `${RUNTIME_BIN}.${process.pid}`;
  await writeFile(tmp, gunzipSync(gz));
  await chmod(tmp, 0o755);
  await rename(tmp, RUNTIME_BIN);
  return RUNTIME_BIN;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Video conversion took too long"));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.split("\n").slice(-4).join(" ")}`));
    });
  });
}

/** Convert any browser recording to an upload-ready H.264 MP4. */
const probeFile = promisify(execFile);

async function probe(path: string) {
  const { stdout } = await probeFile(process.env.FFPROBE_PATH || "ffprobe", [
    "-v", "error", "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm", "-show_streams", "-show_format", "-of", "json", path,
  ], { timeout: 10_000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{ codec_type: string; codec_name: string; width?: number; height?: number;
      avg_frame_rate?: string; pix_fmt?: string; sample_rate?: string }>;
  };
}

export async function transcodeToMp4(
  input: Uint8Array, shape: TranscodeShape, settings?: VideoExportSettings,
): Promise<Uint8Array> {
  const [w, h] = settings ? exportDimensions(settings.resolution, settings.aspectRatio) : SIZE[shape];
  const fps = settings?.fps ?? 30;
  const encoding = settings ? exportEncoding(settings) : undefined;
  const dir = await mkdtemp(join(tmpdir(), "cf-transcode-"));
  const inPath = join(dir, "in");
  const outPath = join(dir, "out.mp4");
  try {
    await writeFile(inPath, input);
    // The browser records at ~4 Mbit/s (~30 MB a minute). Past ~2 minutes,
    // trade a little compression for speed so mid-length videos finish in time.
    const preset = input.byteLength > 60 * 1024 * 1024 ? "superfast" : "veryfast";
    const bin = await ffmpegPath();
    const source = settings ? await probe(inPath) : undefined;
    if (source && !source.streams?.some((stream) => stream.codec_type === "video")) {
      throw new Error("Export source has no video stream");
    }
    const sourceDuration = Number(source?.format?.duration);
    if (Number.isFinite(sourceDuration) && (sourceDuration <= 0 || sourceDuration > 1800)) {
      throw new Error("Export source duration exceeds the supported range");
    }
    const existingVideo = source?.streams?.find((stream) => stream.codec_type === "video");
    const existingAudio = source?.streams?.find((stream) => stream.codec_type === "audio");
    const existingFps = existingVideo?.avg_frame_rate?.split("/").map(Number);
    const matchingVideo = existingVideo?.codec_name === "h264" && existingVideo.pix_fmt === "yuv420p" &&
      existingVideo.width === w && existingVideo.height === h && existingFps?.[1] &&
      existingFps[0] / existingFps[1] === fps;
    const videoArgs = matchingVideo ? ["-c:v", "copy"] : [
      "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
        `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},format=yuv420p`,
      "-c:v", "libx264", "-preset", preset, "-crf", String(encoding?.crf ?? 20), "-profile:v", "high",
    ];
    const audioArgs = existingAudio?.codec_name === "aac" && existingAudio.sample_rate === "48000"
      ? ["-c:a", "copy"]
      : ["-c:a", "aac", "-b:a", `${encoding?.audioKbps ?? 160}k`, "-ar", "48000"];
    await run(
      bin,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        // WebM from MediaRecorder has bogus timestamps; regenerate them.
        "-fflags", "+genpts",
        "-protocol_whitelist", "file", "-format_whitelist", "mov,matroska,webm", "-i", inPath,
        "-map", "0:v:0", "-map", "0:a:0?",
        ...videoArgs, ...audioArgs,
        "-movflags", "+faststart",
        outPath,
      ],
      // Stay just under the 300 s default function limit so a slow
      // conversion fails cleanly (the caller keeps the WebM) instead of the
      // platform killing the request.
      285_000,
    );
    if (settings) {
      const output = await probe(outPath);
      const video = output.streams?.find((stream) => stream.codec_type === "video");
      const audio = output.streams?.find((stream) => stream.codec_type === "audio");
      const [num, den] = (video?.avg_frame_rate ?? "").split("/").map(Number);
      const duration = Number(output.format?.duration);
      if (!video || video.codec_name !== "h264" || video.pix_fmt !== "yuv420p" ||
        video.width !== w || video.height !== h || !den || Math.abs(num / den - fps) > 0.05 ||
        !Number.isFinite(duration) || duration <= 0 ||
        (Number.isFinite(sourceDuration) && Math.abs(sourceDuration - duration) > 0.25) ||
        (source?.streams?.some((stream) => stream.codec_type === "audio") &&
          (!audio || audio.codec_name !== "aac" || audio.sample_rate !== "48000"))) {
        throw new Error("Final MP4 does not match the export settings");
      }
    }
    return new Uint8Array(await readFile(outPath));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
