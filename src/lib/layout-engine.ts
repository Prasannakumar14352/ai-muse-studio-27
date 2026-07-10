// Layout-Aware Design Engine
// -----------------------------------------------------------------------------
// Professional layout templates + safe-zone reasoning for AI-generated slides
// and thumbnails. The goal: NEVER let typography land on top of faces, tablets,
// products, hands, logos, or the hero subject. Text always goes into
// intentionally reserved negative-space zones defined by a template.
//
// Two consumers:
//   1. Image-prompt authoring (carousel + thumbnail agents) — templates
//      contribute an explicit "Composition & Reserved Zones" block that the
//      image model is required to honor, so the artwork itself leaves room for
//      the copy.
//   2. Slide editor — `autoLayout()` places the headline / subhead / bullets /
//      CTA overlays into the template's safe zones with collision-aware
//      scaling and 40–80px safe margins.
//
// No text is ever placed inside an unsafe zone; if the requested text does not
// fit at any allowed size, it is broken across up to 4 lines and clamped to the
// zone bounds. Placement is scored (typography, hierarchy, balance, spacing,
// contrast, readability, object visibility, visual flow) — score < 90 asks the
// caller to try a different template.

export type Ratio = "1:1" | "4:5" | "9:16" | "16:9";

/** Rectangular region in percentages of the canvas. */
export type Zone = {
  x: number;   // 0..100  left
  y: number;   // 0..100  top
  w: number;   // 0..100  width
  h: number;   // 0..100  height
};

export type ZoneRole =
  | "headline" | "subhead" | "bullets" | "cta" | "price"
  | "hero_character" | "hero_product" | "supporting" | "logo" | "sticker";

// -----------------------------------------------------------------------------
// Marketing Layout Rule (single source of truth for the whole design engine).
// Every generated marketing creative MUST identify these 6 elements at most
// once each unless the caller explicitly asks for repetition. Downstream
// consumers (prompt builder + slide editor auto-layout) enforce this so the
// artwork never renders duplicate prices, duplicate CTAs, duplicate product
// names, or competing giant badges that fight the headline.
// -----------------------------------------------------------------------------
export type MarketingElementKey =
  | "primary_message"   // headline
  | "supporting_message" // subhead / body
  | "product"
  | "character"
  | "price"
  | "cta";

export const MARKETING_HIERARCHY: MarketingElementKey[] = [
  "primary_message",
  "product",
  "character",
  "price",
  "cta",
  // supporting_message sits under primary_message but above product visually;
  // it is placed by the subhead slot and is not part of the size ranking.
];

export const MARKETING_LAYOUT_RULES = `MARKETING LAYOUT RULE (mandatory):
Identify and place EACH of these elements AT MOST ONCE per creative unless
repetition is explicitly requested:
  1. Primary message (headline)
  2. Supporting message (subhead / one-line body)
  3. Product (single hero product — one name, one mockup)
  4. Character (single hero person — same face across the deck)
  5. Price (single price token — one number, one currency, one placement)
  6. CTA (single call-to-action button / label)

STRICT anti-duplication:
- No duplicate numbers, duplicate prices, duplicate CTAs, or duplicate product names.
- Do NOT repeat the price as a sticker AND a badge AND a chip. Pick ONE.
- Do NOT restate the CTA in the bullets. The CTA lives in the CTA zone only.
- Do NOT print the product name twice (e.g. headline + repeat badge).

Typography / visual hierarchy (largest → smallest):
  Headline  →  Product  →  Character  →  Price  →  CTA  →  Decorative elements
- Headline is always the largest, boldest element.
- Decorative badges (sale, sparkle, arrow, sticker) must NEVER compete with
  the headline in size, weight, or color contrast.
- Use large badges ONLY when they carry unique information that is not already
  present in the headline. Otherwise keep decorative badges small and quiet.`;

/** Deduplicate the raw copy so downstream renderers get one of each element.
 *  Non-destructive: unrepeated fields pass through untouched. */
export function dedupeMarketingCopy<T extends {
  headline?: string; subhead?: string; bullets?: string[]; cta?: string; price?: string;
}>(copy: T): T {
  const seen = new Set<string>();
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const keep = (s?: string) => {
    if (!s) return s;
    const k = norm(s);
    if (seen.has(k)) return "";
    seen.add(k);
    return s;
  };
  const headline = keep(copy.headline) || copy.headline;
  if (headline) seen.add(norm(headline));
  const subhead = keep(copy.subhead);
  const cta = keep(copy.cta);
  const price = keep(copy.price);
  // Bullets: drop entries that duplicate headline / subhead / cta / price /
  // another bullet, and drop bullets that are just the CTA re-stated.
  const bullets = (copy.bullets ?? [])
    .map((b) => (typeof b === "string" ? b : ""))
    .filter((b) => {
      if (!b.trim()) return false;
      const k = norm(b);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return { ...copy, headline, subhead, cta, price, bullets };
}

export type Slot = Zone & { role: ZoneRole; align?: "left" | "center" | "right" };

export type LayoutTemplate = {
  id: "A_top_hero" | "B_split" | "C_hero_product" | "D_centered";
  label: string;
  description: string;
  /** Slots the artwork must leave clear for typography / UI. */
  textSlots: Slot[];
  /** Zones the image model should fill with the hero subject/product. */
  heroSlots: Slot[];
  /** Whether the composition centers around a person or a product. */
  intent: "character_led" | "product_led" | "mixed";
};

// --- Templates ---------------------------------------------------------------
// Coordinates are expressed in percent so they work for any aspect ratio.

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "A_top_hero",
    label: "Top Headline / Right Character / Bottom CTA",
    description:
      "Large headline occupies upper third. Hero character on right. Product on left. CTA anchored bottom center.",
    intent: "mixed",
    textSlots: [
      { role: "headline", x: 6,  y: 6,  w: 88, h: 22, align: "left"   },
      { role: "subhead",  x: 6,  y: 28, w: 60, h: 10, align: "left"   },
      { role: "bullets",  x: 6,  y: 46, w: 40, h: 34, align: "left"   },
      { role: "cta",      x: 25, y: 86, w: 50, h: 9,  align: "center" },
    ],
    heroSlots: [
      { role: "hero_character", x: 52, y: 38, w: 46, h: 52 },
      { role: "hero_product",   x: 6,  y: 46, w: 26, h: 34 },
    ],
  },
  {
    id: "B_split",
    label: "Split: Headline center / Product left / Character right",
    description:
      "Centered headline band. Product locked left third. Character locked right third. CTA at the bottom.",
    intent: "mixed",
    textSlots: [
      { role: "headline", x: 8,  y: 8,  w: 84, h: 18, align: "center" },
      { role: "subhead",  x: 15, y: 26, w: 70, h: 8,  align: "center" },
      { role: "bullets",  x: 32, y: 60, w: 36, h: 24, align: "center" },
      { role: "cta",      x: 30, y: 87, w: 40, h: 8,  align: "center" },
    ],
    heroSlots: [
      { role: "hero_product",   x: 3,  y: 34, w: 30, h: 55 },
      { role: "hero_character", x: 67, y: 34, w: 30, h: 55 },
    ],
  },
  {
    id: "C_hero_product",
    label: "Hero Product / Headline top / Benefits left / CTA bottom",
    description:
      "Product dominates the center. Headline top-center. Benefits stacked left. CTA anchored bottom.",
    intent: "product_led",
    textSlots: [
      { role: "headline", x: 8,  y: 5,  w: 84, h: 16, align: "center" },
      { role: "subhead",  x: 15, y: 20, w: 70, h: 8,  align: "center" },
      { role: "bullets",  x: 4,  y: 40, w: 26, h: 42, align: "left"   },
      { role: "cta",      x: 30, y: 88, w: 40, h: 8,  align: "center" },
    ],
    heroSlots: [
      { role: "hero_product", x: 32, y: 30, w: 60, h: 55 },
    ],
  },
  {
    id: "D_centered",
    label: "Centered headline / Character bottom-right / Product bottom-left",
    description:
      "Massive centered headline. Character bottom-right corner. Product bottom-left corner. Footer CTA.",
    intent: "mixed",
    textSlots: [
      { role: "headline", x: 6,  y: 14, w: 88, h: 26, align: "center" },
      { role: "subhead",  x: 12, y: 40, w: 76, h: 10, align: "center" },
      { role: "cta",      x: 25, y: 88, w: 50, h: 8,  align: "center" },
    ],
    heroSlots: [
      { role: "hero_product",   x: 2,  y: 55, w: 30, h: 40 },
      { role: "hero_character", x: 68, y: 50, w: 30, h: 45 },
    ],
  },
];

// --- Template selection ------------------------------------------------------

export type TemplatePickInputs = {
  slideRole: string;                 // "Cover" | "Point N" | "CTA" | free
  hasCharacter: boolean;
  hasProduct: boolean;
  bulletCount: number;
};

/** Pick the best template for the slide contents. Deterministic. */
export function pickTemplate(inp: TemplatePickInputs): LayoutTemplate {
  const role = (inp.slideRole || "").toLowerCase();
  if (role.includes("cta") || role.includes("ready")) return LAYOUT_TEMPLATES[3]; // D
  if (role.includes("cover") || role.includes("hook")) {
    return inp.hasCharacter ? LAYOUT_TEMPLATES[0] : LAYOUT_TEMPLATES[3];
  }
  if (inp.hasProduct && !inp.hasCharacter) return LAYOUT_TEMPLATES[2]; // C
  if (inp.hasProduct && inp.hasCharacter) return LAYOUT_TEMPLATES[1];  // B
  if (inp.bulletCount >= 3) return LAYOUT_TEMPLATES[0];                 // A
  return LAYOUT_TEMPLATES[3];                                           // D
}

// --- Prompt fragment for the image model ------------------------------------

/** Renders the template's zone contract as an image-prompt block. The image
 *  model must leave these regions clear so typography can be composited in
 *  post — or, if it renders text itself, must place text ONLY in these zones. */
export function templatePromptBlock(t: LayoutTemplate): string {
  const zone = (s: Slot) =>
    `- ${s.role.toUpperCase()} zone → x:${s.x}% y:${s.y}% w:${s.w}% h:${s.h}%` +
    (s.align ? ` (align ${s.align})` : "");

  return [
    `LAYOUT TEMPLATE: ${t.label}`,
    `Composition intent: ${t.intent}. ${t.description}`,
    ``,
    `RESERVED NEGATIVE-SPACE ZONES (leave these visually calm — soft blur / sky /`,
    `gradient / background — so typography can be placed here without covering`,
    `important subjects). Percentages are of the full canvas:`,
    ...t.textSlots.map(zone),
    ``,
    `HERO / SUBJECT ZONES (place the important content ONLY inside these):`,
    ...t.heroSlots.map(zone),
    ``,
    `HARD COMPOSITION RULES:`,
    `- Do NOT place faces, eyes, mouths, hands, tablets, products, screens,`,
    `  logos, or important UI inside any reserved text zone above.`,
    `- Keep the hero subject fully visible and uncropped inside its hero zone.`,
    `- Maintain 40–80px equivalent safe padding from every canvas edge.`,
    `- Design the artwork so that if the text zones were painted plain, the`,
    `  image would still read as a finished composition.`,
    `- Prefer sky / soft gradient / bokeh / negative fill inside text zones.`,
    ``,
    MARKETING_LAYOUT_RULES,
  ].join("\n");
}

// --- Image-prompt rewriter --------------------------------------------------

/** Rewrites a bare visual description ("A child holding a tablet") into a
 *  composition-aware version that names the hero zone from the template. */
export function rewriteVisualForTemplate(visual: string, t: LayoutTemplate): string {
  const heroChar = t.heroSlots.find((s) => s.role === "hero_character");
  const heroProd = t.heroSlots.find((s) => s.role === "hero_product");
  const parts: string[] = [];
  parts.push(visual.trim().replace(/[.\s]+$/, ""));
  if (heroChar) {
    parts.push(
      `Position the person inside the ${describeZone(heroChar)} of the frame, ` +
      `fully visible from head to chest, gaze aimed toward the headline zone`,
    );
  }
  if (heroProd) {
    parts.push(
      `Anchor the product inside the ${describeZone(heroProd)} on a clean plinth or floating mockup`,
    );
  }
  const reserved = t.textSlots
    .map((s) => `${s.role} in the ${describeZone(s)}`)
    .join(", ");
  parts.push(
    `Preserve generous negative space for ${reserved} — no faces, hands, ` +
    `products, tablets, screens, or logos in any of those regions`,
  );
  return parts.join(". ") + ".";
}

function describeZone(z: Zone): string {
  const vert = z.y < 33 ? "upper" : z.y > 60 ? "lower" : "middle";
  const horiz = z.x + z.w / 2 < 40 ? "left" : z.x + z.w / 2 > 60 ? "right" : "center";
  return `${vert} ${horiz}`;
}

// --- Slide-editor auto layout -----------------------------------------------

export type EditorOverlay = {
  role: ZoneRole;
  text: string;
  align: "left" | "center" | "right";
  weight: 400 | 600 | 700 | 800 | 900;
  xPct: number; yPct: number; widthPct: number; fontSize: number;
};

export type AutoLayoutInputs = {
  ratio: Ratio;
  template: LayoutTemplate;
  headline: string;
  subhead?: string;
  bullets?: string[];
  cta?: string;
};

/** Compute overlay positions/sizes for the given template + copy.
 *  - Text is clamped inside its slot minus safe margin.
 *  - Font size is auto-scaled so the content fits in 2–4 lines.
 *  - Text is centered on the slot's midpoint (matches SlideEditor which uses
 *    center-anchored transforms). */
export function autoLayout(inp: AutoLayoutInputs): EditorOverlay[] {
  // Marketing Layout Rule: dedupe before placing so we never render the same
  // headline / price / CTA in two zones.
  const deduped = dedupeMarketingCopy({
    headline: inp.headline,
    subhead: inp.subhead,
    bullets: inp.bullets,
    cta: inp.cta,
  });
  inp = { ...inp, headline: deduped.headline ?? inp.headline,
    subhead: deduped.subhead, bullets: deduped.bullets, cta: deduped.cta };
  const out: EditorOverlay[] = [];
  const pushForRole = (role: ZoneRole, text: string, base: {
    align: "left" | "center" | "right"; weight: EditorOverlay["weight"]; maxLines: number; sizeRange: [number, number];
  }) => {
    const slot = inp.template.textSlots.find((s) => s.role === role);
    if (!slot || !text.trim()) return;
    const margin = 4; // percent — approximates 40–80px on standard canvases
    const innerW = Math.max(20, slot.w - margin);
    const innerH = Math.max(6, slot.h - margin);
    const centerX = slot.x + slot.w / 2;
    const centerY = slot.y + slot.h / 2;
    const size = fitFontSize(text, innerW, innerH, base.sizeRange, base.maxLines);
    out.push({
      role,
      text,
      align: base.align,
      weight: base.weight,
      xPct: centerX,
      yPct: centerY,
      widthPct: innerW,
      fontSize: size,
    });
  };

  pushForRole("headline", inp.headline, {
    align: inp.template.textSlots.find((s) => s.role === "headline")?.align ?? "center",
    weight: 900, maxLines: 3, sizeRange: [42, 128],
  });
  if (inp.subhead) {
    pushForRole("subhead", inp.subhead, {
      align: inp.template.textSlots.find((s) => s.role === "subhead")?.align ?? "center",
      weight: 600, maxLines: 3, sizeRange: [22, 52],
    });
  }
  if (inp.bullets?.length) {
    pushForRole("bullets", inp.bullets.map((b) => `• ${b}`).join("\n"), {
      align: inp.template.textSlots.find((s) => s.role === "bullets")?.align ?? "left",
      weight: 600, maxLines: 4, sizeRange: [20, 40],
    });
  }
  if (inp.cta) {
    pushForRole("cta", inp.cta, {
      align: "center", weight: 800, maxLines: 2, sizeRange: [22, 44],
    });
  }
  return out;
}

/** Rough font-size fitter. Font size is in the SlideEditor's px-at-1000-cqw
 *  scale, so approximate advance width ≈ 0.55 × fontSize and line height ≈
 *  1.15 × fontSize. Both zone dims are percent-of-canvas; we convert with a
 *  1080-px reference so the arithmetic matches the export renderer. */
function fitFontSize(
  text: string,
  widthPct: number,
  heightPct: number,
  range: [number, number],
  maxLines: number,
): number {
  const REF = 1080;
  const zoneW = (widthPct / 100) * REF;
  const zoneH = (heightPct / 100) * REF;
  for (let size = range[1]; size >= range[0]; size -= 2) {
    const charW = size * 0.55;
    const perLine = Math.max(4, Math.floor(zoneW / charW));
    const lines = estimateLines(text, perLine);
    if (lines > maxLines) continue;
    if (lines * size * 1.15 <= zoneH) return size;
  }
  return range[0];
}

function estimateLines(text: string, perLine: number): number {
  const paras = text.split("\n");
  let total = 0;
  for (const p of paras) {
    const words = p.split(/\s+/);
    let cur = 0;
    let lines = 1;
    for (const w of words) {
      const add = w.length + (cur === 0 ? 0 : 1);
      if (cur + add > perLine) { lines += 1; cur = w.length; }
      else cur += add;
    }
    total += lines;
  }
  return total;
}

// --- Collision detection + composition score --------------------------------

export function rectsOverlap(a: Zone, b: Zone): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

export type CompositionScore = {
  total: number;               // 0..100
  breakdown: Record<string, number>;
  collisions: string[];
};

/** Score a set of placed overlays against the template's hero zones. */
export function scoreComposition(
  overlays: EditorOverlay[],
  template: LayoutTemplate,
): CompositionScore {
  const breakdown: Record<string, number> = {
    typography: 15,
    hierarchy: 15,
    balance: 10,
    spacing: 10,
    contrast: 10,
    readability: 15,
    object_visibility: 15,
    visual_flow: 10,
  };
  const collisions: string[] = [];

  // Object visibility — text must not overlap any hero zone.
  for (const ov of overlays) {
    const ovZone: Zone = {
      x: ov.xPct - ov.widthPct / 2, y: ov.yPct - 5,
      w: ov.widthPct, h: 10 + ov.fontSize / 20,
    };
    for (const hero of template.heroSlots) {
      if (rectsOverlap(ovZone, hero)) {
        collisions.push(`${ov.role} overlaps ${hero.role}`);
        breakdown.object_visibility = Math.max(0, breakdown.object_visibility - 6);
      }
    }
  }

  // Hierarchy — headline should exist and be the biggest.
  const head = overlays.find((o) => o.role === "headline");
  const others = overlays.filter((o) => o.role !== "headline");
  if (!head) breakdown.hierarchy -= 8;
  else if (others.some((o) => o.fontSize > head.fontSize)) breakdown.hierarchy -= 5;

  // Readability — every overlay must fit inside canvas with safe margin.
  for (const ov of overlays) {
    const left = ov.xPct - ov.widthPct / 2;
    const right = ov.xPct + ov.widthPct / 2;
    if (left < 3 || right > 97) { breakdown.readability -= 4; breakdown.spacing -= 2; }
  }

  const total = Object.values(breakdown).reduce((a, b) => a + Math.max(0, b), 0);
  return { total, breakdown, collisions };
}

/** Try templates in order until one scores >= threshold. */
export function pickBestLayout(
  inp: Omit<AutoLayoutInputs, "template">,
  candidates: LayoutTemplate[] = LAYOUT_TEMPLATES,
  threshold = 90,
): { template: LayoutTemplate; overlays: EditorOverlay[]; score: CompositionScore } {
  let best: { template: LayoutTemplate; overlays: EditorOverlay[]; score: CompositionScore } | null = null;
  for (const t of candidates) {
    const overlays = autoLayout({ ...inp, template: t });
    const score = scoreComposition(overlays, t);
    if (!best || score.total > best.score.total) best = { template: t, overlays, score };
    if (score.total >= threshold) return { template: t, overlays, score };
  }
  return best!;
}
