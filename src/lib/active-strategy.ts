// Client-side "active strategy" store. Any creation module can read this and
// prepend the summary to its planning prompt so generated content stays on-brand.
import type { StrategyPlan } from "@/lib/strategy.functions";
import { summarizeStrategyForPrompt } from "@/lib/strategy.functions";

const KEY = "creatorflow:active-strategy";

export type ActiveStrategy = {
  id: string;
  label: string; // e.g. "Sarah's SaaS Launch"
  context: string; // compact prompt-ready summary
  updatedAt: number;
};

export function setActiveStrategy(id: string, label: string, plan: StrategyPlan, brief?: Parameters<typeof summarizeStrategyForPrompt>[1]): ActiveStrategy {
  const value: ActiveStrategy = {
    id,
    label,
    context: summarizeStrategyForPrompt(plan, brief),
    updatedAt: Date.now(),
  };
  try { window.localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* quota */ }
  window.dispatchEvent(new CustomEvent("active-strategy:changed"));
  return value;
}

export function getActiveStrategy(): ActiveStrategy | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ActiveStrategy) : null;
  } catch { return null; }
}

export function clearActiveStrategy() {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("active-strategy:changed"));
}

/** Convenience: get just the prompt-ready context string, or empty string. */
export function getActiveStrategyContext(): string {
  return getActiveStrategy()?.context ?? "";
}
