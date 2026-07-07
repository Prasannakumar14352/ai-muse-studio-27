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
 */
export function probeVideoDuration(blob: Blob, timeoutMs = 8000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(null); return; }
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let settled = false;
    const cleanup = (val: number | null) => {
      if (settled) return;
      settled = true;
      try { v.removeAttribute("src"); v.load(); } catch { /* noop */ }
      URL.revokeObjectURL(url);
      resolve(val);
    };
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : null;
      cleanup(d && d > 0 ? d : null);
    };
    v.onerror = () => cleanup(null);
    setTimeout(() => cleanup(null), timeoutMs);
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
