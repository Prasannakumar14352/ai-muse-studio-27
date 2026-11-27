import type { QualityFinding } from "./video-quality";

export function audioSignal(
  buffer: Pick<AudioBuffer, "length" | "numberOfChannels" | "getChannelData">,
) {
  let peak = 0;
  let over = 0;
  let count = 0;
  const stride = Math.max(1, Math.floor(buffer.length / 100_000));
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += stride) {
      const sample = Math.abs(data[i]);
      peak = Math.max(peak, sample);
      if (sample >= 0.999) over++;
      count++;
    }
  }
  return {
    peakDbfs: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    fullScaleShare: count ? over / count : 0,
  };
}

export async function inspectShotPreviews(
  shots: Array<{ id: string; kind: string | null; previewUrl?: string | null }>,
  signal?: AbortSignal,
) {
  const findings: QualityFinding[] = [];
  const seen = new Set<string>();
  const targets = shots.filter((shot) => shot.previewUrl);
  for (const shot of targets.slice(0, 40)) {
    signal?.throwIfAborted();
    const source = shot.previewUrl!;
    const clip = shot.kind === "clip";
    let width = 0,
      height = 0,
      duration: number | undefined,
      lowContrast = false,
      duplicate = false;
    try {
      if (clip) {
        const video = document.createElement("video");
        video.preload = "metadata";
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => finish(new Error("Metadata read timed out")), 5000);
            function finish(error?: Error) {
              clearTimeout(timer);
              video.onloadedmetadata = video.onerror = null;
              error ? reject(error) : resolve();
            }
            video.onloadedmetadata = () => finish();
            video.onerror = () => finish(new Error("Video metadata could not be decoded"));
            video.src = source;
          });
          width = video.videoWidth;
          height = video.videoHeight;
          duration = video.duration;
        } finally {
          video.removeAttribute("src");
          video.load();
        }
      } else {
        const response = await fetch(source, { signal });
        if (!response.ok) throw new Error("Image source could not be read");
        const file = await response.blob();
        const bitmap = await createImageBitmap(file);
        try {
          width = bitmap.width;
          height = bitmap.height;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 16;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0, 16, 16);
            const pixels = ctx.getImageData(0, 0, 16, 16).data;
            const luma = Array.from(
              { length: 256 },
              (_, i) =>
                0.2126 * pixels[i * 4] + 0.7152 * pixels[i * 4 + 1] + 0.0722 * pixels[i * 4 + 2],
            );
            lowContrast = Math.max(...luma) - Math.min(...luma) < 5;
            const fingerprint = Array.from(pixels).join(",");
            duplicate = seen.has(fingerprint);
            seen.add(fingerprint);
          }
        } finally {
          bitmap.close();
        }
      }
      if (width <= 0 || height <= 0) throw new Error("No decodable picture dimensions");
      const warning = Math.min(width, height) < 720 || lowContrast || duplicate;
      findings.push({
        id: `decode-${shot.id}`,
        assetId: shot.id,
        stage: clip ? "motion" : "visual",
        severity: warning ? "warning" : "info",
        result: warning ? "warning" : "passed",
        blocksApproval: false,
        evidence: [
          `${width} × ${height}`,
          duration && Number.isFinite(duration) ? `${duration.toFixed(2)} seconds` : "",
          Math.min(width, height) < 720 ? "Short edge below 720 pixels" : "",
          lowContrast ? "Sampled luminance range below 5/255" : "",
          duplicate ? "Matches a previous 16 × 16 pixel sample" : "",
        ]
          .filter(Boolean)
          .join(" · "),
        repair: warning
          ? "Inspect the preview. Replace it if the resolution or appearance is unintended."
          : "Review content and timing in preview.",
      });
    } catch {
      signal?.throwIfAborted();
      findings.push({
        id: `decode-${shot.id}`,
        assetId: shot.id,
        stage: clip ? "motion" : "visual",
        severity: "critical",
        result: "failed",
        blocksApproval: true,
        evidence: "This browser could not load picture metadata.",
        repair: "Retry inspection or replace the source with a playable asset.",
      });
    }
  }
  if (targets.length > 40)
    findings.push({
      id: "inspection-limit",
      stage: "visual",
      severity: "info",
      result: "not checked",
      blocksApproval: false,
      evidence: "The browser inspection is capped at 40 previews.",
      repair: "Manually review the remaining shots.",
    });
  return findings;
}
