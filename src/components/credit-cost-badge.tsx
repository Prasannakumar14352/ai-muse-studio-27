import { Coins } from "lucide-react";
import { estimateCost, formatCostLabel, type CreditAction, type EstimateParams } from "@/lib/credit-estimator";

type Props = {
  action: CreditAction;
  params?: EstimateParams;
  className?: string;
  label?: string;   // e.g. "Generate"
};

/**
 * Small pill shown inside/next to Generate buttons — "Generate · 5 credits".
 * Uses the same estimator the server enforces.
 */
export function CreditCostBadge({ action, params, className, label }: Props) {
  const cost = estimateCost(action, params);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-white/10 border border-border px-2 py-0.5 text-[11px] text-white/80 ${className ?? ""}`}>
      <Coins className="w-3 h-3 text-orange-300" />
      {label ? `${label} · ` : ""}{formatCostLabel(cost)}
    </span>
  );
}

export { estimateCost, formatCostLabel } from "@/lib/credit-estimator";
