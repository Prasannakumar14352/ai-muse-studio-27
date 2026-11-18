/**
 * Plan-based feature access (shared by browser and server).
 *
 * Every plan maps to a tier. Each feature (a page, a Model Studio model, or a
 * credit-charged server action) has a minimum tier. A user can use a feature
 * when their tier >= the feature's tier. Admins can use everything.
 *
 * Defaults live here; admins can override any feature's tier from
 * Admin → Plan Access (stored in app_settings under PLAN_ACCESS_SETTINGS_KEY).
 */

export const TIERS = ["free", "starter", "creator", "pro", "team"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  starter: "Starter",
  creator: "Creator",
  pro: "Pro",
  team: "Team",
};

export const PLAN_ACCESS_SETTINGS_KEY = "plan_access";

/**
 * How many accounts a user may connect per social platform (e.g. 3 YouTube
 * channels + 3 Instagram accounts on Pro). Admins are unlimited.
 * Connections itself needs the Creator plan, so lower tiers get 0.
 */
export const MAX_ACCOUNTS_PER_PLATFORM: Record<Tier, number> = {
  free: 0,
  starter: 0,
  creator: 2,
  pro: 5,
  team: 15,
};

/** Plan codes (pricing_plans.code / subscriptions.plan_name) → tier. Yearly and lifetime match their tier. */
const PLAN_TIER: Record<string, Tier> = {
  free: "free",
  starter: "starter",
  starter_life: "starter",
  creator: "creator",
  creator_life: "creator",
  pro: "pro",
  pro_life: "pro",
  team: "team",
  // Legacy codes from earlier pricing versions
  business: "pro",
  lifetime: "pro",
  enterprise: "team",
};

export function tierForPlan(planCode: string | null | undefined): Tier {
  if (!planCode) return "free";
  return PLAN_TIER[planCode.toLowerCase()] ?? "free";
}

export function tierRank(t: Tier): number {
  return TIERS.indexOf(t);
}

export function hasTier(userTier: Tier, required: Tier): boolean {
  return tierRank(userTier) >= tierRank(required);
}

// ── Features ───────────────────────────────────────────────────────────

export type FeatureDef = {
  id: string;
  label: string;
  /** Route path prefixes this feature covers. */
  paths?: string[];
  defaultTier: Tier;
  group: "page" | "model";
};

/** Only gated features are listed; anything not listed is open to every signed-in user. */
export const FEATURES: FeatureDef[] = [
  // Starter
  {
    id: "thumbnails",
    label: "Thumbnails",
    paths: ["/thumbnails"],
    defaultTier: "starter",
    group: "page",
  },
  { id: "seo", label: "SEO Package", paths: ["/seo"], defaultTier: "starter", group: "page" },
  {
    id: "repurpose",
    label: "Repurpose",
    paths: ["/repurpose"],
    defaultTier: "starter",
    group: "page",
  },
  {
    id: "research",
    label: "Research",
    paths: ["/research"],
    defaultTier: "starter",
    group: "page",
  },
  { id: "calendar", label: "Planner", paths: ["/calendar"], defaultTier: "starter", group: "page" },
  // Creator
  {
    id: "videos",
    label: "Projects / Video studio",
    paths: ["/videos", "/projects", "/studio"],
    defaultTier: "creator",
    group: "page",
  },
  {
    id: "ai_studio",
    label: "AI Studio",
    paths: ["/create"],
    defaultTier: "creator",
    group: "page",
  },
  {
    id: "promo_videos",
    label: "Promo Video",
    paths: ["/promo-videos"],
    defaultTier: "creator",
    group: "page",
  },
  {
    id: "strategy",
    label: "AI Strategy",
    paths: ["/strategy"],
    defaultTier: "creator",
    group: "page",
  },
  {
    id: "connections",
    label: "Connections (auto-publish)",
    paths: ["/connections"],
    defaultTier: "creator",
    group: "page",
  },
  // Pro
  { id: "agents", label: "AI Agents", paths: ["/agents"], defaultTier: "pro", group: "page" },
  { id: "analytics", label: "Analytics", paths: ["/analytics"], defaultTier: "pro", group: "page" },
  { id: "brand_kit", label: "Brand Kit", paths: ["/brand-kit"], defaultTier: "pro", group: "page" },
  {
    id: "marketplace",
    label: "Marketplace",
    paths: ["/marketplace"],
    defaultTier: "pro",
    group: "page",
  },
  // Model Studio models (ids match MODEL_CATALOG); FLUX models stay open to all
  {
    id: "model:eleven-multilingual-v2",
    label: "Model Studio · ElevenLabs Multilingual v2",
    defaultTier: "starter",
    group: "model",
  },
  {
    id: "model:eleven-v3",
    label: "Model Studio · ElevenLabs v3",
    defaultTier: "starter",
    group: "model",
  },
  {
    id: "model:seedance-2-fast",
    label: "Model Studio · Seedance 2.0 Fast",
    defaultTier: "creator",
    group: "model",
  },
  {
    id: "model:seedance-2",
    label: "Model Studio · Seedance 2.0",
    defaultTier: "creator",
    group: "model",
  },
  {
    id: "model:seedance-2-5",
    label: "Model Studio · Seedance 2.5",
    defaultTier: "pro",
    group: "model",
  },
];

/** Paths that sit under a gated prefix but must stay open. */
const OPEN_PATHS = ["/create/carousel"];

/** Credit-charged server actions → feature they belong to (server-side enforcement). */
export const ACTION_FEATURE: Record<string, string> = {
  thumbnail_plan: "thumbnails",
  thumbnail_reverse: "thumbnails",
  seo_package: "seo",
  seo_regen: "seo",
  repurpose: "repurpose",
  research: "research",
  video_script: "videos",
  video_scenes_plan: "videos",
  video_seo: "videos",
  video_title_variants: "videos",
  video_hook: "videos",
  video_chapters: "videos",
  narration: "videos",
  final_export: "videos",
  promo_plan: "promo_videos",
  promo_scene_regen: "promo_videos",
  strategy: "strategy",
  agent_campaign: "agents",
};

export type TierOverrides = Record<string, Tier>;

function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

/** Parse the app_settings value defensively (it is admin-editable JSON). */
export function parseOverrides(value: unknown): TierOverrides {
  const out: TierOverrides = {};
  const src = (value as { features?: unknown } | null)?.features;
  if (src && typeof src === "object") {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (FEATURES.some((f) => f.id === k) && isTier(v)) out[k] = v;
    }
  }
  return out;
}

export function requiredTier(featureId: string, overrides: TierOverrides = {}): Tier {
  const f = FEATURES.find((x) => x.id === featureId);
  if (!f) return "free";
  return overrides[featureId] ?? f.defaultTier;
}

/** Feature covering a pathname (longest matching prefix), or null if the page is open. */
export function featureForPath(pathname: string): FeatureDef | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (OPEN_PATHS.some((o) => p === o || p.startsWith(`${o}/`))) return null;
  let best: { f: FeatureDef; len: number } | null = null;
  for (const f of FEATURES) {
    for (const prefix of f.paths ?? []) {
      if ((p === prefix || p.startsWith(`${prefix}/`)) && (!best || prefix.length > best.len)) {
        best = { f, len: prefix.length };
      }
    }
  }
  return best?.f ?? null;
}

export type AccessCheck =
  { allowed: true } | { allowed: false; required: Tier; feature: FeatureDef };

export function checkFeature(
  featureId: string,
  userTier: Tier,
  isAdmin: boolean,
  overrides: TierOverrides = {},
): AccessCheck {
  const feature = FEATURES.find((f) => f.id === featureId);
  if (!feature || isAdmin) return { allowed: true };
  const required = requiredTier(featureId, overrides);
  return hasTier(userTier, required) ? { allowed: true } : { allowed: false, required, feature };
}

export function checkPath(
  pathname: string,
  userTier: Tier,
  isAdmin: boolean,
  overrides: TierOverrides = {},
): AccessCheck {
  const f = featureForPath(pathname);
  return f ? checkFeature(f.id, userTier, isAdmin, overrides) : { allowed: true };
}

/** Error thrown by the server when a plan is too low; the UI parses the prefix. */
export const PLAN_REQUIRED_PREFIX = "plan_required:";

export function planRequiredError(feature: FeatureDef, required: Tier): Error {
  return new Error(
    `${PLAN_REQUIRED_PREFIX}${JSON.stringify({ feature: feature.label, required })}`,
  );
}
