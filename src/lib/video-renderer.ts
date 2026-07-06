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

function pickRecorderMime(): { mime: string; ext: "mp4" | "webm" } {
  // Prefer WebM — MediaRecorder's MP4 output in Chromium is fragmented and
  // frequently refuses to play back in a plain <video> tag or QuickTime.
  // WebM/VP9 is universally playable in every modern browser we render into.
  const candidates: Array<{ mime: string; ext: "mp4" | "webm" }> = [
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp9", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
    { mime: "video/mp4;codecs=avc1.42E01E", ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
  ];
  for (const c of candidates) {
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

  const img = await loadImage(style.image);

  const stream = canvas.captureStream(fps);
  const { mime, ext } = pickRecorderMime();
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const totalDuration = opts.scenes.reduce((sum, s) => sum + parseDuration(s.duration), 0);
  const startedAt = performance.now();

  const done = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  // Emit chunks every 250ms so the final blob is well-formed even on short renders.
  recorder.start(250);

  // Draw an initial frame before recording starts capturing.
  drawScene(ctx, img, opts.scenes[0], {
    title: opts.title, platform: opts.platform ?? "preview",
    sceneIdx: 0, totalScenes: opts.scenes.length,
    progress: 0, accent: style.accent, styleLabel: style.label,
  });

  // Animation loop using rAF; MediaRecorder captures whatever the canvas shows.
  await new Promise<void>((resolve) => {
    function tick() {
      const elapsed = (performance.now() - startedAt) / 1000;
      const clamped = Math.min(elapsed, totalDuration);
      // find current scene + local progress
      let acc = 0;
      let sceneIdx = 0;
      let localProgress = 0;
      for (let i = 0; i < opts.scenes.length; i++) {
        const d = parseDuration(opts.scenes[i].duration);
        if (clamped <= acc + d) {
          sceneIdx = i;
          localProgress = (clamped - acc) / d;
          break;
        }
        acc += d;
        sceneIdx = i;
        localProgress = 1;
      }
      drawScene(ctx, img, opts.scenes[sceneIdx], {
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
  stream.getTracks().forEach((t) => t.stop());

  const blob = new Blob(chunks, { type: mime });
  return { blob, mimeType: mime, extension: ext, durationSec: totalDuration };
}
