/**
 * Output languages for scripts, captions and voiceovers. The script/caption
 * text is written in the language's own script; image prompts stay English
 * because image models follow English best.
 */
export const CONTENT_LANGUAGES = [
  { id: "auto", label: "Same as topic" },
  { id: "English", label: "English" },
  { id: "Telugu", label: "తెలుగు Telugu" },
  { id: "Hindi", label: "हिन्दी Hindi" },
  { id: "Tamil", label: "தமிழ் Tamil" },
  { id: "Kannada", label: "ಕನ್ನಡ Kannada" },
  { id: "Malayalam", label: "മലയാളം Malayalam" },
  { id: "Marathi", label: "मराठी Marathi" },
  { id: "Bengali", label: "বাংলা Bengali" },
  { id: "Gujarati", label: "ગુજરાતી Gujarati" },
] as const;

export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number]["id"];

/** Guess the language from the script a topic is written in ("auto"). */
export function detectTopicLanguage(text: string): string {
  if (/[ఀ-౿]/.test(text)) return "Telugu";
  if (/[஀-௿]/.test(text)) return "Tamil";
  if (/[ಀ-೿]/.test(text)) return "Kannada";
  if (/[ഀ-ൿ]/.test(text)) return "Malayalam";
  if (/[ঀ-৿]/.test(text)) return "Bengali";
  if (/[઀-૿]/.test(text)) return "Gujarati";
  if (/[ऀ-ॿ]/.test(text)) return "Hindi";
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
