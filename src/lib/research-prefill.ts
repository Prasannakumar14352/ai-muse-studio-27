// Rich per-module handoff payload written by the Research module and consumed
// by any destination generation module on mount. Persisted in sessionStorage
// so it survives navigation and page refresh within a tab, plus mirrored per
// module into localStorage plan-store drafts.
//
// The Research page ALSO writes an accompanying "handoff meta" record so the
// destination module can surface a "Created from Viral Research" banner and
// so we can render a preview dialog before navigation.

export type ResearchModuleId =
  | "video" | "short" | "thumbnail" | "carousel"
  | "linkedin" | "caption" | "image" | "strategy" | "calendar";

export type ResearchPrefill = {
  handoffId: string;
  module: ResearchModuleId;
  sourceLabel: string;              // e.g. "Viral Research · <topic>"
  source: "research";
  researchId?: string | null;

  // Shared
  topic: string;
  angle?: string;
  audience?: string;
  platform?: string;
  aspectRatio?: string;
  cta?: string;
  keywords?: string[];
  hashtags?: string[];
  titles?: string[];
  hooks?: string[];
  summary?: string;

  // Video / Short
  duration?: number;                // seconds
  format?: string;
  voiceoverDirection?: string;
  onScreenText?: string[];
  outline?: string[];

  // Thumbnail
  thumbnailText?: string;
  thumbnailConcepts?: string[];
  subject?: string;
  emotion?: string;
  composition?: string;
  colorDirection?: string;
  ctrTips?: string[];

  // Carousel
  slideOutline?: string[];
  keyPoints?: string[];
  slideCount?: number;

  // LinkedIn
  body?: string;
  firstComment?: string;
  heroConcept?: string;
  includeCarousel?: boolean;
  includeImage?: boolean;

  // Caption
  objective?: string;
  tone?: string;

  // Image
  imagePrompt?: string;
  negativePrompt?: string;
  style?: string;
  lighting?: string;

  // Strategy
  opportunityScore?: number;
  contentGap?: string;
  bestAngle?: string;
  recommendedFormats?: string[];
  evidence?: string[];

  // Calendar
  urgency?: string;
  contentType?: string;

  // Intent: when true, destination module should surface a prominent
  // "Generate Now" CTA (or auto-focus it) rather than a passive draft view.
  autogen?: boolean;

  at: number;
};

const KEY_PREFIX = "cf:research-prefill:"; // per-module bucket

function key(module: ResearchModuleId) { return `${KEY_PREFIX}${module}`; }

export function setResearchPrefill(p: Omit<ResearchPrefill, "at" | "handoffId" | "source"> & { handoffId?: string }) {
  if (typeof window === "undefined") return null;
  const record: ResearchPrefill = {
    ...p,
    handoffId: p.handoffId ?? `hd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    source: "research",
    at: Date.now(),
  };
  try { window.sessionStorage.setItem(key(p.module), JSON.stringify(record)); } catch { /* ignore */ }
  return record;
}

export function peekResearchPrefill(module: ResearchModuleId): ResearchPrefill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(module));
    if (!raw) return null;
    const v = JSON.parse(raw) as ResearchPrefill;
    // Expire after 6 hours so stale handoffs don't leak between sessions
    if (Date.now() - v.at > 6 * 60 * 60 * 1000) {
      try { window.sessionStorage.removeItem(key(module)); } catch { /* ignore */ }
      return null;
    }
    return v;
  } catch { return null; }
}

export function consumeResearchPrefill(module: ResearchModuleId): ResearchPrefill | null {
  const v = peekResearchPrefill(module);
  if (v && typeof window !== "undefined") {
    try { window.sessionStorage.removeItem(key(module)); } catch { /* ignore */ }
  }
  return v;
}
