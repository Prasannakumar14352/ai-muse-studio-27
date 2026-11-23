// Script → Video: turn a creator's own script into scenes WITHOUT changing a
// word. Each line (or sentence, for long lines) becomes one scene whose
// voiceover is exactly that text. Shared by the browser (length estimate,
// preview) and the server (scene planning).
import { countWords, speechWordsPerSecond } from "@/lib/video-duration";

export const SCRIPT_MAX_CHARS = 5000;
/** A line longer than this is split at sentence ends so a scene stays watchable. */
const MAX_WORDS_PER_SCENE = 28;
const MAX_SCENES = 120;

/** Split a script into scene lines, keeping every word and its order. */
export function splitScriptIntoLines(script: string): string[] {
  const lines = script
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    if (countWords(line) <= MAX_WORDS_PER_SCENE) { out.push(line); continue; }
    // Sentence ends in Latin, Indic (।) and other scripts; keep the punctuation.
    const parts = line.match(/[^.!?।॥…]+(?:[.!?।॥…]+["”’')\]]*|$)/g)?.map((p) => p.trim()).filter(Boolean) ?? [line];
    let cur = "";
    for (const p of parts) {
      const next = cur ? `${cur} ${p}` : p;
      if (cur && countWords(next) > MAX_WORDS_PER_SCENE) { out.push(cur); cur = p; }
      else cur = next;
    }
    if (cur) out.push(cur);
  }
  if (out.length <= MAX_SCENES) return out;
  // Very long scripts: join neighbours so the scene count stays manageable.
  const per = Math.ceil(out.length / MAX_SCENES);
  const merged: string[] = [];
  for (let i = 0; i < out.length; i += per) merged.push(out.slice(i, i + per).join(" "));
  return merged;
}

/** Seconds to speak one line at a natural pace for the language (min 2.5 s per scene). */
export function lineSeconds(line: string, language?: string | null): number {
  const wps = speechWordsPerSecond(language);
  return Math.max(2.5, countWords(line) / wps + 0.6);
}

/** Estimated video length for a script, in whole seconds. */
export function estimateScriptSeconds(script: string, language?: string | null): number {
  return Math.round(splitScriptIntoLines(script).reduce((s, l) => s + lineSeconds(l, language), 0));
}

export type RewriteGoal = "hook" | "tighter" | "emotional" | "simpler" | "fit";
export const REWRITE_GOALS: Array<{ id: RewriteGoal; label: string; hint: string }> = [
  { id: "hook", label: "Stronger hook", hint: "Grab attention in the first 3 seconds" },
  { id: "tighter", label: "Shorter & tighter", hint: "Cut filler, keep every point" },
  { id: "emotional", label: "More emotional", hint: "Warmer, more feeling" },
  { id: "simpler", label: "Simpler words", hint: "Easy for everyone to follow" },
  { id: "fit", label: "Fit a length", hint: "Match 30 s, 60 s or 90 s" },
];
