// Client-side video renderer: draws each scene onto a canvas and records with
// MediaRecorder. Produces a real downloadable file (MP4 where the browser
// supports it, WebM as fallback) — no server dependency required.

import { getStyle } from "./constants";
import { deductUsage } from "./access";

export type RenderScene = { n: number; visual: string; voiceover: string; duration: string; on_screen_text?: string };

export type RenderOptions = {
  title: string;
  platform?: string | null;
  scenes: RenderScene[];
  styleId?: string | null;
  contentType?: string | null; // "long_video" | "short_reel" | ...
  fps?: number;
  onProgress?: (p: number) => void; // 0..1
  sceneImages?: Array<string | null>;
  sceneAudio?: Array<AudioBuffer | null>;
  fitToAudio?: boolean;
  /** Cancel the render mid-flight — recorder stops and result rejects with AbortError. */
  signal?: AbortSignal;
  /** Force a specific container/codec instead of the browser's best choice. Used by the codec-fallback retry. */
  preferredContainer?: "webm" | "mp4";
  /** When false, on_screen_text overlays are not drawn. Defaults to true. */
  showOnScreenText?: boolean;
};

export type RenderResult = {
  blob: Blob;
  mimeType: string;
  extension: "mp4" | "webm";
  durationSec: number;
};

function parseDuration(d: string): number {
  const n = parseFloat(d);
  return isNaN(n) ? 3 : Math.max(1.5, n);
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Same-origin bundled assets don't need CORS; setting it can cause
    // legitimate loads to be treated as errors in some setups.
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function pickRecorderMime(preferred?: "webm" | "mp4"): { mime: string; ext: "mp4" | "webm" } {
  const webmCandidates: Array<{ mime: string; ext: "mp4" | "webm" }> = [
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp9", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  const mp4Candidates: Array<{ mime: string; ext: "mp4" | "webm" }> = [
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
    { mime: "video/mp4;codecs=avc1.42E01E", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
  ];
  const order =
    preferred === "mp4" ? [...mp4Candidates, ...webmCandidates]
    : preferred === "webm" ? [...webmCandidates, ...mp4Candidates]
    : [...webmCandidates, ...mp4Candidates];
  for (const c of order) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return { mime: "video/webm", ext: "webm" };
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  scene: RenderScene,
  opts: {
    progress: number; accent: string; showOnScreenText?: boolean;
  },
) {
  const { width: W, height: H } = ctx.canvas;

  // Ken Burns zoom on the underlying image.
  const zoom = 1.05 + opts.progress * 0.1;
  ctx.fillStyle = "#0b0b16";
  ctx.fillRect(0, 0, W, H);
  if (img) {
    const iw = img.width;
    const ih = img.height;
    const ratio = Math.max(W / iw, H / ih) * zoom;
    const dw = iw * ratio;
    const dh = ih * ratio;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  } else {
    // Fallback: gradient backdrop tinted with the style accent.
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, opts.accent);
    g.addColorStop(1, "#0b0b16");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Bottom gradient so the voiceover caption stays readable.
  const grad = ctx.createLinearGradient(0, H * 0.55, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.88)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const sidePad = Math.round(W * 0.06);
  ctx.textBaseline = "top";

  // Optional on-screen text — big bold headline near the top, only when the
  // script explicitly provides one. No scene numbers, no chips, no titles.
  const onScreen = opts.showOnScreenText === false ? "" : (scene.on_screen_text ?? "").trim();
  if (onScreen) {
    const topGrad = ctx.createLinearGradient(0, 0, 0, H * 0.35);
    topGrad.addColorStop(0, "rgba(0,0,0,0.55)");
    topGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, H * 0.35);

    ctx.font = `800 ${Math.round(H * 0.055)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 12;
    wrapText(ctx, onScreen, sidePad, Math.round(H * 0.08), W - sidePad * 2, Math.round(H * 0.065), 3);
    ctx.shadowBlur = 0;
  }

  // Voiceover as clean caption text at the bottom — no icons, no prefixes.
  const vo = (scene.voiceover ?? "").trim();
  if (vo) {
    ctx.font = `600 ${Math.round(H * 0.03)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 10;
    const voY = H - Math.round(H * 0.15);
    wrapText(ctx, vo, sidePad, voY, W - sidePad * 2, Math.round(H * 0.038), 3);
    ctx.shadowBlur = 0;
  }
}


function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxWidth: number, lineHeight: number, maxLines = 4,
) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && line !== "") {
      ctx.fillText(line.trim(), x, y);
      line = words[i] + " ";
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines - 1) {
        // last line: draw remaining truncated
        const rest = words.slice(i).join(" ");
        ctx.fillText(truncate(rest, 90), x, y);
        return;
      }
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y);
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

export async function renderVideo(opts: RenderOptions): Promise<RenderResult> {
  const style = getStyle(opts.styleId);
  const isVertical =
    opts.contentType === "short_reel" ||
    opts.platform === "tiktok" ||
    opts.platform === "instagram";
  const W = isVertical ? 720 : 1280;
  const H = isVertical ? 1280 : 720;
  const fps = opts.fps ?? 30;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const rawCtx = canvas.getContext("2d");
  if (!rawCtx) throw new Error("Canvas 2D not supported");
  const ctx: CanvasRenderingContext2D = rawCtx;

  // Load style fallback + per-scene AI images in parallel.
  const [fallbackImg, ...sceneImgs] = await Promise.all([
    loadImage(style.image),
    ...opts.scenes.map((_, i) => {
      const src = opts.sceneImages?.[i];
      return src ? loadImage(src) : Promise.resolve<HTMLImageElement | null>(null);
    }),
  ]);

  // Scene durations — stretched to fit voiceover audio when requested so the
  // audio never cuts off mid-sentence.
  const durations = opts.scenes.map((s, i) => {
    const base = parseDuration(s.duration);
    if (opts.fitToAudio && opts.sceneAudio?.[i]) {
      return Math.max(base, opts.sceneAudio[i]!.duration + 0.25);
    }
    return base;
  });
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  // Build a mixed audio stream from per-scene voiceover buffers.
  // We schedule each buffer at that scene's start on a single AudioContext,
  // route through a MediaStreamAudioDestinationNode, and pass that stream's
  // audio track into the MediaRecorder alongside the video track.
  const hasAudio = !!opts.sceneAudio?.some((b) => b);
  let audioCtx: AudioContext | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  if (hasAudio) {
    audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
    audioDest = audioCtx.createMediaStreamDestination();
  }

  const videoStream = canvas.captureStream(fps);
  const combined = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
  if (audioDest) audioDest.stream.getAudioTracks().forEach((t) => combined.addTrack(t));

  const { mime, ext } = pickRecorderMime(opts.preferredContainer);
  const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  drawScene(ctx, sceneImgs[0] ?? fallbackImg, opts.scenes[0], {
    progress: 0, accent: style.accent, showOnScreenText: opts.showOnScreenText,
  });

  recorder.start(250);

  if (audioCtx && audioDest && opts.sceneAudio) {
    const t0 = audioCtx.currentTime + 0.05;
    let offset = 0;
    for (let i = 0; i < opts.scenes.length; i++) {
      const buf = opts.sceneAudio[i];
      if (buf) {
        const src = audioCtx.createBufferSource();
        src.buffer = buf; src.connect(audioDest); src.start(t0 + offset);
      }
      offset += durations[i];
    }
  }

  const startedAt = performance.now();
  let aborted = false;
  const abortHandler = () => { aborted = true; };
  opts.signal?.addEventListener("abort", abortHandler);

  await new Promise<void>((resolve) => {
    function tick() {
      if (aborted) { resolve(); return; }
      const elapsed = (performance.now() - startedAt) / 1000;
      const clamped = Math.min(elapsed, totalDuration);
      let acc = 0, sceneIdx = 0, localProgress = 0;
      for (let i = 0; i < opts.scenes.length; i++) {
        const d = durations[i];
        if (clamped <= acc + d) { sceneIdx = i; localProgress = (clamped - acc) / d; break; }
        acc += d; sceneIdx = i; localProgress = 1;
      }
      drawScene(ctx, sceneImgs[sceneIdx] ?? fallbackImg, opts.scenes[sceneIdx], {
        progress: localProgress, accent: style.accent, showOnScreenText: opts.showOnScreenText,
      });
      opts.onProgress?.(clamped / totalDuration);
      if (elapsed >= totalDuration) { resolve(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  opts.signal?.removeEventListener("abort", abortHandler);
  try { recorder.stop(); } catch { /* already stopped */ }
  await done;
  combined.getTracks().forEach((t) => t.stop());
  videoStream.getTracks().forEach((t) => t.stop());
  if (audioDest) audioDest.stream.getTracks().forEach((t) => t.stop());
  if (audioCtx) await audioCtx.close().catch(() => {});

  if (aborted) {
    const err = new Error("Render canceled");
    err.name = "AbortError";
    throw err;
  }

  const blob = new Blob(chunks, { type: mime });
  return { blob, mimeType: mime, extension: ext, durationSec: totalDuration };
}

// -------------------------------------------------------------------------
// UGC orchestration: for each scene, generate an AI image + voiceover, then
// render the composed MP4/WebM. All network work runs in parallel; a
// per-stage progress callback surfaces status to the UI.
// -------------------------------------------------------------------------

export type UgcStage =
  | { kind: "images"; done: number; total: number }
  | { kind: "audio"; done: number; total: number }
  | { kind: "render"; progress: number }
  | { kind: "upload" };

export type UgcOptions = {
  title: string;
  platform?: string | null;
  contentType?: string | null;
  styleId?: string | null;
  scenes: RenderScene[];
  imagePrompts?: Array<{ n: number; prompt: string; style: string } | undefined>;
  voice?: string;
  onStage?: (stage: UgcStage) => void;
  signal?: AbortSignal;
  preferredContainer?: "webm" | "mp4";
  showOnScreenText?: boolean;
  /** When provided, image generation is skipped and these data URLs are used directly. */
  preloadedImages?: Array<string | null>;
  /** Attached to credit deduction rows so admin usage history can trace back to the project. */
  projectId?: string | null;
};

/** Exposed so the UI can pre-generate & validate scene images before render. */
export async function generateSceneImage(prompt: string, style: string, ratio: string, projectId?: string | null): Promise<string | null> {
  return fetchSceneImage(prompt, style, ratio, projectId);
}


function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error("Render canceled");
    err.name = "AbortError";
    throw err;
  }
}

async function fetchSceneImage(prompt: string, style: string, ratio: string, projectId?: string | null): Promise<string | null> {
  try {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, style, ratio }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { image?: string };
    if (!json.image) return null;
    // Deduct 1 credit per successful scene image (admin bypass handled inside).
    await deductUsage({ amount: 1, projectId: projectId ?? null, description: "Scene image generated" }).catch(() => {});
    return json.image;
  } catch {
    return null;
  }
}

async function fetchSceneAudio(text: string, voice: string, ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    // decodeAudioData mutates the buffer in some browsers — copy first.
    return await ctx.decodeAudioData(arr.slice(0));
  } catch {
    return null;
  }
}

export async function renderUgcVideo(opts: UgcOptions): Promise<RenderResult> {
  const style = getStyle(opts.styleId);
  const isVertical =
    opts.contentType === "short_reel" ||
    opts.platform === "tiktok" ||
    opts.platform === "instagram";
  const ratio = isVertical ? "9:16" : "16:9";
  const total = opts.scenes.length;

  throwIfAborted(opts.signal);
  let sceneImages: Array<string | null>;
  if (opts.preloadedImages && opts.preloadedImages.length === total) {
    opts.onStage?.({ kind: "images", done: total, total });
    sceneImages = opts.preloadedImages;
  } else {
    let imgDone = 0;
    opts.onStage?.({ kind: "images", done: 0, total });
    sceneImages = await Promise.all(
      opts.scenes.map(async (scene, i) => {
        const promptRow = opts.imagePrompts?.[i];
        const prompt = promptRow?.prompt || scene.visual;
        const url = await fetchSceneImage(prompt, style.descriptor, ratio, opts.projectId);
        imgDone += 1;
        opts.onStage?.({ kind: "images", done: imgDone, total });
        return url;
      }),
    );
  }
  throwIfAborted(opts.signal);

  const decodeCtx = new AudioContext();
  if (decodeCtx.state === "suspended") await decodeCtx.resume().catch(() => {});
  let audDone = 0;
  opts.onStage?.({ kind: "audio", done: 0, total });
  const voice = opts.voice || "alloy";
  const sceneAudio = await Promise.all(
    opts.scenes.map(async (scene) => {
      const buf = await fetchSceneAudio(scene.voiceover, voice, decodeCtx);
      audDone += 1;
      opts.onStage?.({ kind: "audio", done: audDone, total });
      return buf;
    }),
  );
  await decodeCtx.close().catch(() => {});
  throwIfAborted(opts.signal);

  opts.onStage?.({ kind: "render", progress: 0 });
  const result = await renderVideo({
    title: opts.title,
    platform: opts.platform,
    contentType: opts.contentType,
    styleId: opts.styleId,
    scenes: opts.scenes,
    sceneImages,
    sceneAudio,
    fitToAudio: true,
    signal: opts.signal,
    preferredContainer: opts.preferredContainer,
    showOnScreenText: opts.showOnScreenText,
    onProgress: (p) => opts.onStage?.({ kind: "render", progress: p }),
  });
  opts.onStage?.({ kind: "upload" });
  return result;
}
