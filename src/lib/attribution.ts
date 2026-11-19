// First-touch marketing attribution, captured in the browser on the first
// visit (any page, signed in or not) and sent once after sign-in.
const KEY = "cf_first_touch_v1";

export type FirstTouch = {
  source: string;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landing_path: string;
  at: string;
};

const HOST_SOURCES: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)google\./, "google"],
  [/(^|\.)(t\.me|telegram\.org)$/, "telegram"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, "x"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai)$/, "ai_assistant"],
];
const UTM_ALIASES: Record<string, string> = { ig: "instagram", fb: "facebook", yt: "youtube", tg: "telegram", wa: "whatsapp" };

export function classifySource(params: URLSearchParams, referrer: string | null, ownHost: string): string {
  const utm = params.get("utm_source")?.trim().toLowerCase();
  const medium = params.get("utm_medium")?.trim().toLowerCase() ?? "";
  const paid = /(cpc|paid|ads?|ppc)/.test(medium);
  if (params.get("fbclid") && paid) return "meta_ads";
  if (params.get("gclid")) return "google_ads";
  if (utm) {
    const base = UTM_ALIASES[utm] ?? utm;
    if (paid && ["facebook", "instagram", "meta"].includes(base)) return "meta_ads";
    return base.slice(0, 40);
  }
  if (params.get("ref")) return "referral";
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase();
      if (host && host !== ownHost && !host.endsWith(".prodxstore.com")) {
        for (const [re, name] of HOST_SOURCES) if (re.test(host)) return name;
        return "referral";
      }
    } catch { /* ignore */ }
  }
  if (params.get("fbclid")) return "facebook";
  return "direct";
}

/** Store the first touch once per browser. Safe to call on every page load. */
export function captureFirstTouch(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const ref = document.referrer || null;
    const touch: FirstTouch = {
      source: classifySource(params, ref, window.location.hostname.toLowerCase()),
      medium: params.get("utm_medium")?.slice(0, 60) ?? null,
      campaign: params.get("utm_campaign")?.slice(0, 120) ?? (params.get("ref") ? `ref:${params.get("ref")!.slice(0, 60)}` : null),
      referrer: ref ? ref.slice(0, 300) : null,
      landing_path: window.location.pathname.slice(0, 200),
      at: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(touch));
  } catch { /* storage blocked — attribution is best-effort */ }
}

export function readFirstTouch(): FirstTouch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch { return null; }
}
