/**
 * Prompt checks for the Images page: does the prompt need the HD model, and
 * does it already name a style that clashes with the selected style chip?
 */

/** Style chip id meaning "add nothing — use the style written in the prompt". */
export const AS_DESCRIBED_STYLE = "none";

/** Text the image must render (quoted strings, speech bubbles, headlines…), or a very busy scene. */
export function promptNeedsHd(prompt: string): { needs: boolean; reason: string } {
  const p = prompt.toLowerCase();
  const quoted = (prompt.match(/["“”][^"“”]{2,}["“”]/g) ?? []).length;
  if (quoted > 0 || /\b(speech bubble|headline|caption|label(?:ed|led)?|title text|written|says?|saying|text that reads)\b/.test(p)) {
    return { needs: true, reason: "This image has text in it — HD spells it correctly." };
  }
  const words = prompt.trim().split(/\s+/).length;
  if (words > 90) return { needs: true, reason: "This is a detailed scene — HD keeps every element." };
  return { needs: false, reason: "" };
}

const STYLE_PATTERNS: Array<{ id: string; re: RegExp; phrase: string }> = [
  { id: "pixar", re: /\b(3d cartoon|cartoon|pixar|animated movie|disney)\b/, phrase: "cartoon" },
  { id: "ghibli", re: /\b(ghibli|watercolou?r|hand-painted)\b/, phrase: "hand-painted" },
  { id: "anime", re: /\b(anime|manga)\b/, phrase: "anime" },
  { id: "realistic", re: /\b(photo-?realistic|photograph|real photo|dslr|85mm)\b/, phrase: "photorealistic" },
  { id: "cyberpunk", re: /\bcyberpunk\b/, phrase: "cyberpunk" },
  { id: "minimal", re: /\b(minimalist|flat illustration|flat vector)\b/, phrase: "minimal/flat" },
  { id: "3d", re: /\b(3d render|cgi|blender)\b/, phrase: "3D render" },
];

/** The style the prompt itself asks for, if any. */
export function detectPromptStyle(prompt: string): { id: string; phrase: string } | null {
  const p = prompt.toLowerCase();
  for (const s of STYLE_PATTERNS) if (s.re.test(p)) return { id: s.id, phrase: s.phrase };
  return null;
}

/** Style ids that don't clash with each other (a 3D cartoon prompt fits the "3D" chip too). */
const COMPATIBLE: Record<string, string[]> = {
  pixar: ["pixar", "3d"],
  "3d": ["3d", "pixar"],
  ghibli: ["ghibli", "anime"],
  anime: ["anime", "ghibli"],
  realistic: ["realistic", "cinematic", "documentary"],
  cyberpunk: ["cyberpunk"],
  minimal: ["minimal"],
};

export function styleClashes(selected: string, detected: string | null): boolean {
  if (!detected || selected === AS_DESCRIBED_STYLE) return false;
  return !(COMPATIBLE[detected] ?? [detected]).includes(selected);
}
