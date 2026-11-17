// Client-side video renderer: draws each scene onto a canvas and records with
// MediaRecorder. Produces a real downloadable file (MP4 where the browser
// supports it, WebM as fallback) — no server dependency required.

// webm-duration-fix is loaded lazily inside the render function — its
// transitive deps (ts-ebml / node streams) explode at module init in some
// browser bundles ("Class extends value undefined is not a constructor"),
// which was crashing every route that pulled this module into its graph.
import { getStyle } from "./constants";
import { authFetch } from "@/lib/auth-fetch";

const LOG = (...args: unknown[]) => console.info("[video-renderer]", ...args);
const WARN = (...args: unknown[]) => console.warn("[video-renderer]", ...args);

// Legacy 7 motions are kept as a subset; the Motion Director adds cinematic
// variants (orbit, dolly, crane, macro, parallax, floating, spin, page-flip,
// hand-interact, kinetic-text). All are canvas-implementable transforms.
export type CameraMotion =
  | "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "tiltDown" | "tiltUp" | "pushIn"
  | "orbit" | "dollyLeft" | "dollyRight" | "craneUp" | "craneDown"
  | "macroPush" | "parallax" | "floating" | "productSpin" | "kineticText"
  | "pageFlip" | "handInteract";

export type TransitionStyle =
  | "cut" | "fade" | "whipPan" | "flash"
  | "slideLeft" | "slideUp" | "maskCircle" | "pageFlip" | "zoomBlur";

export type RenderScene = {
  n: number;
  visual: string;
  voiceover: string;
  duration: string;
  on_screen_text?: string;
  /** Camera motion for this beat — Motion Director picks it per scene type. */
  motion?: CameraMotion;
  /** Transition INTO this beat (played over ~0.35s at the start). */
  transition?: TransitionStyle;
};

export type RenderOptions = {
  title: string;
  platform?: string | null;
  scenes: RenderScene[];
  styleId?: string | null;
  contentType?: string | null; // "long_video" | "short_reel" | ...
  fps?: number;
  onProgress?: (p: number) => void; // 0..1
  sceneImages?: Array<string | null>;
  /**
   * Per-beat media. If `kind === "clip"`, the URL points to an mp4/webm that
   * plays muted underneath the camera motion overlay; on load failure or when
   * the entry is null, falls back to `sceneImages[i]` and then the style still.
   */
  sceneMedia?: Array<{ kind: "image" | "clip"; url: string } | null>;
  sceneAudio?: Array<AudioBuffer | null>;
  fitToAudio?: boolean;
  /** Cancel the render mid-flight — recorder stops and result rejects with AbortError. */
  signal?: AbortSignal;
  /** Force a specific container/codec instead of the browser's best choice. Used by the codec-fallback retry. */
  preferredContainer?: "webm" | "mp4";
  /** When false, on_screen_text overlays are not drawn. Defaults to true. */
  showOnScreenText?: boolean;
  /**
   * Hard cap for total rendered duration in seconds. When set, per-scene
   * durations are normalized (scaled proportionally) so the sum matches this
   * value within ±0.01s. Audio playbackRate is adjusted (clamped to
   * [0.9, 1.15]) to keep narration synced without extending the timeline.
   * This is the single source of truth for final runtime — narration length,
   * scene sums and transitions cannot independently extend it.
   */
  targetDurationSec?: number;
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
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Preload a muted <video> element ready to play into the recorder canvas. */
async function loadClip(src: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    try {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.preload = "auto";
      v.crossOrigin = "anonymous";
      const done = (ok: boolean) => resolve(ok ? v : null);
      v.oncanplaythrough = () => done(true);
      v.onloadeddata = () => done(true);
      v.onerror = () => done(false);
      v.src = src;
      // Safety timeout — some encodings never fire canplaythrough.
      setTimeout(() => done(v.readyState >= 2), 3000);
    } catch { resolve(null); }
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

type Drawable = HTMLImageElement | HTMLVideoElement | null;
function drawableSize(d: Drawable): { w: number; h: number } {
  if (!d) return { w: 0, h: 0 };
  if (d instanceof HTMLVideoElement) return { w: d.videoWidth || 1280, h: d.videoHeight || 720 };
  return { w: d.width, h: d.height };
}

/** Overlay a scene-change transition on the incoming beat. `t` is 0..1. */
function drawTransition(
  ctx: CanvasRenderingContext2D,
  kind: TransitionStyle,
  t: number,
  W: number,
  H: number,
) {
  const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
  switch (kind) {
    case "whipPan": {
      // Motion blur + streaked veil sweeping across.
      const alpha = (1 - eased) * 0.9;
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(Math.max(0, eased - 0.15), "rgba(0,0,0,0)");
      g.addColorStop(eased, `rgba(255,255,255,${(alpha * 0.35).toFixed(3)})`);
      g.addColorStop(Math.min(1, eased + 0.15), "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(0,0,0,${(alpha * 0.4).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "flash": {
      const a = Math.max(0, 1 - t / 0.6);
      ctx.fillStyle = `rgba(255,255,255,${(a * 0.95).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "slideLeft": {
      const x = W * (1 - eased);
      ctx.fillStyle = "#0b0b16";
      ctx.fillRect(x, 0, W - x, H);
      break;
    }
    case "slideUp": {
      const y = H * (1 - eased);
      ctx.fillStyle = "#0b0b16";
      ctx.fillRect(0, y, W, H - y);
      break;
    }
    case "maskCircle": {
      // Grow a circular window: black everywhere except the expanding disc.
      const r = Math.hypot(W, H) * eased * 0.6;
      ctx.save();
      ctx.fillStyle = "#0b0b16";
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill("evenodd");
      ctx.restore();
      break;
    }
    case "pageFlip": {
      // Diagonal wipe with a bright edge — feels like a page flipping in.
      const w = W * 1.2 * (1 - eased);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w - H * 0.25, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      ctx.fillStyle = "#f5efe4";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "zoomBlur": {
      const a = (1 - eased) * 0.75;
      ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      // subtle vignette
      const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 2);
      rg.addColorStop(0, "rgba(255,255,255,0)");
      rg.addColorStop(1, `rgba(255,255,255,${(a * 0.4).toFixed(3)})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    default:
      break;
  }
}



function drawScene(
  ctx: CanvasRenderingContext2D,
  media: Drawable,
  scene: RenderScene,
  opts: {
    progress: number; accent: string; showOnScreenText?: boolean;
  },
) {
  const { width: W, height: H } = ctx.canvas;
  const p = Math.max(0, Math.min(1, opts.progress));

  // Cinematic camera motion per beat — Motion Director picks these per
  // scene type (product spin for product showcase, page-flip for worksheets,
  // orbit for mockups, dolly for lifestyle, etc.).
  const motion: CameraMotion = scene.motion ?? "zoomIn";
  let scale = 1.08;
  let panX = 0;             // fraction of W
  let panY = 0;             // fraction of H
  let rotate = 0;           // radians
  let skewX = 0;            // horizontal skew for spin/parallax feel
  switch (motion) {
    case "zoomIn":       scale = 1.05 + p * 0.12; break;
    case "zoomOut":      scale = 1.18 - p * 0.12; break;
    case "pushIn":       scale = 1.02 + p * 0.20; break;
    case "panLeft":      scale = 1.15; panX = (0.05 - p * 0.10); break;
    case "panRight":     scale = 1.15; panX = (-0.05 + p * 0.10); break;
    case "tiltDown":     scale = 1.15; panY = (-0.05 + p * 0.10); break;
    case "tiltUp":       scale = 1.15; panY = (0.05 - p * 0.10); break;
    case "orbit":        scale = 1.14 + p * 0.04; panX = Math.sin(p * Math.PI) * 0.06; skewX = Math.sin(p * Math.PI) * 0.05; break;
    case "dollyLeft":    scale = 1.20; panX = 0.08 - p * 0.16; break;
    case "dollyRight":   scale = 1.20; panX = -0.08 + p * 0.16; break;
    case "craneUp":      scale = 1.18 - p * 0.04; panY = 0.08 - p * 0.16; break;
    case "craneDown":    scale = 1.14 + p * 0.06; panY = -0.08 + p * 0.16; break;
    case "macroPush":    scale = 1.25 + p * 0.30; break;
    case "parallax":     scale = 1.16 + p * 0.03; panX = -0.06 + p * 0.12; panY = Math.sin(p * Math.PI * 2) * 0.01; break;
    case "floating":     scale = 1.10 + Math.sin(p * Math.PI * 2) * 0.02; panY = Math.sin(p * Math.PI * 2) * 0.02; break;
    case "productSpin":  scale = 1.14; skewX = Math.sin(p * Math.PI * 2) * 0.10; panX = Math.sin(p * Math.PI * 2) * 0.02; break;
    case "kineticText":  scale = 1.06 + Math.sin(p * Math.PI) * 0.03; panY = Math.sin(p * Math.PI * 2) * 0.01; break;
    case "pageFlip":     scale = 1.12 + p * 0.04; rotate = (p - 0.5) * 0.06; panX = (p - 0.5) * 0.03; break;
    case "handInteract": scale = 1.18 + p * 0.06; panY = 0.02 - p * 0.04; break;
  }

  ctx.fillStyle = "#0b0b16";
  ctx.fillRect(0, 0, W, H);
  const size = drawableSize(media);
  if (media && size.w > 0 && size.h > 0) {
    const ratio = Math.max(W / size.w, H / size.h) * scale;
    const dw = size.w * ratio;
    const dh = size.h * ratio;
    const dx = (W - dw) / 2 + panX * W;
    const dy = (H - dh) / 2 + panY * H;
    if (rotate !== 0 || skewX !== 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      if (rotate !== 0) ctx.rotate(rotate);
      if (skewX !== 0) ctx.transform(1, 0, skewX, 1, 0, 0);
      ctx.translate(-W / 2, -H / 2);
      ctx.drawImage(media, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(media, dx, dy, dw, dh);
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, opts.accent);
    g.addColorStop(1, "#0b0b16");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Quick fade-in at the start of every beat so cuts feel filmic, not abrupt.
  const fadeIn = p < 0.12 ? (1 - p / 0.12) * 0.85 : 0;
  const fadeOut = p > 0.92 ? ((p - 0.92) / 0.08) * 0.5 : 0;
  const veil = Math.max(fadeIn, fadeOut);
  if (veil > 0) {
    ctx.fillStyle = `rgba(0,0,0,${veil.toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Motion Director transition — overlaid on the FIRST ~0.35 of the beat so
  // scene changes feel like edits (whip-pan, flash, mask reveal, page-flip)
  // instead of hard cuts.
  const transition: TransitionStyle = scene.transition ?? "fade";
  if (transition !== "cut" && transition !== "fade" && p < 0.35) {
    drawTransition(ctx, transition, p / 0.35, W, H);
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

  // Load style fallback + per-beat media in parallel. Clips are preloaded as
  // muted <video> elements; images stay as <img>. Falls back to sceneImages
  // when no clip is provided, then to the style still.
  const beatCount = opts.scenes.length;
  const [fallbackImg, ...sceneMedia] = await Promise.all([
    loadImage(style.image),
    ...Array.from({ length: beatCount }, async (_, i): Promise<Drawable> => {
      const m = opts.sceneMedia?.[i];
      if (m?.kind === "clip") {
        const v = await loadClip(m.url);
        if (v) return v;
        // clip failed to load — fall through to still image
      }
      const stillSrc = m?.kind === "image" ? m.url : opts.sceneImages?.[i];
      return stillSrc ? await loadImage(stillSrc) : null;
    }),
  ]);

  // Scene durations — stretched to fit voiceover audio when requested so the
  // audio never cuts off mid-sentence.
  const rawDurations = opts.scenes.map((s, i) => {
    const base = parseDuration(s.duration);
    if (opts.fitToAudio && opts.sceneAudio?.[i]) {
      return Math.max(base, opts.sceneAudio[i]!.duration + 0.25);
    }
    return base;
  });
  const rawTotal = rawDurations.reduce((a, b) => a + b, 0);

  // Timeline normalization — user-requested duration is the SINGLE source of
  // truth. If narration/scene sums drift, scale scenes proportionally so the
  // final render matches the target within ±0.01s. Audio playbackRate is
  // adjusted (clamped) to keep narration synced without extending runtime.
  const target = opts.targetDurationSec && opts.targetDurationSec > 0
    ? opts.targetDurationSec
    : rawTotal;
  const timelineScale = rawTotal > 0 ? target / rawTotal : 1;
  const durations = opts.targetDurationSec
    ? rawDurations.map((d) => d * timelineScale)
    : rawDurations;
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  // Audio must play faster/slower to match compressed/expanded visual timeline
  // so lip-sync and beat boundaries stay aligned. Clamp to a musical range —
  // anything past this and the pipeline should have shortened the script.
  const audioPlaybackRate = Math.max(0.9, Math.min(1.15, 1 / (timelineScale || 1)));

  // Structured timeline log — one row per scene + summary.
  const totalNarration = (opts.sceneAudio ?? []).reduce(
    (a, b) => a + (b?.duration ?? 0), 0,
  );
  LOG("timeline", {
    requestedDurationSec: opts.targetDurationSec ?? null,
    narrationDurationSec: Number(totalNarration.toFixed(2)),
    totalSceneCount: opts.scenes.length,
    rawTimelineDurationSec: Number(rawTotal.toFixed(2)),
    calculatedTimelineDurationSec: Number(totalDuration.toFixed(2)),
    timelineScale: Number(timelineScale.toFixed(4)),
    audioPlaybackRate: Number(audioPlaybackRate.toFixed(4)),
  });
  {
    let cursor = 0;
    for (let i = 0; i < durations.length; i++) {
      const narrSec = opts.sceneAudio?.[i]?.duration ?? 0;
      const start = cursor;
      const end = cursor + durations[i];
      LOG(`scene[${i + 1}]`, {
        narrationStart: Number(start.toFixed(2)),
        narrationEnd: Number((start + narrSec / audioPlaybackRate).toFixed(2)),
        assignedDurationSec: Number(durations[i].toFixed(2)),
        rawDurationSec: Number(rawDurations[i].toFixed(2)),
        timelineStart: Number(start.toFixed(2)),
        timelineEnd: Number(end.toFixed(2)),
      });
      cursor = end;
    }
  }


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

  // captureStream(0) yields a stream that only emits frames when we call
  // requestFrame() on the video track. This guarantees the recorder samples
  // exactly one frame per RAF tick — without it, background-throttled tabs
  // or GPU pauses can produce recordings that look "mostly static".
  const videoStream = canvas.captureStream(0);
  const videoTrack = videoStream.getVideoTracks()[0] as
    (CanvasCaptureMediaStreamTrack & { requestFrame?: () => void }) | undefined;
  const requestFrame = () => {
    try { videoTrack?.requestFrame?.(); } catch { /* noop */ }
  };
  const combined = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => combined.addTrack(t));
  if (audioDest) audioDest.stream.getAudioTracks().forEach((t) => combined.addTrack(t));

  const { mime, ext } = pickRecorderMime(opts.preferredContainer);
  LOG("start recording", { mime, ext, W, H, fps, beats: beatCount, totalDuration, hasAudio });
  const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  drawScene(ctx, sceneMedia[0] ?? fallbackImg, opts.scenes[0], {
    progress: 0, accent: style.accent, showOnScreenText: opts.showOnScreenText,
  });
  requestFrame();

  // Kick off the first beat's clip playback if it's a video.
  const currentPlaying = { idx: -1 };
  const playIfClip = (i: number) => {
    if (i === currentPlaying.idx) return;
    // Pause previous
    const prev = sceneMedia[currentPlaying.idx];
    if (prev instanceof HTMLVideoElement) { try { prev.pause(); } catch { /* noop */ } }
    currentPlaying.idx = i;
    const next = sceneMedia[i];
    if (next instanceof HTMLVideoElement) {
      try { next.currentTime = 0; void next.play().catch(() => {}); } catch { /* noop */ }
    }
  };
  playIfClip(0);


  recorder.start(250);

  if (audioCtx && audioDest && opts.sceneAudio) {
    const t0 = audioCtx.currentTime + 0.05;
    let offset = 0;
    for (let i = 0; i < opts.scenes.length; i++) {
      const buf = opts.sceneAudio[i];
      if (buf) {
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        try { src.playbackRate.value = audioPlaybackRate; } catch { /* noop */ }
        src.connect(audioDest); src.start(t0 + offset);
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
      playIfClip(sceneIdx);
      drawScene(ctx, sceneMedia[sceneIdx] ?? fallbackImg, opts.scenes[sceneIdx], {
        progress: localProgress, accent: style.accent, showOnScreenText: opts.showOnScreenText,
      });
      requestFrame();
      opts.onProgress?.(clamped / totalDuration);
      if (elapsed >= totalDuration) { resolve(); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  opts.signal?.removeEventListener("abort", abortHandler);
  // Ensure a final frame is captured before stop() so the encoder flushes
  // the last GOP with real content rather than a keyframe of the previous state.
  requestFrame();
  try { recorder.requestData(); } catch { /* not all impls */ }
  try { recorder.stop(); } catch { /* already stopped */ }
  await done;
  combined.getTracks().forEach((t) => t.stop());
  videoStream.getTracks().forEach((t) => t.stop());
  if (audioDest) audioDest.stream.getTracks().forEach((t) => t.stop());
  if (audioCtx) await audioCtx.close().catch(() => {});
  // Stop any playing clip elements.
  for (const m of sceneMedia) {
    if (m instanceof HTMLVideoElement) { try { m.pause(); } catch { /* noop */ } }
  }

  if (aborted) {
    const err = new Error("Render canceled");
    err.name = "AbortError";
    throw err;
  }

  if (chunks.length === 0) {
    throw new Error("Recorder produced no data — canvas capture failed. Try reloading and keeping this tab in the foreground.");
  }

  let blob = new Blob(chunks, { type: mime });
  LOG("recording finished", { chunks: chunks.length, bytes: blob.size, mime });

  // WebM from MediaRecorder is streamed without a Duration element in the
  // SegmentInfo, which is why players show "Duration: N/A" and seek bars are
  // broken. Patch the container so exported files have valid metadata.
  if (ext === "webm") {
    try {
      const mod = await import("webm-duration-fix");
      const fixWebmDuration = (mod as { default?: (b: Blob) => Promise<Blob> }).default
        ?? (mod as unknown as (b: Blob) => Promise<Blob>);
      const fixed = await fixWebmDuration(blob);
      if (fixed && fixed.size > 0) {
        blob = fixed;
        LOG("webm duration patched", { bytes: blob.size });
      }
    } catch (e) {
      WARN("fixWebmDuration failed — exporting raw blob", e);
    }
  }

  if (blob.size === 0) {
    throw new Error("Rendered video blob is empty after encoding.");
  }

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
  const { fetchGeneratedImage } = await import("@/lib/image-stream");
  const { image } = await fetchGeneratedImage({ prompt, style, ratio });
  if (!image) return null;
  // Deduct 1 credit per successful scene image (admin bypass handled inside).
  return image;
}

async function fetchSceneAudio(text: string, voice: string, ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const res = await authFetch("/api/tts", {
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
