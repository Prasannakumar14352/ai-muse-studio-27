// Client-side video renderer: draws each scene onto a canvas and records with
// MediaRecorder. Produces a real downloadable file (MP4 where the browser
// supports it, WebM as fallback) — no server dependency required.

import { getStyle } from "./constants";

export type RenderScene = { n: number; visual: string; voiceover: string; duration: string };

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
    title: string; platform: string; sceneIdx: number; totalScenes: number;
    progress: number; accent: string; styleLabel: string;
  },
) {
  const { width: W, height: H } = ctx.canvas;

  // Ken Burns zoom
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
    // Fallback: gradient backdrop tinted with the style accent so the render
    // still looks intentional when the style image fails to load.
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, opts.accent);
    g.addColorStop(1, "#0b0b16");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Bottom gradient
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Top gradient
  const gradTop = ctx.createLinearGradient(0, 0, 0, H * 0.35);
  gradTop.addColorStop(0, "rgba(0,0,0,0.6)");
  gradTop.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradTop;
  ctx.fillRect(0, 0, W, H);

  // Top progress bars
  const barY = Math.round(H * 0.03);
  const barPad = Math.round(W * 0.03);
  const barGap = 6;
  const barW = (W - barPad * 2 - barGap * (opts.totalScenes - 1)) / opts.totalScenes;
  const barH = Math.max(3, Math.round(H * 0.006));
  for (let i = 0; i < opts.totalScenes; i++) {
    const x = barPad + i * (barW + barGap);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x, barY, barW, barH);
    ctx.fillStyle = "#ffffff";
    const fill = i < opts.sceneIdx ? 1 : i === opts.sceneIdx ? opts.progress : 0;
    ctx.fillRect(x, barY, barW * fill, barH);
  }

  // Platform + title top-left
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `${Math.round(H * 0.018)}px system-ui`;
  ctx.textBaseline = "top";
  ctx.fillText(opts.platform.toUpperCase(), barPad, barY + barH + 12);
  ctx.fillStyle = "#fff";
  ctx.font = `600 ${Math.round(H * 0.028)}px system-ui`;
  ctx.fillText(truncate(opts.title, 60), barPad, barY + barH + 12 + Math.round(H * 0.025));

  // Scene chip
  const chipText = `Scene ${scene.n} · ${scene.duration} · ${opts.styleLabel}`;
  ctx.font = `600 ${Math.round(H * 0.02)}px system-ui`;
  const chipMetrics = ctx.measureText(chipText);
  const chipW = chipMetrics.width + 24;
  const chipH = Math.round(H * 0.038);
  const chipX = barPad;
  const chipY = H - Math.round(H * 0.28);
  ctx.fillStyle = opts.accent;
  roundRect(ctx, chipX, chipY, chipW, chipH, 8);
  ctx.fillStyle = "#fff";
  ctx.fillText(chipText, chipX + 12, chipY + chipH / 2 - Math.round(H * 0.011));

  // Visual headline
  ctx.font = `700 ${Math.round(H * 0.045)}px system-ui`;
  ctx.fillStyle = "#fff";
  wrapText(ctx, scene.visual, barPad, chipY + chipH + 20, W - barPad * 2, Math.round(H * 0.055), 3);

  // Voiceover subtitle
  ctx.font = `italic ${Math.round(H * 0.026)}px system-ui`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  const voY = H - Math.round(H * 0.08);
  wrapText(ctx, `🎙 ${scene.voiceover}`, barPad, voY, W - barPad * 2, Math.round(H * 0.032), 2);
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

  const { mime, ext } = pickRecorderMime();
  const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  // Draw an initial frame BEFORE recording so the first captured frame isn't black.
  drawScene(ctx, sceneImgs[0] ?? fallbackImg, opts.scenes[0], {
    title: opts.title, platform: opts.platform ?? "preview",
    sceneIdx: 0, totalScenes: opts.scenes.length,
    progress: 0, accent: style.accent, styleLabel: style.label,
  });

  // Emit chunks every 250ms so the final blob is well-formed even on short renders.
  recorder.start(250);

  // Schedule all voiceover buffers now that the recorder is running.
  if (audioCtx && audioDest && opts.sceneAudio) {
    const t0 = audioCtx.currentTime + 0.05;
    let offset = 0;
    for (let i = 0; i < opts.scenes.length; i++) {
      const buf = opts.sceneAudio[i];
      if (buf) {
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioDest);
        src.start(t0 + offset);
      }
      offset += durations[i];
    }
  }

  const startedAt = performance.now();

  // Animation loop using rAF; MediaRecorder captures whatever the canvas shows.
  await new Promise<void>((resolve) => {
    function tick() {
      const elapsed = (performance.now() - startedAt) / 1000;
      const clamped = Math.min(elapsed, totalDuration);
      let acc = 0;
      let sceneIdx = 0;
      let localProgress = 0;
      for (let i = 0; i < opts.scenes.length; i++) {
        const d = durations[i];
        if (clamped <= acc + d) {
          sceneIdx = i;
          localProgress = (clamped - acc) / d;
          break;
        }
        acc += d;
        sceneIdx = i;
        localProgress = 1;
      }
      drawScene(ctx, sceneImgs[sceneIdx] ?? fallbackImg, opts.scenes[sceneIdx], {
        title: opts.title, platform: opts.platform ?? "preview",
        sceneIdx, totalScenes: opts.scenes.length,
        progress: localProgress, accent: style.accent, styleLabel: style.label,
      });
      opts.onProgress?.(clamped / totalDuration);
      if (elapsed >= totalDuration) { resolve(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  recorder.stop();
  await done;
  combined.getTracks().forEach((t) => t.stop());
  videoStream.getTracks().forEach((t) => t.stop());
  if (audioDest) audioDest.stream.getTracks().forEach((t) => t.stop());
  if (audioCtx) await audioCtx.close().catch(() => {});

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
  voice?: string; // TTS voice id
  onStage?: (stage: UgcStage) => void;
};

async function fetchSceneImage(prompt: string, style: string, ratio: string): Promise<string | null> {
  try {
    const res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, style, ratio }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { image?: string };
    return json.image ?? null;
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

  // 1) Images — in parallel, report as they land.
  let imgDone = 0;
  opts.onStage?.({ kind: "images", done: 0, total });
  const sceneImages = await Promise.all(
    opts.scenes.map(async (scene, i) => {
      const promptRow = opts.imagePrompts?.[i];
      const prompt = promptRow?.prompt || scene.visual;
      const url = await fetchSceneImage(prompt, style.descriptor, ratio);
      imgDone += 1;
      opts.onStage?.({ kind: "images", done: imgDone, total });
      return url;
    }),
  );

  // 2) Audio — decode using a shared AudioContext.
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
  // Keep decodeCtx alive until render swaps in its own context — nothing else uses it.
  await decodeCtx.close().catch(() => {});

  // 3) Render
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
    onProgress: (p) => opts.onStage?.({ kind: "render", progress: p }),
  });
  opts.onStage?.({ kind: "upload" });
  return result;
}
