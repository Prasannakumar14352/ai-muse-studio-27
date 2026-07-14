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

/** Total credits the user could still spend (subscription + balance). Admins return Infinity. */
export function getAvailableCredits(a: AccessInfo): number {
  if (a.unlimited) return Number.POSITIVE_INFINITY;
  return a.monthlyRemaining + a.balance;
}

export function canGenerate(a: AccessInfo, required: number): boolean {
  if (a.unlimited) return true;
  return getAvailableCredits(a) >= required;
}

/** Deduct credits atomically via SECURITY DEFINER RPC. Returns source used. */
export async function deductUsage(params: {
  amount: number;
  projectId?: string | null;
  description: string;
}): Promise<{ ok: boolean; source?: string; error?: string; remaining?: number }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "not_authenticated" };

  // Client-side bypass mirror (server enforces too)
  if (isAdminUser(u.user.email)) {
    return { ok: true, source: "admin", remaining: -1 };
  }

  const { data, error } = await (supabase.rpc as any)("deduct_credits", {
    _user_id: u.user.id,
    _amount: params.amount,
    _project_id: params.projectId ?? null,
    _description: params.description,
  });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; source?: string; error?: string; remaining?: number };
}

/**
 * Refund credits to the same bucket they were spent from. Call this when a
 * generation fails AFTER a successful `deductUsage`. Safe to call for admin
 * (server no-ops). Never throws — logs and swallows on failure so callers
 * don't need extra try/catch just to refund.
 */
export async function refundUsage(params: {
  amount: number;
  projectId?: string | null;
  description: string;
  source: "subscription" | "balance" | "admin";
}): Promise<{ ok: boolean; error?: string }> {
  try {
    // Lazy-import so the browser bundle doesn't pull the server fn module eagerly.
    const { refundCreditsFn } = await import("@/lib/credits.functions");
    const result = await refundCreditsFn({ data: params });
    return { ok: !!result?.ok };
  } catch (e) {
    console.warn("[refundUsage] failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "refund_failed" };
  }
}

/**
 * Convenience wrapper: run an async generation, deducting BEFORE the work and
 * refunding automatically if the work throws. Returns the generation's result.
 *
 * Usage:
 *   const project = await withCreditRefund(
 *     { amount: 1, description: "AI image", projectId: null },
 *     async () => generateImage(),
 *   );
 */
export async function withCreditRefund<T>(
  spend: { amount: number; projectId?: string | null; description: string },
  work: () => Promise<T>,
): Promise<T> {
  const deducted = await deductUsage(spend);
  if (!deducted.ok) {
    throw new Error(deducted.error || "Could not deduct credits");
  }
  const source = (deducted.source ?? "balance") as "subscription" | "balance" | "admin";
  try {
    return await work();
  } catch (err) {
    // Best-effort refund — don't shadow the original error.
    void refundUsage({
      amount: spend.amount,
      projectId: spend.projectId ?? null,
      description: spend.description,
      source,
    });
    throw err;
  }
}
