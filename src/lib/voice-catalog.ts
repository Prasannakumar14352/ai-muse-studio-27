// Narrator voices users can preview and pick. `id` is the ElevenLabs voice
// name the TTS endpoint accepts directly. The old three choices
// (male / female / documentary_narrator) still map to Roger / Sarah / George.

export type CatalogVoice = { id: string; gender: "male" | "female"; label: string; vibe: string };

export const VOICE_CATALOG: CatalogVoice[] = [
  { id: "George", gender: "male", label: "George", vibe: "Warm storyteller" },
  { id: "Brian", gender: "male", label: "Brian", vibe: "Deep narrator" },
  { id: "Roger", gender: "male", label: "Roger", vibe: "Confident, clear" },
  { id: "Daniel", gender: "male", label: "Daniel", vibe: "Authoritative, news" },
  { id: "Bill", gender: "male", label: "Bill", vibe: "Calm, trustworthy" },
  { id: "Liam", gender: "male", label: "Liam", vibe: "Energetic, young" },
  { id: "Chris", gender: "male", label: "Chris", vibe: "Casual, friendly" },
  { id: "Eric", gender: "male", label: "Eric", vibe: "Smooth, relaxed" },
  { id: "Callum", gender: "male", label: "Callum", vibe: "Intense, dramatic" },
  { id: "Charlie", gender: "male", label: "Charlie", vibe: "Natural, upbeat" },
  { id: "Will", gender: "male", label: "Will", vibe: "Bright, friendly" },
  { id: "Sarah", gender: "female", label: "Sarah", vibe: "Soft, clear" },
  { id: "Aria", gender: "female", label: "Aria", vibe: "Expressive" },
  { id: "Lily", gender: "female", label: "Lily", vibe: "Warm storyteller" },
  { id: "Matilda", gender: "female", label: "Matilda", vibe: "Friendly, warm" },
  { id: "Alice", gender: "female", label: "Alice", vibe: "Confident, crisp" },
  { id: "Jessica", gender: "female", label: "Jessica", vibe: "Lively, young" },
  { id: "Laura", gender: "female", label: "Laura", vibe: "Upbeat, energetic" },
  { id: "Charlotte", gender: "female", label: "Charlotte", vibe: "Smooth, calm" },
];

/** Older saved choices → their voice. */
const LEGACY: Record<string, string> = { male: "Roger", female: "Sarah", documentary_narrator: "George" };

export function catalogVoiceId(id: string | null | undefined): string {
  if (!id) return "George";
  return LEGACY[id] ?? (VOICE_CATALOG.some((v) => v.id === id) ? id : "George");
}

/** Short line each voice reads for its preview, in the user's language where we have one. */
export const SAMPLE_TEXTS: Record<string, string> = {
  English: "Hi! This is how I'll narrate your next video. Ready when you are.",
  Hindi: "नमस्ते! आपका अगला वीडियो मैं ऐसे सुनाऊँगा। जब आप तैयार हों, शुरू करें।",
  Telugu: "నమస్కారం! మీ తదుపరి వీడియోను నేను ఇలా చెబుతాను. మీరు సిద్ధమైతే మొదలుపెడదాం.",
  Tamil: "வணக்கம்! உங்கள் அடுத்த வீடியோவை நான் இப்படிச் சொல்வேன். தயாரானதும் தொடங்கலாம்.",
  Kannada: "ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಮುಂದಿನ ವೀಡಿಯೊವನ್ನು ನಾನು ಹೀಗೆ ಹೇಳುತ್ತೇನೆ. ನೀವು ಸಿದ್ಧರಾದಾಗ ಶುರು ಮಾಡೋಣ.",
  Malayalam: "നമസ്കാരം! നിങ്ങളുടെ അടുത്ത വീഡിയോ ഞാൻ ഇങ്ങനെയാണ് പറയുക. തയ്യാറാകുമ്പോൾ തുടങ്ങാം.",
  Marathi: "नमस्कार! तुमचा पुढचा व्हिडिओ मी असा सांगेन. तुम्ही तयार असाल तेव्हा सुरू करूया.",
  Bengali: "নমস্কার! আপনার পরের ভিডিওটা আমি এভাবেই বলব। আপনি তৈরি হলে শুরু করি।",
};
