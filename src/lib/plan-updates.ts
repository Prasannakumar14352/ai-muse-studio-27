import type { BillingCycle } from "@/lib/pricing.functions";

/**
 * The "future updates" promise shown on plan cards, the comparison table, the
 * FAQ and the Terms. Keep the wording here so every screen says the same thing.
 */
export const UPDATES_POLICY = {
  everyone:
    "Bug fixes, speed and security improvements, and better AI models in features you already have reach every user as soon as they ship.",
  subscription: "All new features at your plan level and below, for as long as your subscription is active.",
  lifetime:
    "Every future update at your plan level and below, for as long as CreatorFlow AI operates, with no renewal fee.",
  higherPlans: "Major new features may be added to a higher plan; you get them if they land in your plan level or below.",
} as const;

export function planUpdatesLine(opts: { planType: string; isFree: boolean; cycle: BillingCycle }): string {
  if (opts.isFree) return "Ongoing fixes & improvements";
  if (opts.planType === "lifetime" || opts.cycle === "lifetime") return "Lifetime updates for your plan level";
  return "All updates while subscribed";
}
