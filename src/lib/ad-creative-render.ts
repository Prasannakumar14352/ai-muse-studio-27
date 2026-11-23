// Draws an ad creative on a <canvas>. All text is real text (never AI-drawn),
// so spelling is always exact and every word stays editable.

export type AdFormat = "4:5" | "1:1" | "9:16";
export type AdLayout = "poster" | "photo" | "product";

export const AD_SIZES: Record<AdFormat, { w: number; h: number; label: string }> = {
  "4:5": { w: 1080, h: 1350, label: "Feed 4:5" },
  "1:1": { w: 1080, h: 1080, label: "Square 1:1" },
  "9:16": { w: 1080, h: 1920, label: "Story / Reel 9:16" },
};

export type AdSpec = {
  format: AdFormat;
  layout: AdLayout;
  brandName: string;
  colorA: string;
  colorB: string;
  headline: string;
  highlight: string;
  subline: string;
  tags: string[];
  cta: string;
  footer: string;
  badge: string;
};

export type AdImages = { image?: HTMLImageElement | null; logo?: HTMLImageElement | null };

const HEAD = '"Space Grotesk", "Inter", "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif';
const BODY = '"Inter", "Noto Sans Telugu", "Noto Sans Devanagari", sans-serif';

/** Which part of the ad the main image fills — used to pick the AI image ratio. */
export function imageRatioFor(layout: AdLayout, format: AdFormat): string {
  if (layout === "photo") return format;
  if (layout === "product") return "1:1";
  return format === "9:16" ? "4:5" : "4:3";
}

export async function loadAdFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`700 80px "Space Grotesk"`),
      document.fonts.load(`500 40px "Inter"`),
      document.fonts.load(`700 40px "Inter"`),
    ]);
  } catch { /* fall back to system fonts */ }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't load image"));
    el.src = src;
  });
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function grad(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, a: string, b: string) {
  const g = ctx.createLinearGradient(x, y, x + Math.max(1, w), y);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * s;
  const ih = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

type Line = Array<{ word: string; hi: boolean }>;

/** Word-wrap with highlighted words; shrinks the font until it fits maxLines. */
function layoutHeadline(
  ctx: CanvasRenderingContext2D, text: string, highlight: string, maxW: number,
  startSize: number, minSize: number, maxLines: number,
): { size: number; lines: Line[] } {
  const hi = new Set(highlight.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")));
  const words = text.trim().split(/\s+/).filter(Boolean).map((w) => ({ word: w, hi: hi.has(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")) }));
  let size = startSize;
  for (; size >= minSize; size -= 4) {
    ctx.font = `700 ${size}px ${HEAD}`;
    const lines: Line[] = [];
    let cur: Line = [];
    let ok = true;
    for (const w of words) {
      const test = [...cur, w].map((x) => x.word).join(" ");
      if (ctx.measureText(test).width <= maxW || cur.length === 0) {
        if (cur.length === 0 && ctx.measureText(w.word).width > maxW) ok = false;
        cur.push(w);
      } else {
        lines.push(cur);
        cur = [w];
      }
    }
    if (cur.length) lines.push(cur);
    if (ok && lines.length <= maxLines) return { size, lines };
  }
  ctx.font = `700 ${minSize}px ${HEAD}`;
  return { size: minSize, lines: [words] };
}

function drawHeadline(
  ctx: CanvasRenderingContext2D, spec: AdSpec, x: number, y: number, maxW: number,
  start: number, maxLines: number, align: "left" | "center", base = "#ffffff",
): number {
  const { size, lines } = layoutHeadline(ctx, spec.headline || " ", spec.highlight, maxW, start, 44, maxLines);
  ctx.font = `700 ${size}px ${HEAD}`;
  ctx.textBaseline = "top";
  const lh = size * 1.08;
  lines.forEach((line, i) => {
    const full = line.map((l) => l.word).join(" ");
    const lw = ctx.measureText(full).width;
    let cx = align === "center" ? x + (maxW - lw) / 2 : x;
    const ly = y + i * lh;
    line.forEach((w, j) => {
      const piece = j < line.length - 1 ? `${w.word} ` : w.word;
      const pw = ctx.measureText(piece).width;
      ctx.fillStyle = w.hi ? grad(ctx, cx, ly, ctx.measureText(w.word).width, spec.colorA, spec.colorB) : base;
      ctx.fillText(piece, cx, ly);
      cx += pw;
    });
  });
  return y + lines.length * lh;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

function drawParagraph(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number,
  size: number, color: string, align: "left" | "center", maxLines = 2,
): number {
  if (!text.trim()) return y;
  ctx.font = `500 ${size}px ${BODY}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  const lines = wrapText(ctx, text, maxW).slice(0, maxLines);
  lines.forEach((l, i) => {
    const lw = ctx.measureText(l).width;
    ctx.fillText(l, align === "center" ? x + (maxW - lw) / 2 : x, y + i * size * 1.3);
  });
  return y + lines.length * size * 1.3;
}

function tagRows(ctx: CanvasRenderingContext2D, spec: AdSpec, maxW: number, size: number) {
  const tags = spec.tags.map((t) => t.trim()).filter(Boolean).slice(0, 4);
  ctx.font = `600 ${size}px ${BODY}`;
  const padX = size * 0.9;
  const h = size * 2.1;
  const gap = size * 0.6;
  const widths = tags.map((t) => Math.min(maxW, ctx.measureText(t).width + padX * 2));
  const rows: number[][] = tags.length ? [[]] : [];
  let rowW = 0;
  widths.forEach((w, i) => {
    const add = rows[rows.length - 1].length ? gap + w : w;
    if (rowW + add > maxW && rows[rows.length - 1].length) { rows.push([i]); rowW = w; }
    else { rows[rows.length - 1].push(i); rowW += add; }
  });
  const height = rows.length ? rows.length * (h + gap) - gap : 0;
  return { tags, widths, rows, padX, h, gap, height };
}

/** Feature tags as pills, wrapped across rows and centred. Returns bottom y. */
function drawTags(
  ctx: CanvasRenderingContext2D, spec: AdSpec, x: number, y: number, maxW: number,
  size: number, style: "dark" | "light",
): number {
  const { tags, widths, rows, padX, h, gap, height } = tagRows(ctx, spec, maxW, size);
  if (!tags.length) return y;
  rows.forEach((row, r) => {
    const total = row.reduce((s, i) => s + widths[i], 0) + gap * (row.length - 1);
    let cx = x + (maxW - total) / 2;
    const cy = y + r * (h + gap);
    row.forEach((i) => {
      rr(ctx, cx, cy, widths[i], h, h / 2);
      if (style === "dark") {
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = grad(ctx, cx, cy, widths[i], spec.colorA, spec.colorB);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fill();
        ctx.fillStyle = "#111111";
      }
      ctx.textBaseline = "middle";
      ctx.fillText(tags[i], cx + padX, cy + h / 2 + 1);
      cx += widths[i] + gap;
    });
  });
  return y + height;
}

function drawCta(
  ctx: CanvasRenderingContext2D, spec: AdSpec, cx: number, y: number, size: number, style: "gradient" | "white",
): number {
  const label = spec.cta.trim();
  if (!label) return y;
  ctx.font = `700 ${size}px ${HEAD}`;
  const w = Math.min(ctx.canvas.width - 120, ctx.measureText(`${label}  →`).width + size * 2.4);
  const h = size * 2.2;
  const x = cx - w / 2;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = style === "gradient" ? grad(ctx, x, y, w, spec.colorA, spec.colorB) : "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = style === "gradient" ? "#ffffff" : "#111111";
  ctx.textBaseline = "middle";
  const tw = ctx.measureText(`${label}  →`).width;
  ctx.fillText(`${label}  →`, cx - tw / 2, y + h / 2 + 2);
  return y + h;
}

function drawBrand(ctx: CanvasRenderingContext2D, spec: AdSpec, logo: HTMLImageElement | null | undefined, x: number, y: number, color: string) {
  let cx = x;
  const size = 44;
  if (logo) {
    const h = 64;
    const w = Math.min(220, (logo.naturalWidth / logo.naturalHeight) * h);
    ctx.drawImage(logo, cx, y, w, h);
    cx += w + 16;
  }
  if (spec.brandName.trim()) {
    ctx.font = `700 ${size}px ${HEAD}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.fillText(spec.brandName.trim(), cx, y + 32);
  }
}

function drawBadge(ctx: CanvasRenderingContext2D, spec: AdSpec, rightX: number, y: number) {
  const t = spec.badge.trim();
  if (!t) return;
  ctx.font = `800 40px ${HEAD}`;
  const w = ctx.measureText(t).width + 56;
  const h = 76;
  const x = rightX - w;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-0.06);
  rr(ctx, -w / 2, -h / 2, w, h, 18);
  ctx.fillStyle = grad(ctx, -w / 2, 0, w, spec.colorA, spec.colorB);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(t, -w / 2 + 28, 2);
  ctx.restore();
}

function placeholder(ctx: CanvasRenderingContext2D, spec: AdSpec, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, spec.colorA + "55");
  g.addColorStop(1, spec.colorB + "55");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `600 36px ${BODY}`;
  ctx.textBaseline = "middle";
  const t = "Add a photo or generate one";
  ctx.fillText(t, x + (w - ctx.measureText(t).width) / 2, y + h / 2);
}

export function renderAd(canvas: HTMLCanvasElement, spec: AdSpec, imgs: AdImages): void {
  const { w: W, h: H } = AD_SIZES[spec.format];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  const M = 64;
  const tall = spec.format === "9:16";
  const square = spec.format === "1:1";

  if (spec.layout === "photo") {
    // Full-bleed photo, dark fade at the bottom, text over it.
    if (imgs.image) drawCover(ctx, imgs.image, 0, 0, W, H);
    else placeholder(ctx, spec, 0, 0, W, H);
    const fade = ctx.createLinearGradient(0, H * 0.35, 0, H);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(0.45, "rgba(0,0,0,0.72)");
    fade.addColorStop(1, "rgba(0,0,0,0.92)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);
    const top = ctx.createLinearGradient(0, 0, 0, 200);
    top.addColorStop(0, "rgba(0,0,0,0.55)");
    top.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 200);
    drawBrand(ctx, spec, imgs.logo, M, M, "#ffffff");
    drawBadge(ctx, spec, W - M, M - 4);

    // Measure the text block, then place it above the CTA.
    const ctaH = 46 * 2.2;
    const footerH = spec.footer.trim() ? 60 : 0;
    const off = document.createElement("canvas").getContext("2d")!;
    off.canvas.width = W;
    const headH = (() => {
      const { size, lines } = layoutHeadline(off, spec.headline || " ", spec.highlight, W - M * 2, square ? 92 : 104, 44, 3);
      return lines.length * size * 1.08;
    })();
    off.font = `500 40px ${BODY}`;
    const subH = spec.subline.trim() ? 40 * 1.3 * Math.min(2, wrapText(off, spec.subline, W - M * 2).length) + 20 : 0;
    const tagInfo = tagRows(off, spec, W - M * 2, 30);
    const tagsH = tagInfo.height ? tagInfo.height + 36 : 0;
    let y = H - M - footerH - ctaH - 40 - tagsH - subH - headH;
    // Soft shadow keeps text readable over busy photos.
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 18;
    y = drawHeadline(ctx, spec, M, y, W - M * 2, square ? 92 : 104, 3, "center");
    y = drawParagraph(ctx, spec.subline, M, y + 20, W - M * 2, 40, "rgba(255,255,255,0.92)", "center");
    ctx.shadowBlur = 0;
    if (tagInfo.height) y = drawTags(ctx, spec, M, y + 36, W - M * 2, 30, "dark");
    y = drawCta(ctx, spec, W / 2, y + 40, 46, "gradient");
    drawParagraph(ctx, spec.footer, M, y + 22, W - M * 2, 32, "rgba(255,255,255,0.8)", "center", 1);
    return;
  }

  if (spec.layout === "product") {
    // Brand-colour background, product photo on a white card.
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, spec.colorA);
    bg.addColorStop(1, spec.colorB);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath(); ctx.arc(W * 0.85, H * 0.12, W * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.1, H * 0.9, W * 0.3, 0, Math.PI * 2); ctx.fill();
    drawBrand(ctx, spec, imgs.logo, M, M, "#ffffff");
    drawBadge(ctx, spec, W - M, M - 4);
    let y = M + 110;
    // Highlighted words in dark ink, since the background is already the brand colour.
    y = drawHeadline(ctx, { ...spec, colorA: "#111111", colorB: "#111111" }, M, y, W - M * 2, square ? 84 : 96, 2, "center");
    y = drawParagraph(ctx, spec.subline, M, y + 16, W - M * 2, 38, "rgba(255,255,255,0.95)", "center");
    const tagsH = tagRows(ctx, spec, W - M * 2, 30).height;
    const reserve = 46 * 2.2 + (spec.footer.trim() ? 60 : 0) + (tagsH ? tagsH + 32 : 0) + M + 70;
    const cardH = Math.max(260, H - reserve - (y + 36));
    const cardW = Math.min(W - M * 2, cardH * (tall ? 0.95 : 1.25));
    const cx = (W - cardW) / 2;
    const cy = y + 36;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 40;
    rr(ctx, cx, cy, cardW, cardH, 36);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, cx + 14, cy + 14, cardW - 28, cardH - 28, 26);
    ctx.clip();
    if (imgs.image) drawCover(ctx, imgs.image, cx + 14, cy + 14, cardW - 28, cardH - 28);
    else placeholder(ctx, spec, cx + 14, cy + 14, cardW - 28, cardH - 28);
    ctx.restore();
    y = cy + cardH;
    if (spec.tags.some((t) => t.trim())) y = drawTags(ctx, spec, M, y + 32, W - M * 2, 30, "light");
    y = drawCta(ctx, spec, W / 2, y + 36, 46, "white");
    drawParagraph(ctx, spec.footer, M, y + 22, W - M * 2, 32, "#ffffff", "center", 1);
    return;
  }

  // "poster": dark background, headline on top, image card, tags, CTA.
  ctx.fillStyle = "#0b0b12";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, W * 0.9);
  glow.addColorStop(0, spec.colorB + "55");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(0, H, 0, 0, H, W * 0.8);
  glow2.addColorStop(0, spec.colorA + "44");
  glow2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);
  drawBrand(ctx, spec, imgs.logo, M, M, "#ffffff");
  drawBadge(ctx, spec, W - M, M - 4);
  let y = M + 110;
  y = drawHeadline(ctx, spec, M, y, W - M * 2, square ? 84 : 100, 3, "left");
  y = drawParagraph(ctx, spec.subline, M, y + 16, W - M * 2, 38, "rgba(255,255,255,0.82)", "left");
  if (spec.tags.some((t) => t.trim())) y = drawTags(ctx, spec, M, y + 34, W - M * 2, 30, "dark");
  const bottom = 46 * 2.2 + (spec.footer.trim() ? 60 : 0) + M + 40;
  const imgY = y + 40;
  const imgH = Math.max(220, H - bottom - imgY - 30);
  ctx.save();
  rr(ctx, M, imgY, W - M * 2, imgH, 32);
  ctx.clip();
  if (imgs.image) drawCover(ctx, imgs.image, M, imgY, W - M * 2, imgH);
  else placeholder(ctx, spec, M, imgY, W - M * 2, imgH);
  ctx.restore();
  rr(ctx, M, imgY, W - M * 2, imgH, 32);
  ctx.lineWidth = 4;
  ctx.strokeStyle = grad(ctx, M, imgY, W - M * 2, spec.colorA, spec.colorB);
  ctx.stroke();
  y = drawCta(ctx, spec, W / 2, imgY + imgH + 34, 46, "gradient");
  drawParagraph(ctx, spec.footer, M, y + 22, W - M * 2, 32, "rgba(255,255,255,0.75)", "center", 1);
}
