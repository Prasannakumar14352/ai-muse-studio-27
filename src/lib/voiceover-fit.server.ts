// Shorten narration lines that won't fit their scene, in the scene's language.
import { aiChatFetch } from "@/lib/ai-provider";
import { parseStructuredJsonResponse } from "@/lib/video-json";
import { countWords } from "@/lib/video-duration";

export type LineToFit = { n: number; text: string; maxWords: number };

/**
 * Ask the model to rewrite each over-long line to at most `maxWords` words,
 * keeping meaning, language and script. Returns n → new text for lines it
 * fixed. Lines it can't shorten enough are left out (the caller decides).
 */
export async function shortenLinesWithAi(key: string, lines: LineToFit[], language: string): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!lines.length) return out;
  const user = `Rewrite each narration line so it can be spoken in its time slot.
Language: ${language} — keep the SAME language and script (do not translate, do not transliterate).
Rules:
- Each line must have AT MOST its "max_words" words (count whitespace-separated words).
- Keep the core meaning and the hook; drop filler words, not the point.
- No ellipses, no new facts.

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
    const want = lines.find((l) => l.n === r.n);
    const text = (r.text ?? "").trim();
    // Accept only if it really fits (allow +1 word of tokenizer slack).
    if (want && text && countWords(text) <= want.maxWords + 1) out.set(want.n, text);
  }
  return out;
}
