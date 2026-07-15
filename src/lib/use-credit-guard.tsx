import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { reserveCreditsFn, finalizeCreditsFn, refundLedgerFn } from "@/lib/credits-guard.functions";
import type { ReserveResult } from "@/lib/credits-guard.functions";
import { useAccess } from "@/lib/access";
import { InsufficientCreditsDialog } from "@/components/insufficient-credits-dialog";
import type { CreditAction } from "@/lib/credit-estimator";

export type RunSpec = {
  action: CreditAction | string;
  amount: number;
  description?: string;
  projectId?: string | null;
  /** Hash of the input params so retries reuse the ledger row. */
  inputHash?: string;
};

type PendingIntent = {
  spec: RunSpec;
  work: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

function makeIdempotencyKey(userId: string, spec: RunSpec): string {
  const nonce = spec.inputHash ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${userId}:${spec.action}:${nonce}`;
}

/**
 * Centralized generation guard.
 *
 * Usage:
 *   const { runWithCredits, InsufficientDialog, pending } = useCreditGuard();
 *   await runWithCredits({ action: 'image', amount: 4, description: '...' }, () => generate());
 *   {InsufficientDialog}
 */
export function useCreditGuard() {
  const { data: access, refetch } = useAccess();
  const qc = useQueryClient();
  const reserve = useServerFn(reserveCreditsFn);
  const finalize = useServerFn(finalizeCreditsFn);
  const refund = useServerFn(refundLedgerFn);

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [insufficient, setInsufficient] = useState<null | {
    required: number; available: number; shortage: number; planType: string; isPaid: boolean;
  }>(null);
  const [retrying, setRetrying] = useState(false);
  const lastIntentRef = useRef<PendingIntent | null>(null);

  const inFlight = useRef<Map<string, Promise<unknown>>>(new Map());

  const runIntent = useCallback(async (spec: RunSpec, work: () => Promise<unknown>): Promise<unknown> => {
    if (!access?.userId) throw new Error("Please sign in to generate.");

    const key = makeIdempotencyKey(access.userId, spec);

    // Double-click protection: dedupe by idempotency key while pending.
    const inflightExisting = inFlight.current.get(key);
    if (inflightExisting) return inflightExisting;

    const promise = (async () => {
      setPending((s) => new Set(s).add(key));
      let ledgerId: string | null = null;
      try {
        const res = (await reserve({
          data: {
            amount: spec.amount,
            action: String(spec.action),
            projectId: spec.projectId ?? null,
            idempotencyKey: key,
            description: spec.description,
          },
        })) as ReserveResult;

        if (!res.ok) {
          if (res.error === "insufficient_credits") {
            const isPaid = !!access && access.planType !== "free";
            setInsufficient({
              required: res.required ?? spec.amount,
              available: res.available ?? 0,
              shortage: res.shortage ?? spec.amount,
              planType: res.plan_type ?? access?.planType ?? "free",
              isPaid,
            });
            const err = new Error("Insufficient credits");
            (err as { code?: string }).code = "insufficient_credits";
            throw err;
          }
          throw new Error(res.error || "Could not reserve credits");
        }

        ledgerId = res.ledger_id;
        try {
          const out = await work();
          await finalize({ data: { ledgerId } }).catch((e) => console.warn("[credit-guard] finalize failed", e));
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["access"] }),
            refetch(),
          ]);
          return out;
        } catch (workErr) {
          if (ledgerId) {
            await refund({ data: { ledgerId, reason: workErr instanceof Error ? workErr.message.slice(0, 200) : "generation_failed" } })
              .catch((e) => console.warn("[credit-guard] refund failed", e));
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["access"] }),
              refetch(),
            ]);
          }
          throw workErr;
        }
      } finally {
        setPending((s) => { const n = new Set(s); n.delete(key); return n; });
        inFlight.current.delete(key);
      }
    })();

    inFlight.current.set(key, promise);
    return promise;
  }, [access, reserve, finalize, refund, qc, refetch]);

  const runWithCredits = useCallback(async <T,>(spec: RunSpec, work: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      lastIntentRef.current = {
        spec,
        work: work as () => Promise<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
      };
      runIntent(spec, work as () => Promise<unknown>)
        .then((v) => resolve(v as T))
        .catch((err) => {
          const code = (err as { code?: string } | null)?.code;
          if (code !== "insufficient_credits") {
            // Non-credit errors are surfaced via toast so callers don't each duplicate this.
            const msg = err instanceof Error ? err.message : "Generation failed";
            toast.error(msg);
          }
          reject(err);
        });
    });
  }, [runIntent]);

  const handleRetry = useCallback(async () => {
    const intent = lastIntentRef.current;
    if (!intent) return;
    setRetrying(true);
    try {
      await refetch();
      const out = await runIntent(intent.spec, intent.work);
      setInsufficient(null);
      intent.resolve(out);
    } catch (err) {
      // Modal stays open on retry failure (still not enough credits, likely)
      console.warn("[credit-guard] retry failed", err);
    } finally {
      setRetrying(false);
    }
  }, [refetch, runIntent]);

  const InsufficientDialog = useMemo(() => (
    <InsufficientCreditsDialog
      open={!!insufficient}
      onOpenChange={(o) => { if (!o) setInsufficient(null); }}
      info={insufficient}
      onRetry={handleRetry}
      retrying={retrying}
    />
  ), [insufficient, handleRetry, retrying]);

  const isPending = useCallback((spec?: Partial<RunSpec>) => {
    if (!spec || !access?.userId) return pending.size > 0;
    if (spec.action && spec.inputHash) {
      const key = makeIdempotencyKey(access.userId, spec as RunSpec);
      return pending.has(key);
    }
    return pending.size > 0;
  }, [pending, access]);

  return { runWithCredits, InsufficientDialog, pending, isPending };
}
