/**
 * Carousel slides: the image model draws a text-free background; the slide copy
 * (headline, subhead, bullets, CTA) is laid out by the app as editable overlays
 * and burned into a PNG for preview/export. Browser-only.
 *
 * Rendering mirrors <OverlayNode> in slide-editor.tsx so the composed PNG and
 * the editor preview match.
 */
import { pickBestLayout } from "@/lib/layout-engine";
import type { SlideOverlay } from "@/lib/local-store";
import { loadFont, loadImage, overlayScriptFor } from "@/lib/text-overlay";

export type SlideCopy = { headline: string; subhead?: string; bullets?: string[]; cta?: string };
type Ratio = "1:1" | "4:5" | "9:16" | "16:9";

/** Strip text instructions from an image prompt so the model draws a clean background. */
export function textFreeSlidePrompt(prompt: string): string {
  const cleaned = prompt
    // Old prompts had whole sections telling the model what words to typeset.
    .replace(/^\s*(Main Headline|Subheadline|Feature Badges[^:]*|CTA|Typography)\s*:.*(\n[ \t]{4,}.*)*$/gim, "")
    // Old prompts quoted every headline/bullet/CTA "so the model renders them verbatim".
    .replace(/[“"][^"”\n]{1,160}[”"]/g, "")
    .replace(/Spell every word correctly\.?\s*No lorem ipsum\.?\s*No gibberish text\.?/gi, "");
  return (
    cleaned.trim() +
    "\n\nABSOLUTE RULE: this is a background artwork only. Do NOT render any text, words, letters, " +
    "numbers, headlines, captions, labels, badges with writing, buttons with writing, logos or watermarks. " +
    "Keep the reserved text zones calm and empty; the app adds all typography afterwards."
  );
}

/** Same auto-layout the slide editor uses, as editable text overlays. */
export function autoSlideOverlays(ratio: Ratio, copy: SlideCopy): SlideOverlay[] {
  if (!copy.headline) return [];
  const { overlays } = pickBestLayout({
    ratio,
    headline: copy.headline,
    subhead: copy.subhead,
    bullets: copy.bullets ?? [],
    cta: copy.cta,
  });
  return overlays.map((p) => ({
    id: crypto.randomUUID(),
    kind: "text" as const,
    text: p.text,
    xPct: p.xPct,
    yPct: p.yPct,
    widthPct: p.widthPct,
    fontSize: p.fontSize,
    color: "#ffffff",
    bg: p.role === "cta" ? "#111827" : "transparent",
    weight: p.weight,
    align: p.align,
    fontFamily: "Inter, system-ui, sans-serif",
  }));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxW || !line) line = next;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

/** Burn overlays into the background. Returns a PNG data URL. */
export async function renderSlideWithOverlays(baseSrc: string, overlays: SlideOverlay[]): Promise<string> {
  const img = await loadImage(baseSrc);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0);

  for (const ov of overlays) {
    const boxW = (ov.widthPct / 100) * W;
    const cx = (ov.xPct / 100) * W;
    const cy = (ov.yPct / 100) * H;
    if (ov.kind === "logo") {
      try {
        const m = await loadImage(ov.src);
        const h = (m.naturalHeight / m.naturalWidth) * boxW;
        ctx.globalAlpha = ov.opacity ?? 1;
        ctx.drawImage(m, cx - boxW / 2, cy - h / 2, boxW, h);
        ctx.globalAlpha = 1;
      } catch { /* skip unreachable logo */ }
      continue;
    }
    if (!ov.text.trim()) continue;
    const script = overlayScriptFor(ov.text);
    const family = script ? `"${script.family}", "Noto Sans"` : ov.fontFamily;
    await loadFont(script?.family ?? "Noto Sans");
    // Editor: font-size = fontSize/10 cqw of the overlay box.
    const fontPx = (ov.fontSize / 10) * (boxW / 100);
    ctx.font = `${ov.weight} ${fontPx}px ${family}`;
    const hasBg = ov.bg !== "transparent";
    const padX = hasBg ? fontPx * 0.6 : 0;
    const padY = hasBg ? fontPx * 0.4 : 0;
    const lines = wrap(ctx, ov.text, boxW - padX * 2);
    const lineH = fontPx * 1.15;
    const blockH = lines.length * lineH + padY * 2;
    const top = cy - blockH / 2;
    const left = cx - boxW / 2;
    if (hasBg) {
      const textW = Math.min(boxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2);
      const bx = ov.align === "left" ? left : ov.align === "right" ? left + boxW - textW : cx - textW / 2;
      ctx.fillStyle = ov.bg;
      ctx.beginPath();
      ctx.roundRect(bx, top, textW, blockH, Math.min(16, fontPx * 0.4));
      ctx.fill();
    }
    ctx.fillStyle = ov.color;
    ctx.textBaseline = "top";
    ctx.textAlign = ov.align;
    const tx = ov.align === "left" ? left + padX : ov.align === "right" ? left + boxW - padX : cx;
    if (!hasBg) {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = fontPx * 0.5;
      ctx.shadowOffsetY = 2;
    }
    lines.forEach((l, i) => ctx.fillText(l, tx, top + padY + i * lineH + (lineH - fontPx) / 2));
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  return canvas.toDataURL("image/png");
}

const RATIO_WH: Record<Ratio, [number, number]> = { "1:1": [1, 1], "4:5": [4, 5], "9:16": [9, 16], "16:9": [16, 9] };

/**
 * Turn a user-picked photo (library / free stock) into a slide background:
 * centre-crop to the slide ratio, cap the size, and dim it slightly so the
 * overlaid headline stays readable on busy photos.
 */
export async function photoToSlideBackground(src: string, ratio: Ratio, dim = 0.22): Promise<string> {
  const img = await loadImage(src);
  const [rw, rh] = RATIO_WH[ratio];
  const longest = 1440;
  const W = rw >= rh ? longest : Math.round((longest * rw) / rh);
  const H = rw >= rh ? Math.round((longest * rh) / rw) : longest;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  if (dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, W, H);
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}
