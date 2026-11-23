/**
 * Shrink an image for AI vision calls. Full-size PNG thumbnails (photo + text
 * overlay) can be several MB as base64 — over the ~4.5 MB request limit on
 * Vercel functions — and vision models only look at ~1000 px anyway.
 * Returns a JPEG data URL; falls back to the original if it can't be drawn.
 */
export async function shrinkForVision(src: string, maxSide = 1280, quality = 0.85): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't load image"));
      el.src = src;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return src;
  }
}
