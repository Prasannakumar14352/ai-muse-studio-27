// Local (per-browser) store for user-defined LinkedIn brand voices.
// Persisted in localStorage so the Studio can save/load without extra DB tables.

export type LinkedinBrandVoice = {
  id: string;
  name: string;
  description: string;        // free-form voice guidance the AI reads
  writing_style?: string;
  tone?: string;
  emoji_level?: "none" | "minimal" | "moderate" | "high";
  created_at: string;
};

const KEY = "cf:linkedin:brand-voices:v1";

function read(): LinkedinBrandVoice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LinkedinBrandVoice[]) : [];
  } catch {
    return [];
  }
}

function write(voices: LinkedinBrandVoice[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(voices)); } catch {
    /* ignore quota errors */
  }
}

export function listBrandVoices(): LinkedinBrandVoice[] {
  const built = BUILT_IN_VOICES;
  const custom = read();
  return [...built, ...custom];
}

export function saveBrandVoice(voice: Omit<LinkedinBrandVoice, "id" | "created_at">): LinkedinBrandVoice {
  const now = new Date().toISOString();
  const entry: LinkedinBrandVoice = {
    id: `bv_${Math.random().toString(36).slice(2, 9)}`,
    created_at: now,
    ...voice,
  };
  const all = [...read(), entry];
  write(all);
  return entry;
}

export function deleteBrandVoice(id: string) {
  write(read().filter((v) => v.id !== id));
}

export const BUILT_IN_VOICES: LinkedinBrandVoice[] = [
  { id: "founder", name: "Founder", description: "First-person, honest, opinionated. Shares tradeoffs and numbers when relevant. No corporate jargon.", writing_style: "Founder", tone: "Conversational", emoji_level: "minimal", created_at: "2024-01-01T00:00:00Z" },
  { id: "corporate", name: "Corporate", description: "Polished, measured, brand-safe. Third-person friendly. Avoids slang. Emphasizes outcomes and reliability.", writing_style: "Corporate", tone: "Professional", emoji_level: "none", created_at: "2024-01-01T00:00:00Z" },
  { id: "educational", name: "Educational", description: "Teacher voice. Concrete examples, small analogies, numbered steps. Never talks down.", writing_style: "Educational", tone: "Authoritative", emoji_level: "minimal", created_at: "2024-01-01T00:00:00Z" },
  { id: "casual", name: "Casual", description: "Friendly, conversational, uses short lines. Occasional wit. Never sarcastic.", writing_style: "Friendly", tone: "Conversational", emoji_level: "moderate", created_at: "2024-01-01T00:00:00Z" },
  { id: "motivational", name: "Motivational", description: "Inspiring but grounded. Concrete stories, not empty affirmations. Strong last line.", writing_style: "Inspirational", tone: "Bold", emoji_level: "minimal", created_at: "2024-01-01T00:00:00Z" },
];
