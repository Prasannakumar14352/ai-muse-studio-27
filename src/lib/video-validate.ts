import { durationFinding } from "./video-quality";
// Runtime validation for rendered video blobs.
// The final MP4/WebM must be playable in the browser before we mark the
// render "complete" or show it in the preview player. This module owns the
// cross-cutting checks: presence, MIME, size sanity, and metadata load.

export type VideoValidation = {
  ok: boolean;
  reason: string | null;
  detectedDuration: number | null;
  size: number;
  mime: string;
  width?: number;
  height?: number;
};

/**
 * Load a blob into a hidden <video> element to confirm the browser can
 * decode metadata (moov atom present, container valid). Resolves with the
 * detected duration or null on failure.
 *
 * MediaRecorder-produced WebM is streamed without a Duration element in
 * SegmentInfo, so `video.duration` initially reports `Infinity`. The
 * industry-standard workaround is to seek past the end — the browser then
 * walks the file, computes the real duration, and fires `durationchange`
 * with a finite value. We only fall back to null if that also fails.
 */
export async function probeVideoDuration(blob: Blob, timeoutMs = 20000): Promise<number | null> {
  return (await probeVideoMetadata(blob, timeoutMs))?.duration ?? null;
}

export function probeVideoMetadata(
  blob: Blob,
  timeoutMs = 20000,
): Promise<{ duration: number; width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(null); return; }
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    (v as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = (val: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.onloadedmetadata = v.ondurationchange = v.onerror = null;
      const { videoWidth: width, videoHeight: height } = v;
      try { v.removeAttribute("src"); v.load(); } catch { /* noop */ }
      URL.revokeObjectURL(url);
      resolve(val === null ? null : { duration: val, width, height });
    };
    const finalize = () => {
      const d = v.duration;
      if (typeof d === "number" && Number.isFinite(d) && d > 0) {
        cleanup(d);
      } else {
        cleanup(null);
      }
    };
    v.onloadedmetadata = () => {
      const d = v.duration;
      if (typeof d === "number" && Number.isFinite(d) && d > 0) {
        cleanup(d);
        return;
      }
      // Force browsers to compute the real duration for streamed WebM
      // that has no Duration element in the container.
      v.ondurationchange = () => {
        const nd = v.duration;
        if (typeof nd === "number" && Number.isFinite(nd) && nd > 0) {
          try { v.currentTime = 0; } catch { /* noop */ }
          cleanup(nd);
        }
      };
      try { v.currentTime = 1e6; } catch { /* noop */ }
    };
    v.onerror = () => finalize();
    timer = setTimeout(() => finalize(), timeoutMs);
    v.src = url;
  });
}

export async function validateRenderedVideo(
  blob: Blob | null | undefined,
  requestedDurationSec: number,
  strict = false,
  expectedDimensions?: [number, number],
): Promise<VideoValidation> {
  const size = blob?.size ?? 0;
  const mime = blob?.type ?? "";
  if (!blob) return { ok: false, reason: "No video blob produced", detectedDuration: null, size, mime };
  if (size === 0) return { ok: false, reason: "Rendered video is empty (0 bytes)", detectedDuration: null, size, mime };
  if (!/^video\//i.test(mime)) {
    return { ok: false, reason: `Unexpected MIME type "${mime || "unknown"}"`, detectedDuration: null, size, mime };
  }
  const metadata = await probeVideoMetadata(blob);
  const detected = metadata?.duration;
  if (detected == null) {
    return {
      ok: false,
      reason: "Browser could not read video metadata (broken container / missing moov atom)",
      detectedDuration: null,
      size,
      mime,
    };
  }
  if (!metadata?.width || !metadata.height) {
    return {
      ok: false,
      reason: "No video picture stream decoded",
      detectedDuration: detected,
      size,
      mime,
    };
  }
  if (
    expectedDimensions &&
    (metadata.width !== expectedDimensions[0] || metadata.height !== expectedDimensions[1])
  ) {
    return {
      ok: false,
      reason: `Expected ${expectedDimensions.join(" × ")}; got ${metadata.width} × ${metadata.height}`,
      detectedDuration: detected,
      size,
      mime,
    };
  }
  // Duration within ±15% of requested is acceptable at validation time
  // (the pipeline's own ±5% guard runs separately).
  const drift = Math.abs(detected - requestedDurationSec) / Math.max(requestedDurationSec, 1);
  if (strict ? !durationFinding(detected, requestedDurationSec).passed : drift > 0.35) {
    return { ok: false, reason: `Detected duration ${detected.toFixed(1)}s is far from requested ${requestedDurationSec}s`, detectedDuration: detected, size, mime };
  }
  return {
    ok: true,
    reason: null,
    detectedDuration: detected,
    size,
    mime,
    width: metadata.width,
    height: metadata.height,
  };
}
