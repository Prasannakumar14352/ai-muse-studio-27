import { ALL_LANGUAGES, languageLabel } from "@/lib/languages";
/**
 * Output languages for scripts, captions and voiceovers. The script/caption
 * text is written in the language's own script; image prompts stay English
 * because image models follow English best.
 */

export const CONTENT_LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "auto", label: "Same as topic" },
  ...ALL_LANGUAGES.map((l) => ({ id: l.id, label: languageLabel(l) })),
];

export type ContentLanguage = string;

/** Guess the language from the script a topic is written in ("auto"). */
export function detectTopicLanguage(text: string): string {
  if (/[ఀ-౿]/.test(text)) return "Telugu";
  if (/[஀-௿]/.test(text)) return "Tamil";
  if (/[ಀ-೿]/.test(text)) return "Kannada";
  if (/[ഀ-ൿ]/.test(text)) return "Malayalam";
  if (/[ঀ-৿]/.test(text)) return /[ৰৱ]/.test(text) ? "Assamese" : "Bengali";
  if (/[઀-૿]/.test(text)) return "Gujarati";
  if (/[਀-੿]/.test(text)) return "Punjabi";
  if (/[଀-୿]/.test(text)) return "Odia";
  if (/[ऀ-ॿ]/.test(text)) return /ळ/.test(text) ? "Marathi" : "Hindi";
  if (/[؀-ۿ]/.test(text)) return /[ٹڈڑںےھ]/.test(text) ? "Urdu" : /[پچژگ]/.test(text) ? "Persian" : "Arabic";
  if (/[֐-׿]/.test(text)) return "Hebrew";
  if (/[฀-๿]/.test(text)) return "Thai";
  if (/[぀-ヿ]/.test(text)) return "Japanese";
  if (/[가-힯]/.test(text)) return "Korean";
  if (/[一-鿿]/.test(text)) return "Chinese";
  if (/[Ѐ-ӿ]/.test(text)) return "Russian";
  if (/[Ͱ-Ͽ]/.test(text)) return "Greek";
  return "English";
}

export function resolveContentLanguage(language: string | undefined | null, topic: string): string {
  if (!language || language === "auto") return detectTopicLanguage(topic);
  return language;
}

/** Prompt block shared by the script / carousel generators. */
export function languageAndFidelityRules(language: string, topic: string): string {
  const lang = resolveContentLanguage(language, topic);
  const langRule = lang === "English"
    ? "Write all viewer-facing text in English."
    : `Write ALL viewer-facing text (title, reel_title, voiceover, on_screen_text, caption, headline, body, bullets, bottom_highlight, label) in ${lang}, in its native script — natural, conversational ${lang} as native creators speak it, not a word-for-word translation. Hashtags may mix ${lang} and English. Keep "visual" and "image_prompt" in English.`;
  return `LANGUAGE: ${langRule}

TOPIC FIDELITY (hard rules):
- The title must keep the topic's exact meaning. Do not swap its key words
  for something similar (e.g. "5 morning habits" must NOT become "5 AM habits").
- If the topic promises a number of items ("7 free AI tools", "5 habits"),
  deliver exactly that many, each one specific and NAMED (real tool, real
  habit, real step) — never generic placeholders like "Tool #1".
- Every hashtag must be specific to this topic; no generic filler tags.

NO FILLER (hard rules — applies in every language, especially ${lang === "English" ? "English" : lang}):
- Every scene / slide must state one concrete fact, name, number, step or
  example about the topic. A line a viewer could hear on ANY video
  ("this is very important", "let's see", "you will be surprised", "chala
  important", "mari choodandi") is filler — delete it and say the fact.
- Never repeat a sentence or the same idea across scenes in other words.
- No vague openers like "In today's world…" / "Friends, today…". Open on the
  most surprising specific detail.
- If you don't know a specific detail for certain, choose a different real
  item you DO know rather than padding.`;
}

// Common function words of romanized ("Hinglish" / "Tenglish" …) titles. A Latin-script
// title with several of these is not English, even when YouTube tags it "en"
// (that tag is often just the channel default).
const ROMANIZED_MARKERS: Array<{ lang: string; words: Set<string> }> = [
  {
    lang: "Hindi",
    words: new Set(("hai hain ka ki ke ko se pe mein jab tab aa gaya gayi gaye kya kyun kaise kaisa nahi nahin " +
      "aur bhi yeh wo woh tha thi hua hui hoga sabse apna apni apne zid ladki ladka bhai behen maa papa " +
      "dekho dekhiye karo karna kar diya liya wala wali wale baat sach jaan pyaar hum tum aap").split(" ")),
  },
  {
    lang: "Telugu",
    words: new Set(("lo ki ela enti emi enduku cheyyali chesindi chesadu ayindi undi unnadu kadha katha telugu " +
      "manam meeru nenu vadu ame vallu chala inka kuda amma nanna anna akka pelli sinima").split(" ")),
  },
  {
    lang: "Tamil",
    words: new Set(("enna eppadi yen illa irukku pannunga panna da di amma appa thambi akka anna kadhai tamil nalla").split(" ")),
  },
];

/**
 * Language of a video from its title, for research results.
 * Non-Latin script wins; then YouTube's tag when it's not English; then romanized
 * Indic markers (≥2 hits); then the tag; else English.
 */
export function detectVideoTitleLanguage(title: string, taggedLanguage?: string | null): string {
  const script = detectTopicLanguage(title);
  if (script !== "English") return script;
  if (taggedLanguage && taggedLanguage !== "English" && taggedLanguage !== "Other") return taggedLanguage;
  const tokens = title.toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  let best: { lang: string; hits: number } | null = null;
  for (const m of ROMANIZED_MARKERS) {
    const hits = tokens.filter((t) => m.words.has(t)).length;
    if (hits >= 2 && (!best || hits > best.hits)) best = { lang: m.lang, hits };
  }
  if (best) return best.lang;
  return taggedLanguage || "English";
}
