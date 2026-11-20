// Voiceover pricing — shared by the TTS route (what we charge) and the
// estimates shown before generating (what we promise), so they can't drift.

/** Languages voiced with ElevenLabs v3 (better for these scripts, costs 2×). */
export const V3_LANGUAGE_CODES: Record<string, string> = { Telugu: "te", Kannada: "kn", Malayalam: "ml", Bengali: "bn", Gujarati: "gu" };

/** Credits for one voiceover clip: 1 per 100 characters (min 1), ×2 on v3 languages. */
export function voiceoverClipCredits(chars: number, language?: string | null): number {
  const v3 = !!(language && V3_LANGUAGE_CODES[language]);
  return Math.max(1, Math.ceil(chars / 100)) * (v3 ? 2 : 1);
}

/** Typical characters per spoken word (UTF-16 code units, incl. the space). */
export function charsPerWord(language?: string | null): number {
  switch (language) {
    case "Telugu": case "Kannada": case "Tamil": case "Malayalam": return 9;
    case "Hindi": case "Marathi": case "Bengali": case "Gujarati": return 7;
    default: return 6;
  }
}
