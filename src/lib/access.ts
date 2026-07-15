// Access control + credit helpers (client-side).
// Admin bypass is enforced server-side by the deduct_credits() SQL function,
// but we also hardcode the admin email so the UI shows "Unlimited" even if
// the profiles row hasn't been synced yet.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_EMAIL = "prasannaskvd@gmail.com";

export function isAdminUser(email?: string | null): boolean {
  return !!email && email.toLowerCase() === ADMIN_EMAIL;
}

export type AccessInfo = {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  plan: string;
  planType: "free" | "monthly" | "yearly" | "lifetime" | "enterprise" | "admin";
  lifetimeAccess: boolean;
  unlimited: boolean;
  balance: number;             // profile.user_credits — top-up wallet
  lifetimeCredits: number;     // profile.lifetime_credits — one-time bucket from lifetime purchase
  monthlyLimit: number;        // subscription.monthly_credit_limit
  monthlyUsed: number;         // subscription.monthly_credits_used
  monthlyRemaining: number;
  renewsAt: string | null;
};

export async function getAccessInfo(): Promise<AccessInfo | null> {
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) return null;

  const [profRes, subRes] = await Promise.all([
    supabase.from("profiles").select("user_credits, lifetime_credits, is_admin, role, email").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).eq("status", "active").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const prof = profRes.data as { user_credits?: number; lifetime_credits?: number; is_admin?: boolean; email?: string | null } | null;
  const sub = subRes.data as {
    plan_name?: string; plan_type?: string; lifetime_access?: boolean;
    monthly_credit_limit?: number; monthly_credits_used?: number;
    unlimited_usage?: boolean; renews_at?: string | null;
  } | null;

  const emailIsAdmin = isAdminUser(user.email);
  const isAdmin = emailIsAdmin || !!prof?.is_admin;

  const limit = sub?.monthly_credit_limit ?? 0;
  const used = sub?.monthly_credits_used ?? 0;
  const planType = isAdmin
    ? "admin" as const
    : ((sub?.plan_type as AccessInfo["planType"]) ?? (sub?.plan_name ? "monthly" : "free"));

  return {
    userId: user.id,
    email: user.email ?? prof?.email ?? null,
    isAdmin,
    plan: isAdmin ? "admin" : (sub?.plan_name ?? "free"),
    planType,
    lifetimeAccess: !!sub?.lifetime_access,
    unlimited: isAdmin || !!sub?.unlimited_usage,
    balance: prof?.user_credits ?? 0,
    lifetimeCredits: prof?.lifetime_credits ?? 0,
    monthlyLimit: limit,
    monthlyUsed: used,
    monthlyRemaining: Math.max(0, limit - used),
    renewsAt: sub?.renews_at ?? null,
  };
}

export function useAccess() {
  return useQuery({ queryKey: ["access"], queryFn: getAccessInfo, staleTime: 30_000 });
}

/** Total credits the user could still spend (monthly + top-up + lifetime). Admins return Infinity. */
export function getAvailableCredits(a: AccessInfo): number {
  if (a.unlimited) return Number.POSITIVE_INFINITY;
  return a.monthlyRemaining + a.balance + a.lifetimeCredits;
}

export function canGenerate(a: AccessInfo, required: number): boolean {
  if (a.unlimited) return true;
  return getAvailableCredits(a) >= required;
}

/**
 * DEPRECATED direct API. Prefer `useCreditGuard()` in components. Kept as a
 * compatibility shim so existing modules keep working — it now goes through
 * the new credit ledger (reserve → finalize) instead of `deduct_credits`, so
 * every module has atomic reserve, refund, and audit trail.
 */
export async function deductUsage(params: {
  amount: number;
  projectId?: string | null;
  description: string;
  action?: string;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; source?: string; error?: string; remaining?: number; ledgerId?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "not_authenticated" };

  const idempotencyKey =
    params.idempotencyKey ??
    `${u.user.id}:${params.action ?? "generic"}:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const { reserveCreditsFn } = await import("@/lib/credits-guard.functions");
    const res = await reserveCreditsFn({
      data: {
        amount: params.amount,
        action: params.action ?? "generic",
        projectId: params.projectId ?? null,
        idempotencyKey,
        description: params.description,
      },
    });
    if (!res.ok) {
      if (res.error === "insufficient_credits") {
        // Notify the global gate — modal shows without losing user work.
        try {
          const { fireCreditGate } = await import("@/components/global-credit-gate");
          fireCreditGate({
            required: res.required,
            available: res.available,
            shortage: res.shortage,
            planType: res.plan_type,
          });
        } catch { /* non-DOM contexts */ }
      }
      return { ok: false, error: res.error, source: "insufficient" };
    }
    return { ok: true, source: res.source, ledgerId: res.ledger_id };
  } catch (e) {
    console.warn("[deductUsage] reserve failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "reserve_failed" };
  }
}

/** DEPRECATED. Prefer `useCreditGuard`. Refunds a specific ledger row if available. */
export async function refundUsage(params: {
  amount: number;
  projectId?: string | null;
  description: string;
  source: "subscription" | "balance" | "admin" | "lifetime";
  ledgerId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    if (params.ledgerId) {
      const { refundLedgerFn } = await import("@/lib/credits-guard.functions");
      const r = await refundLedgerFn({ data: { ledgerId: params.ledgerId, reason: params.description } });
      return { ok: !!r?.ok };
    }
    const { refundCreditsFn } = await import("@/lib/credits.functions");
    const legacySource = params.source === "lifetime" ? "balance" : params.source;
    const r = await refundCreditsFn({
      data: { amount: params.amount, projectId: params.projectId ?? null, description: params.description, source: legacySource },
    });
    return { ok: !!r?.ok };
  } catch (e) {
    console.warn("[refundUsage] failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "refund_failed" };
  }
}

/** DEPRECATED wrapper. Callers get the new ledger semantics automatically. */
export async function withCreditRefund<T>(
  spend: { amount: number; projectId?: string | null; description: string; action?: string },
  work: () => Promise<T>,
): Promise<T> {
  const deducted = await deductUsage(spend);
  if (!deducted.ok) {
    throw new Error(deducted.error || "Could not deduct credits");
  }
  try {
    const result = await work();
    if (deducted.ledgerId) {
      try {
        const { finalizeCreditsFn } = await import("@/lib/credits-guard.functions");
        await finalizeCreditsFn({ data: { ledgerId: deducted.ledgerId } });
      } catch (e) {
        console.warn("[withCreditRefund] finalize failed", e);
      }
    }
    return result;
  } catch (err) {
    void refundUsage({
      amount: spend.amount,
      projectId: spend.projectId ?? null,
      description: spend.description,
      source: (deducted.source as "subscription" | "balance" | "admin") ?? "balance",
      ledgerId: deducted.ledgerId,
    });
    throw err;
  }
}

