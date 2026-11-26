// Self-hosted Noto fonts for Promo Studio renders (design §8). Fonts are registered with
// FontFace for the preview and embedded as data: URLs for html-to-image, so exported PNGs
// never fall back to tofu for Telugu / Devanagari.
const FILES: Record<string, { family: string; weight: number; file: string }[]> = {
  en: [
    { family: "Noto Sans", weight: 700, file: "NotoSans-Bold.woff2" },
    { family: "Noto Sans", weight: 900, file: "NotoSans-Black.woff2" },
  ],
  te: [{ family: "Noto Sans Telugu", weight: 700, file: "NotoSansTelugu-Bold.woff2" }],
  hi: [{ family: "Noto Sans Devanagari", weight: 700, file: "NotoSansDevanagari-Bold.woff2" }],
};

const cache = new Map<string, Promise<string>>();

function toDataUrl(buf: ArrayBuffer): string {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(bin)}`;
}

async function load(f: { family: string; weight: number; file: string }): Promise<string> {
  const buf = await (await fetch(`/promo-fonts/${f.file}`)).arrayBuffer();
  const face = new FontFace(f.family, buf, { weight: String(f.weight) });
  await face.load();
  document.fonts.add(face);
  return `@font-face{font-family:"${f.family}";font-weight:${f.weight};src:url(${toDataUrl(buf)}) format("woff2");}`;
}

/** Loads the fonts a language needs (Latin always) and returns the fontEmbedCSS string. */
export async function promoFontCss(language: string): Promise<string> {
  const list = [...FILES.en, ...(language !== "en" ? (FILES[language] ?? []) : [])];
  const css = await Promise.all(
    list.map((f) => {
      if (!cache.has(f.file)) cache.set(f.file, load(f));
      return cache.get(f.file)!;
    }),
  );
  await document.fonts.ready;
  return css.join("\n");
}
