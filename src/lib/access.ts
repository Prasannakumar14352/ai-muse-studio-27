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
  unlimited: boolean;
  balance: number;         // profile.user_credits
  monthlyLimit: number;    // subscription.monthly_credit_limit
  monthlyUsed: number;     // subscription.monthly_credits_used
  monthlyRemaining: number;
  renewsAt: string | null;
};

export async function getAccessInfo(): Promise<AccessInfo | null> {
  const { data: u } = await supabase.auth.getUser();
  const user = u.user;
  if (!user) return null;

  const [profRes, subRes] = await Promise.all([
    supabase.from("profiles").select("user_credits, is_admin, role, email").eq("id", user.id).maybeSingle(),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).eq("status", "active").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const prof = profRes.data as { user_credits?: number; is_admin?: boolean; email?: string | null } | null;
  const sub = subRes.data as {
    plan_name?: string; monthly_credit_limit?: number; monthly_credits_used?: number;
    unlimited_usage?: boolean; renews_at?: string | null;
  } | null;

  const emailIsAdmin = isAdminUser(user.email);
  const isAdmin = emailIsAdmin || !!prof?.is_admin;

  const limit = sub?.monthly_credit_limit ?? 0;
  const used = sub?.monthly_credits_used ?? 0;

  return {
    userId: user.id,
    email: user.email ?? prof?.email ?? null,
    isAdmin,
    plan: isAdmin ? "admin" : (sub?.plan_name ?? "free"),
    unlimited: isAdmin || !!sub?.unlimited_usage,
    balance: prof?.user_credits ?? 0,
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
