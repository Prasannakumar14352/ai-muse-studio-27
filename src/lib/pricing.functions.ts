// Public + admin pricing plan APIs. Pricing lives in the pricing_plans
// table so admins can edit price, credits, features, badge, and highlight
// without a code change.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type BillingCycle = "monthly" | "yearly" | "lifetime";

export type PricingPlan = {
  id: string;
  code: string;
  name: string;
  tier: string | null;
  planType: string;
  priceMonthlyInr: number;
  priceYearlyInr: number;
  priceLifetimeInr: number;
  discountPct: number;
  monthlyCredits: number;
  includedCredits: number;
  features: string[];
  featured: boolean;
  active: boolean;
  contactSales: boolean;
  sortOrder: number;
  badge: string | null;
};

function mapRow(r: Record<string, unknown>): PricingPlan {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    tier: (r.tier as string | null) ?? null,
    planType: String(r.plan_type),
    priceMonthlyInr: Number(r.price_monthly_inr ?? 0),
    priceYearlyInr: Number(r.price_yearly_inr ?? 0),
    priceLifetimeInr: Number(r.price_lifetime_inr ?? 0),
    discountPct: Number(r.discount_pct ?? 0),
    monthlyCredits: Number(r.monthly_credits ?? 0),
    includedCredits: Number(r.included_credits ?? 0),
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
    featured: Boolean(r.featured),
    active: Boolean(r.active),
    contactSales: Boolean(r.contact_sales),
    sortOrder: Number(r.sort_order ?? 0),
    badge: (r.badge as string | null) ?? null,
  };
}

/** Public list of active plans — used by the landing + pricing pages. */
export const listPricingPlans = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supabasePublic = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await supabasePublic
    .from("pricing_plans")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return { plans: (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>)) };
});

/** Admin: list ALL plans (active + inactive). */
export const adminListPricingPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("pricing_plans")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>)) };
  });

export type UpsertPlanInput = {
  id?: string;
  code: string;
  name: string;
  tier?: string | null;
  planType: string;
  priceMonthlyInr: number;
  priceYearlyInr: number;
  priceLifetimeInr: number;
  discountPct: number;
  monthlyCredits: number;
  includedCredits: number;
  features: string[];
  featured: boolean;
  active: boolean;
  contactSales: boolean;
  sortOrder: number;
  badge?: string | null;
};

export const adminUpsertPricingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpsertPlanInput) => {
    if (!input?.code || !input.name) throw new Error("code and name required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      code: data.code,
      name: data.name,
      tier: data.tier ?? null,
      plan_type: data.planType,
      price_monthly_inr: Math.max(0, Math.floor(data.priceMonthlyInr)),
      price_yearly_inr: Math.max(0, Math.floor(data.priceYearlyInr)),
      price_lifetime_inr: Math.max(0, Math.floor(data.priceLifetimeInr)),
      discount_pct: Math.max(0, Math.min(100, Math.floor(data.discountPct))),
      monthly_credits: Math.max(0, Math.floor(data.monthlyCredits)),
      included_credits: Math.max(0, Math.floor(data.includedCredits)),
      features: data.features,
      featured: data.featured,
      active: data.active,
      contact_sales: data.contactSales,
      sort_order: Math.floor(data.sortOrder),
      badge: data.badge ?? null,
    };

    if (data.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("pricing_plans")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { plan: mapRow(updated as unknown as Record<string, unknown>) };
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("pricing_plans")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { plan: mapRow(inserted as unknown as Record<string, unknown>) };
  });

export const adminDeletePricingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input?.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("pricing_plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Helper used by checkout to compute the amount in paise for a plan+cycle. */
export function amountInrForCycle(plan: PricingPlan, cycle: BillingCycle): number {
  if (cycle === "monthly") return plan.priceMonthlyInr;
  if (cycle === "yearly") return plan.priceYearlyInr;
  return plan.priceLifetimeInr;
}
