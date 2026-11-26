// Private buyers' Telegram group: the invite link is handed out only to users
// with an active paid plan (Starter, Creator, Pro, lifetime…). Credit-pack-only
// buyers and free users see a locked card instead.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { userId: string };

export type BuyersGroupAccess = {
  configured: boolean;     // admin has set a link
  eligible: boolean;       // user has an active paid plan
  plan: string | null;
  url: string | null;      // only when eligible
};

export const getBuyersGroupAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BuyersGroupAccess> => {
    const { userId } = context as unknown as Ctx;
    const { admin, getAgentSettings } = await import("@/lib/agents/core.server");
    const db = await admin();
    const [settings, { data: subs }, { data: isAdminRpc }] = await Promise.all([
      getAgentSettings(db),
      db.from("subscriptions")
        .select("plan_name, plan_type, expires_at, lifetime_access")
        .eq("user_id", userId).eq("status", "active")
        .order("started_at", { ascending: false }).limit(5),
      // Admin check via user_roles, not the profiles.is_admin column.
      db.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    const now = Date.now();
    const paid = ((subs ?? []) as Array<{ plan_name: string | null; plan_type: string | null; expires_at: string | null; lifetime_access: boolean | null }>)
      .find((s) => {
        const name = (s.plan_name ?? "free").toLowerCase();
        if (name === "free" || (s.plan_type ?? "").toLowerCase() === "free") return false;
        return Boolean(s.lifetime_access) || !s.expires_at || new Date(s.expires_at).getTime() > now;
      });
    const isAdmin = isAdminRpc === true;
    const eligible = Boolean(paid) || isAdmin;
    const url = settings.buyers_group_invite_url;
    return {
      configured: Boolean(url),
      eligible,
      plan: paid?.plan_name ?? (isAdmin ? "admin" : null),
      url: eligible ? url : null,
    };
  });
