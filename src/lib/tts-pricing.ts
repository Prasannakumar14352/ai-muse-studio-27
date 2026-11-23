// Voiceover pricing — shared by the TTS route (what we charge) and the
// estimates shown before generating (what we promise), so they can't drift.

import { findLanguage } from "@/lib/languages";

/** Languages the cheaper Turbo voice can't speak use Eleven v3 (2× the provider price). */
export function usesV3Voice(language?: string | null): boolean {
  return findLanguage(language)?.voice === "v3";
}

/** Credits for one voiceover clip: 1 per 100 characters (min 1), ×2 on v3 languages. */
export function voiceoverClipCredits(chars: number, language?: string | null): number {
  const v3 = usesV3Voice(language);
  return Math.max(1, Math.ceil(chars / 100)) * (v3 ? 2 : 1);
}

/** Typical characters per spoken word (UTF-16 code units, incl. the space). */
export function charsPerWord(language?: string | null): number {
  switch (language) {
    case "Telugu": case "Kannada": case "Tamil": case "Malayalam": case "Tulu": return 9;
    case "Hindi": case "Marathi": case "Bengali": case "Gujarati": case "Punjabi": case "Odia":
    case "Assamese": case "Nepali": case "Konkani": case "Maithili": case "Dogri": case "Sanskrit": case "Bhojpuri": return 7;
    default: return 6;
  }
}
