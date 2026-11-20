/**
 * Thumbnail text overlay for regional scripts.
 *
 * AI image models draw Latin text acceptably but garble Indic and other
 * non-Latin scripts (Telugu, Hindi, Tamil…): they imitate letter shapes.
 * For those, the image model is told to draw no text, and the text is drawn
 * here on a canvas with the matching Google Noto font, so it is always
 * spelled correctly. Browser-only.
 */

type ScriptFont = { name: string; family: string; test: RegExp; rtl?: boolean };

const SCRIPTS: ScriptFont[] = [
  { name: "Telugu", family: "Noto Sans Telugu", test: /[ఀ-౿]/ },
  { name: "Devanagari", family: "Noto Sans Devanagari", test: /[ऀ-ॿ]/ },
  { name: "Tamil", family: "Noto Sans Tamil", test: /[஀-௿]/ },
  { name: "Kannada", family: "Noto Sans Kannada", test: /[ಀ-೿]/ },
  { name: "Malayalam", family: "Noto Sans Malayalam", test: /[ഀ-ൿ]/ },
  { name: "Bengali", family: "Noto Sans Bengali", test: /[ঀ-৿]/ },
  { name: "Gujarati", family: "Noto Sans Gujarati", test: /[઀-૿]/ },
  { name: "Gurmukhi", family: "Noto Sans Gurmukhi", test: /[਀-੿]/ },
  { name: "Odia", family: "Noto Sans Oriya", test: /[଀-୿]/ },
  { name: "Arabic", family: "Noto Sans Arabic", test: /[؀-ۿ]/, rtl: true },
];

/** Script that needs a real-font overlay, or null for Latin-only text (the model can draw it). */
export function overlayScriptFor(text: string | null | undefined): ScriptFont | null {
  if (!text) return null;
  return SCRIPTS.find((s) => s.test.test(text)) ?? null;
}

export function needsTextOverlay(text: string | null | undefined): boolean {
  return overlayScriptFor(text) !== null;
}

const loaded = new Set<string>();

export async function loadFont(family: string): Promise<void> {
  if (typeof document === "undefined" || loaded.has(family)) return;
  const id = `font-${family.replace(/\s+/g, "-")}`;
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    // Noto Sans (Latin) is loaded too so mixed text like "2100లో THEATRE" matches.
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@800;900&family=Noto+Sans:wght@800;900&display=block`;
    document.head.appendChild(link);
  }
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`900 64px "${family}"`),
        document.fonts.load(`900 64px "Noto Sans"`),
      ]),
      new Promise((r) => setTimeout(r, 6000)),
    ]);
  } catch {
    /* fall back to whatever the browser has */
  }
  loaded.add(family);
}

/** Load any Google font by name (brand kits can use fonts without 800/900 weights). */
async function loadBrandFont(family: string): Promise<void> {
  if (typeof document === "undefined" || loaded.has(family)) return;
  const id = `font-${family.replace(/\s+/g, "-")}`;
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&family=Noto+Sans:wght@800;900&display=block`;
    document.head.appendChild(link);
  }
  try {
    await Promise.race([document.fonts.load(`64px "${family}"`), new Promise((r) => setTimeout(r, 6000))]);
  } catch { /* fall back */ }
  loaded.add(family);
}

/** Draw a logo / watermark image into a corner. Returns a PNG data URL. */
export async function composeBrandMarks(
  imageSrc: string,
  marks: { logoUrl?: string | null; watermarkUrl?: string | null },
): Promise<string> {
  if (!marks.logoUrl && !marks.watermarkUrl) return imageSrc;
  const img = await loadImage(imageSrc);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageSrc;
  ctx.drawImage(img, 0, 0);
  const pad = Math.round(Math.min(W, H) * 0.03);
  const draw = async (url: string, corner: "br" | "bl", alpha: number) => {
    try {
      const m = await loadImage(url);
      const h = Math.round(Math.min(W, H) * 0.1);
      const w = Math.round((m.naturalWidth / m.naturalHeight) * h);
      const x = corner === "br" ? W - w - pad : pad;
      ctx.globalAlpha = alpha;
      ctx.drawImage(m, x, H - h - pad, w, h);
      ctx.globalAlpha = 1;
    } catch { /* unreachable logo URL: skip it */ }
  };
  if (marks.logoUrl) await draw(marks.logoUrl, "br", 1);
  if (marks.watermarkUrl) await draw(marks.watermarkUrl, "bl", 0.55);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return imageSrc; // CORS-tainted logo
  }
}

/** Split text into up to two balanced lines (explicit "\n" or " / " wins). */
export function splitLines(text: string): string[] {
  const explicit = text
    .split(/\n|\s\/\s/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (explicit.length > 1) return explicit.slice(0, 2);
  const words = text.trim().split(/\s+/);
  if (words.length <= 2) return [text.trim()];
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image for text overlay"));
    img.src = src;
  });
}

/**
 * Draw the text onto the image as bold banner bars (line 1 at the top,
 * line 2 at the bottom; a single line goes at the bottom). Returns a PNG data URL.
 */
export async function composeTextOverlay(
  imageSrc: string,
  text: string,
  opts?: { fontFamily?: string | null },
): Promise<string> {
  const script = overlayScriptFor(text);
  // A brand font only applies to Latin text — regional scripts keep their Noto font.
  const brandFont = !script && opts?.fontFamily?.trim() ? opts.fontFamily.trim() : null;
  const family = script?.family ?? brandFont ?? "Noto Sans";
  if (brandFont) await loadBrandFont(brandFont);
  else await loadFont(family);
  const img = await loadImage(imageSrc);

  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, W, H);

  const lines = splitLines(text);
  const positions = lines.length === 1 ? ["bottom"] : ["top", "bottom"];
  const maxTextWidth = W * 0.88;
  const baseSize = Math.round(Math.min(W, H) * (W >= H ? 0.095 : 0.13));

  lines.forEach((line, i) => {
    // Shrink until the line fits the width.
    let size = baseSize;
    const fontFor = (s: number) => `900 ${s}px "${family}", "Noto Sans", system-ui, sans-serif`;
    ctx.font = fontFor(size);
    while (ctx.measureText(line).width > maxTextWidth && size > 18) {
      size -= 2;
      ctx.font = fontFor(size);
    }
    const barH = Math.round(size * 1.7);
    const y = positions[i] === "top" ? Math.round(H * 0.06) : Math.round(H - H * 0.06 - barH);

    // Banner bar
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, "rgba(8, 20, 70, 0.92)");
    grad.addColorStop(1, "rgba(4, 12, 48, 0.92)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, W, barH);

    // Text with outline + glow for contrast
    ctx.direction = script?.rtl ? "rtl" : "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = W / 2;
    const cy = y + barH / 2 + size * 0.04;
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(56, 140, 255, 0.85)";
    ctx.shadowBlur = size * 0.25;
    ctx.lineWidth = Math.max(4, size * 0.12);
    ctx.strokeStyle = "#0a1a5c";
    ctx.strokeText(line, cx, cy);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line, cx, cy);
  });

  return canvas.toDataURL("image/png");
}
