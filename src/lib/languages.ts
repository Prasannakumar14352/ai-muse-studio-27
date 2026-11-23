// One list of content languages for the whole app (scripts, captions, ad
// copy, voiceover). `id` is the English name — it is what we store and what
// the AI is told to write in, so older saved values ("Telugu", "Hindi") keep working.
//
// voice:
//   "turbo" → ElevenLabs Turbo v2.5 (cheaper, 1× credits)
//   "v3"    → ElevenLabs Eleven v3 (2× credits)
//   null    → no AI voice for this language yet: text only, the user picks a
//             voice language or turns voiceover off.

export type VoiceModel = "turbo" | "v3" | null;
export type Lang = {
  id: string;
  native: string;
  /** ISO code sent to the voice model. */
  code: string;
  india: boolean;
  voice: VoiceModel;
};

const T = "turbo" as const;
const V = "v3" as const;

const INDIA: Lang[] = [
  ["Hindi", "हिन्दी", "hi", T], ["Telugu", "తెలుగు", "te", V], ["Tamil", "தமிழ்", "ta", T],
  ["Kannada", "ಕನ್ನಡ", "kn", V], ["Malayalam", "മലയാളം", "ml", V], ["Marathi", "मराठी", "mr", V],
  ["Bengali", "বাংলা", "bn", V], ["Gujarati", "ગુજરાતી", "gu", V], ["Punjabi", "ਪੰਜਾਬੀ", "pa", V],
  ["Odia", "ଓଡ଼ିଆ", "or", V], ["Assamese", "অসমীয়া", "as", V], ["Urdu", "اردو", "ur", V],
  ["Nepali", "नेपाली", "ne", V], ["Sindhi", "سنڌي", "sd", V],
  ["Konkani", "कोंकणी", "kok", null], ["Maithili", "मैथिली", "mai", null], ["Dogri", "डोगरी", "doi", null],
  ["Manipuri", "ꯃꯤꯇꯩꯂꯣꯟ", "mni", null], ["Sanskrit", "संस्कृतम्", "sa", null], ["Santali", "ᱥᱟᱱᱛᱟᱲᱤ", "sat", null],
  ["Kashmiri", "کٲشُر", "ks", null], ["Bodo", "बड़ो", "brx", null], ["Bhojpuri", "भोजपुरी", "bho", null],
  ["Tulu", "ತುಳು", "tcy", null],
].map(([id, native, code, voice]) => ({ id: id as string, native: native as string, code: code as string, india: true, voice: voice as VoiceModel }));

const WORLD: Lang[] = [
  ["Afrikaans", "Afrikaans", "af", V], ["Albanian", "Shqip", "sq", null], ["Amharic", "አማርኛ", "am", null],
  ["Arabic", "العربية", "ar", T], ["Armenian", "Հայերեն", "hy", V], ["Azerbaijani", "Azərbaycan", "az", V],
  ["Basque", "Euskara", "eu", null], ["Belarusian", "Беларуская", "be", V], ["Bosnian", "Bosanski", "bs", V],
  ["Bulgarian", "Български", "bg", T], ["Burmese", "မြန်မာ", "my", V], ["Cantonese", "粵語", "yue", V],
  ["Catalan", "Català", "ca", V], ["Cebuano", "Cebuano", "ceb", V], ["Chichewa", "Chichewa", "ny", V],
  ["Chinese", "中文 (简体)", "zh", T], ["Chinese (Traditional)", "中文 (繁體)", "zh", T], ["Corsican", "Corsu", "co", null],
  ["Croatian", "Hrvatski", "hr", T], ["Czech", "Čeština", "cs", T], ["Danish", "Dansk", "da", T],
  ["Dutch", "Nederlands", "nl", T], ["Esperanto", "Esperanto", "eo", null], ["Estonian", "Eesti", "et", V],
  ["Filipino", "Filipino", "fil", T], ["Finnish", "Suomi", "fi", T], ["French", "Français", "fr", T],
  ["Frisian", "Frysk", "fy", null], ["Galician", "Galego", "gl", V], ["Georgian", "ქართული", "ka", V],
  ["German", "Deutsch", "de", T], ["Greek", "Ελληνικά", "el", T], ["Haitian Creole", "Kreyòl", "ht", null],
  ["Hausa", "Hausa", "ha", V], ["Hawaiian", "ʻŌlelo Hawaiʻi", "haw", null], ["Hebrew", "עברית", "he", V],
  ["Hmong", "Hmoob", "hmn", null], ["Hungarian", "Magyar", "hu", T], ["Icelandic", "Íslenska", "is", V],
  ["Igbo", "Igbo", "ig", null], ["Indonesian", "Bahasa Indonesia", "id", T], ["Irish", "Gaeilge", "ga", V],
  ["Italian", "Italiano", "it", T], ["Japanese", "日本語", "ja", T], ["Javanese", "Basa Jawa", "jv", V],
  ["Kazakh", "Қазақ", "kk", V], ["Khmer", "ខ្មែរ", "km", null], ["Korean", "한국어", "ko", T],
  ["Kurdish", "Kurdî", "ku", null], ["Kyrgyz", "Кыргызча", "ky", V], ["Lao", "ລາວ", "lo", null],
  ["Latin", "Latina", "la", null], ["Latvian", "Latviešu", "lv", V], ["Lithuanian", "Lietuvių", "lt", V],
  ["Luxembourgish", "Lëtzebuergesch", "lb", V], ["Macedonian", "Македонски", "mk", V], ["Malagasy", "Malagasy", "mg", null],
  ["Malay", "Bahasa Melayu", "ms", T], ["Maltese", "Malti", "mt", V], ["Maori", "Māori", "mi", V],
  ["Mongolian", "Монгол", "mn", V], ["Norwegian", "Norsk", "no", T], ["Pashto", "پښتو", "ps", V],
  ["Persian", "فارسی", "fa", V], ["Polish", "Polski", "pl", T], ["Portuguese", "Português", "pt", T],
  ["Romanian", "Română", "ro", T], ["Russian", "Русский", "ru", T], ["Samoan", "Gagana Samoa", "sm", null],
  ["Scottish Gaelic", "Gàidhlig", "gd", null], ["Serbian", "Српски", "sr", V], ["Sesotho", "Sesotho", "st", null],
  ["Shona", "chiShona", "sn", null], ["Sinhala", "සිංහල", "si", null], ["Slovak", "Slovenčina", "sk", T],
  ["Slovenian", "Slovenščina", "sl", V], ["Somali", "Soomaali", "so", V], ["Spanish", "Español", "es", T],
  ["Sundanese", "Basa Sunda", "su", null], ["Swahili", "Kiswahili", "sw", V], ["Swedish", "Svenska", "sv", T],
  ["Tajik", "Тоҷикӣ", "tg", V], ["Thai", "ไทย", "th", V], ["Turkish", "Türkçe", "tr", T],
  ["Ukrainian", "Українська", "uk", T], ["Uzbek", "Oʻzbek", "uz", V], ["Vietnamese", "Tiếng Việt", "vi", T],
  ["Welsh", "Cymraeg", "cy", V], ["Xhosa", "isiXhosa", "xh", null], ["Yiddish", "ייִדיש", "yi", null],
  ["Yoruba", "Yorùbá", "yo", V], ["Zulu", "isiZulu", "zu", null],
].map(([id, native, code, voice]) => ({ id: id as string, native: native as string, code: code as string, india: false, voice: voice as VoiceModel }));

export const ENGLISH: Lang = { id: "English", native: "English", code: "en", india: false, voice: T };

/** English first, then Indian languages, then the world A–Z. */
export const ALL_LANGUAGES: Lang[] = [ENGLISH, ...INDIA, ...WORLD];
export const INDIAN_LANGUAGES = INDIA;
export const WORLD_LANGUAGES = WORLD;

const BY_ID = new Map(ALL_LANGUAGES.map((l) => [l.id.toLowerCase(), l]));

export function findLanguage(id: string | null | undefined): Lang | null {
  if (!id) return null;
  return BY_ID.get(id.trim().toLowerCase()) ?? null;
}

/** Languages that have an AI voice — the choices offered as a voice fallback. */
export const VOICE_LANGUAGES: Lang[] = ALL_LANGUAGES.filter((l) => l.voice);

export function hasVoice(id: string | null | undefined): boolean {
  return !!findLanguage(id)?.voice;
}

/** Label shown in pickers: "తెలుగు Telugu", or just "English". */
export function languageLabel(l: Lang): string {
  return l.native && l.native !== l.id ? `${l.native} ${l.id}` : l.id;
}
