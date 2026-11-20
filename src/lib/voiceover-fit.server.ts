// Shorten narration lines that won't fit their scene, in the scene's language.
import { aiChatFetch } from "@/lib/ai-provider";
import { parseStructuredJsonResponse } from "@/lib/video-json";
import { countWords } from "@/lib/video-duration";

export type LineToFit = { n: number; text: string; maxWords: number };

/**
 * Rewrite each over-long line to at most `maxWords` words, keeping meaning,
 * language and script. Lines still over after a round are retried with a
 * tighter target; after `rounds` AI attempts the line is trimmed to its first
 * `maxWords` words so approval is never left blocked. Returns n → new text for
 * every input line.
 *
 * The limit is exact: the blueprint validator flags anything over `maxWords`,
 * so a "+1 slack" acceptance used to leave lines that were saved but still
 * flagged — and a second click sent the same request again.
 */
export async function shortenLinesWithAi(
  key: string,
  lines: LineToFit[],
  language: string,
  rounds = 3,
  trimmed?: Set<number>,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  let pending = lines.filter((l) => l.text.trim());
  for (let round = 0; round < rounds && pending.length; round++) {
    // Each retry aims lower, so the model actually cuts instead of paraphrasing.
    const target = (l: LineToFit) => Math.max(1, l.maxWords - round);
    let rewritten: Map<number, string>;
    try {
      rewritten = await rewriteOnce(key, pending.map((l) => ({ ...l, maxWords: target(l) })), language, round > 0);
    } catch {
      rewritten = new Map();
    }
    const still: LineToFit[] = [];
    for (const l of pending) {
      const t = rewritten.get(l.n);
      if (t && countWords(t) <= l.maxWords) out.set(l.n, t);
      else still.push(t ? { ...l, text: t } : l); // keep the shorter attempt as the next input
    }
    pending = still;
  }
  for (const l of pending) {
    out.set(l.n, trimToWords(l.text, l.maxWords));
    trimmed?.add(l.n);
  }
  return out;
}

/** Last resort: first `max` words, without a dangling comma/conjunction-style punctuation. */
export function trimToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, Math.max(1, max)).join(" ").replace(/[,;:–—-]+$/u, "");
}

async function rewriteOnce(key: string, lines: LineToFit[], language: string, aggressive: boolean): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!lines.length) return out;
  const user = `Rewrite each narration line so it can be spoken in its time slot.
Language: ${language} — keep the SAME language and script (do not translate, do not transliterate).
Rules:
- Each line must have AT MOST its "max_words" words (count whitespace-separated words). This is a hard limit.
- Keep the core meaning and the hook; drop filler words, not the point.
- No ellipses, no new facts.${aggressive ? `
- Your previous rewrite was still too long. Be ruthless: keep only the single most important idea,
  use the shortest everyday words, and drop qualifiers, examples and connectors. A 2-word line is fine.` : ""}

Lines:
${lines.map((l) => JSON.stringify({ n: l.n, max_words: l.maxWords, text: l.text })).join("\n")}

Return ONLY JSON: { "lines": [ { "n": 1, "text": "..." } ] }`;
  const res = await aiChatFetch({
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a precise script editor. Return only valid JSON." },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
    }),
  });
  if (!res.ok) return out;
  const j = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = parseStructuredJsonResponse(j.choices?.[0]?.message?.content ?? "");
  const rows = ((parsed.value as { lines?: Array<{ n?: number; text?: string }> } | null)?.lines ?? []);
  for (const r of rows) {
    const text = (r.text ?? "").trim();
    if (typeof r.n === "number" && text) out.set(r.n, text);
  }
  return out;
}
