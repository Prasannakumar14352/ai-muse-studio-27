/**
 * Canonical feature readiness definitions.
 *
 * A feature is "available" ONLY when every applicable check is true.
 * The landing-page comparison table and the admin readiness dashboard both
 * derive their status from this file + the `feature_readiness` DB table.
 */

export const FEATURE_IDS = [
  "seo_package",
  "image_editing",
  "voiceover",
  "ai_video",
  "short_video",
  "long_video",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export type ReadinessCheck =
  | "ui_implemented"
  | "backend_implemented"
  | "provider_configured"
  | "generation_tested"
  | "credits_tested"
  | "preview_tested"
  | "download_tested"
  | "persistence_tested"
  | "retry_tested"
  | "no_production_mocks";

export const CHECK_LABELS: Record<ReadinessCheck, string> = {
  ui_implemented: "UI implemented",
  backend_implemented: "Backend implemented",
  provider_configured: "Production provider configured",
  generation_tested: "Real generation tested",
  credits_tested: "Credit deduction tested",
  preview_tested: "Preview works",
  download_tested: "Download works",
  persistence_tested: "Project persistence works",
  retry_tested: "Retry works",
  no_production_mocks: "No mock output in production",
};

export type FeatureStatus = "available" | "beta" | "coming_soon" | "not_available";

export type FeatureReadinessRow = {
  feature_id: FeatureId | string;
  status: FeatureStatus;
  ui_implemented: boolean;
  backend_implemented: boolean;
  provider_configured: boolean;
  generation_tested: boolean;
  credits_tested: boolean;
  preview_tested: boolean;
  download_tested: boolean;
  persistence_tested: boolean;
  retry_tested: boolean;
  no_production_mocks: boolean;
  blockers: string[];
  notes: string | null;
  last_verified_at: string | null;
  updated_at: string;
};

export function computeStatus(row: Pick<FeatureReadinessRow, ReadinessCheck>): FeatureStatus {
  const checks: ReadinessCheck[] = [
    "ui_implemented",
    "backend_implemented",
    "provider_configured",
    "generation_tested",
    "credits_tested",
    "preview_tested",
    "download_tested",
    "persistence_tested",
    "retry_tested",
    "no_production_mocks",
  ];
  const allPass = checks.every((k) => row[k]);
  if (allPass) return "available";
  const anyImpl = row.ui_implemented || row.backend_implemented;
  return anyImpl ? "beta" : "coming_soon";
}

export const FEATURE_LABELS: Record<FeatureId, string> = {
  seo_package: "SEO Content Package",
  image_editing: "Image Editing",
  voiceover: "AI Voiceover",
  ai_video: "AI Video Generation",
  short_video: "Short-Form Video Workflow",
  long_video: "Long-Form Video Workflow",
};

/** Map a comparison-table capability id to a readiness feature id (if any). */
export const CAPABILITY_TO_FEATURE: Record<string, FeatureId> = {
  image_edit: "image_editing",
  ai_video: "ai_video",
  short_video: "short_video",
  long_video: "long_video",
  voiceover: "voiceover",
  seo_pack: "seo_package",
};
