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
export async function transcodeToMp4(input: Uint8Array, shape: TranscodeShape): Promise<Uint8Array> {
  const [w, h] = SIZE[shape];
  const dir = await mkdtemp(join(tmpdir(), "cf-transcode-"));
  const inPath = join(dir, "in");
  const outPath = join(dir, "out.mp4");
  try {
    await writeFile(inPath, input);
    // The browser records at ~4 Mbit/s (~30 MB a minute). Past ~2 minutes,
    // trade a little compression for speed so mid-length videos finish in time.
    const preset = input.byteLength > 60 * 1024 * 1024 ? "superfast" : "veryfast";
    const bin = await ffmpegPath();
    await run(
      bin,
      [
        "-hide_banner", "-loglevel", "error", "-y",
        // WebM from MediaRecorder has bogus timestamps; regenerate them.
        "-fflags", "+genpts",
        "-i", inPath,
        "-vf",
        `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,` +
          `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p`,
        "-c:v", "libx264", "-preset", preset, "-crf", "20",
        "-profile:v", "high", "-level", "4.1",
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-movflags", "+faststart",
        outPath,
      ],
      // Stay just under the 300 s default function limit so a slow
      // conversion fails cleanly (the caller keeps the WebM) instead of the
      // platform killing the request.
      285_000,
    );
    return new Uint8Array(await readFile(outPath));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
