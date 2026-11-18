// Server-side plan enforcement. The browser hides locked features, but this
// is what actually stops a lower plan from using them.
import {
  ACTION_FEATURE,
  PLAN_ACCESS_SETTINGS_KEY,
  checkFeature,
  parseOverrides,
  planRequiredError,
  tierForPlan,
  type Tier,
} from "@/lib/plan-access";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function getUserTier(userId: string): Promise<{ tier: Tier; isAdmin: boolean }> {
  const db = await admin();
  const [{ data: isAdmin }, { data: sub }] = await Promise.all([
    db.rpc("is_admin", { _user_id: userId }),
    db
      .from("subscriptions")
      .select("plan_name, expires_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const row = sub as { plan_name?: string | null; expires_at?: string | null } | null;
  const expired = !!row?.expires_at && new Date(row.expires_at).getTime() < Date.now();
  return { tier: expired ? "free" : tierForPlan(row?.plan_name), isAdmin: !!isAdmin };
}

async function getOverrides() {
  const db = await admin();
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", PLAN_ACCESS_SETTINGS_KEY)
    .maybeSingle();
  return parseOverrides((data as { value?: unknown } | null)?.value);
}

/** Throws `plan_required:{...}` when the user's plan doesn't include the feature. */
export async function assertFeature(userId: string, featureId: string): Promise<void> {
  const [{ tier, isAdmin }, overrides] = await Promise.all([getUserTier(userId), getOverrides()]);
  const check = checkFeature(featureId, tier, isAdmin, overrides);
  if (!check.allowed) throw planRequiredError(check.feature, check.required);
}

/** Enforce the feature behind a credit-charged action, if it has one. */
export async function assertActionAllowed(userId: string, action: string): Promise<void> {
  const featureId = ACTION_FEATURE[action];
  if (featureId) await assertFeature(userId, featureId);
}

/** Max connected accounts per platform for this user (Infinity for admins). */
export async function maxAccountsPerPlatform(userId: string): Promise<number> {
  const { tier, isAdmin } = await getUserTier(userId);
  if (isAdmin) return Number.POSITIVE_INFINITY;
  const { MAX_ACCOUNTS_PER_PLATFORM } = await import("./plan-access");
  return MAX_ACCOUNTS_PER_PLATFORM[tier];
}
