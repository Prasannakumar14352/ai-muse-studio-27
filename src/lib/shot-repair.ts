export type ShotRepair = "shot" | "image" | "motion";

export function shotRepairPlan(repair: ShotRepair, plannedMotion: boolean) {
  return {
    requiresExistingStill: repair === "motion",
    generateMotion: repair === "motion" || (repair === "shot" && plannedMotion),
    permitsStillFallback: repair !== "motion",
  };
}
