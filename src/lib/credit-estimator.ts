/**
 * Cost estimator. Single source of truth for how many credits each action
 * consumes. Server enforces via `reserve_credits`; UI shows the same number
 * on the Generate button.
 */
export type CreditAction =
  | "image"
  | "image_edit"
  | "upscale"
  | "bg_remove"
  | "inpaint"
  | "magic_eraser"
  | "thumbnail"
  | "thumbnail_quality"
  | "carousel"
  | "video_short"
  | "video_long"
  | "video_scene_regen"
  | "voiceover"
  | "linkedin"
  | "caption"
  | "strategy"
  | "research"
  | "agent_campaign"
  | "agent_specialist"
  | "repurpose"
  | "generic";

export type EstimateParams = {
  batch?: number;
  slides?: number;
  scenes?: number;
  durationSec?: number;
  concepts?: number;
  targets?: number;
  qualityMultiplier?: number;
};

export function estimateCost(action: CreditAction, p: EstimateParams = {}): number {
  const q = Math.max(1, Math.round(p.qualityMultiplier ?? 1));
  switch (action) {
    case "image":
      return Math.max(1, (p.batch ?? 1)) * q;
    // HD renders and edits use the Gemini image model (8 credits each).
    case "image_edit":
    case "upscale":
    case "bg_remove":
    case "inpaint":
    case "magic_eraser":
    case "thumbnail_quality":
      return 8 * Math.max(1, p.batch ?? 1);
    case "voiceover":
      return 2 * q; // ~1 per 100 characters; a typical scene is ~200

    case "linkedin":
    case "caption":
    case "strategy":
    case "research":
    case "agent_specialist":
    case "generic":
      return 1 * q;
    case "thumbnail":
      return Math.max(1, p.concepts ?? 4);
    case "carousel":
      return 1 + Math.max(1, p.slides ?? 5);
    // script + 1 per scene image + ~2 voice credits per scene
    case "video_short":
      return 1 + 3 * Math.max(1, p.scenes ?? 8);
    case "video_long":
      return 1 + 3 * Math.max(1, Math.ceil((p.durationSec ?? 300) / 8));
    case "video_scene_regen":
      return 1;
    case "agent_campaign":
      return 3;
    case "repurpose":
      return Math.max(1, p.targets ?? 1);
    default:
      return 1;
  }
}

export function formatCostLabel(cost: number): string {
  return `${cost} credit${cost === 1 ? "" : "s"}`;
}
