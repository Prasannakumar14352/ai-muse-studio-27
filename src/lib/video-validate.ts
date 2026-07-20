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
};

/**
 * Rough minimum size a real render should produce.
 * MediaRecorder at ~4 Mbps ≈ 500 KB/s; use a very conservative floor
 * (~55 KB/s) so we only flag catastrophic empties, not compressible content.
 */
function minReasonableBytes(durationSec: number): number {
  // 55 KB per second, floored at 250 KB for tiny clips.
  return Math.max(250 * 1024, Math.round(durationSec * 55 * 1024));
}

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
export function probeVideoDuration(blob: Blob, timeoutMs = 20000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(null); return; }
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    (v as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
    let settled = false;
    const cleanup = (val: number | null) => {
      if (settled) return;
      settled = true;
      try { v.removeAttribute("src"); v.load(); } catch { /* noop */ }
      URL.revokeObjectURL(url);
      resolve(val);
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
    setTimeout(() => finalize(), timeoutMs);
    v.src = url;
  });
}

export async function validateRenderedVideo(
  blob: Blob | null | undefined,
  requestedDurationSec: number,
): Promise<VideoValidation> {
  const size = blob?.size ?? 0;
  const mime = blob?.type ?? "";
  if (!blob) return { ok: false, reason: "No video blob produced", detectedDuration: null, size, mime };
  if (size === 0) return { ok: false, reason: "Rendered video is empty (0 bytes)", detectedDuration: null, size, mime };
  if (!/^video\//i.test(mime)) {
    return { ok: false, reason: `Unexpected MIME type "${mime || "unknown"}"`, detectedDuration: null, size, mime };
  }
  const minBytes = minReasonableBytes(requestedDurationSec);
  if (size < minBytes) {
    return {
      ok: false,
      reason: `Rendered file is too small (${(size / 1024 / 1024).toFixed(2)} MB) for a ${Math.round(requestedDurationSec)}s video`,
      detectedDuration: null,
      size,
      mime,
    };
  }
  const detected = await probeVideoDuration(blob);
  if (detected == null) {
    return { ok: false, reason: "Browser could not read video metadata (broken container / missing moov atom)", detectedDuration: null, size, mime };
  }
  // Duration within ±15% of requested is acceptable at validation time
  // (the pipeline's own ±5% guard runs separately).
  const drift = Math.abs(detected - requestedDurationSec) / Math.max(requestedDurationSec, 1);
  if (drift > 0.35) {
    return { ok: false, reason: `Detected duration ${detected.toFixed(1)}s is far from requested ${requestedDurationSec}s`, detectedDuration: detected, size, mime };
  }
  return { ok: true, reason: null, detectedDuration: detected, size, mime };
}
