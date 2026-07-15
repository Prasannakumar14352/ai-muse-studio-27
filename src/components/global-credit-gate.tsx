import { useEffect, useState, useCallback } from "react";
import { InsufficientCreditsDialog, type InsufficientCreditsInfo } from "@/components/insufficient-credits-dialog";
import { useAccess } from "@/lib/access";

export type CreditGateEventDetail = {
  required?: number;
  available?: number;
  shortage?: number;
  planType?: string;
  message?: string;
};

/**
 * Global bus so legacy modules that call `deductUsage` (rather than the
 * per-component `useCreditGuard` hook) can still surface the correct
 * plan-aware upgrade / top-up modal without losing the user's current work.
 * Wizard forms remain mounted — the modal is a portal overlay.
 */
export function fireCreditGate(detail: CreditGateEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CreditGateEventDetail>("cf:credit-gate", { detail }));
}

/** Mounted once inside the authenticated shell; listens to the global bus. */
export function GlobalCreditGate() {
  const { data: access } = useAccess();
  const [info, setInfo] = useState<InsufficientCreditsInfo | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<CreditGateEventDetail>).detail ?? {};
      const planType = detail.planType ?? access?.planType ?? "free";
      const isPaid = planType !== "free" && planType !== "admin" ? true : planType === "admin" ? false : false;
      setInfo({
        required: detail.required ?? 1,
        available: detail.available ?? 0,
        shortage: detail.shortage ?? Math.max(1, (detail.required ?? 1) - (detail.available ?? 0)),
        planType,
        isPaid,
      });
    };
    window.addEventListener("cf:credit-gate", onEvent);
    return () => window.removeEventListener("cf:credit-gate", onEvent);
  }, [access]);

  const onOpenChange = useCallback((open: boolean) => {
    if (!open) setInfo(null);
  }, []);

  return (
    <InsufficientCreditsDialog
      open={!!info}
      onOpenChange={onOpenChange}
      info={info}
    />
  );
}
