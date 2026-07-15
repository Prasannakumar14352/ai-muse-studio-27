// Cross-module prefill payload written by the Research module.
// Any generation module can call consumeResearchPrefill() on mount to seed itself.
export type ResearchPrefill = {
  topic: string;
  angle?: string;
  titles?: string[];
  hooks?: string[];
  keywords?: string[];
  hashtags?: string[];
  audience?: string;
  platform?: string;
  format?: string;
  thumbnailText?: string;
  thumbnailConcepts?: string[];
  cta?: string;
  at: number;
};

const KEY = "cf:research-prefill";

export function setResearchPrefill(p: Omit<ResearchPrefill, "at">) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ ...p, at: Date.now() })); } catch { /* ignore */ }
}

export function peekResearchPrefill(): ResearchPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ResearchPrefill) : null;
  } catch { return null; }
}

export function consumeResearchPrefill(): ResearchPrefill | null {
  const v = peekResearchPrefill();
  if (v && typeof window !== "undefined") {
    try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  }
  return v;
}
