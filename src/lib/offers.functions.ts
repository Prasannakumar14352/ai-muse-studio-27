// Offers: admin management (Admin → Offers) and the public festival banner.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { userId: string };

async function adminDb(context: Ctx) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("is_admin", { _user_id: context.userId });
  if (!isAdmin) throw new Error("Forbidden: admin only");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export type AdminOffer = import("@/lib/offers.server").OfferRow & {
  redeemed: number; pending: number; revenuePaise: number; discountGivenPaise: number; bonusGiven: number;
};

export const listOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb(context as unknown as Ctx);
    const { data, error } = await db.from("offers").select("*").order("created_at", { ascending: false });
    if (error) {
      if (/relation .*offers.* does not exist|Could not find the table/i.test(error.message)) {
        return { offers: [] as AdminOffer[], needsMigration: true };
      }
      throw new Error(error.message);
    }
    const { data: reds } = await db.from("offer_redemptions").select("offer_id,status,amount_paise,discount_paise,bonus_credits").limit(20000);
    const stats = new Map<string, { redeemed: number; pending: number; revenuePaise: number; discountGivenPaise: number; bonusGiven: number }>();
    for (const r of (reds ?? []) as Array<{ offer_id: string; status: string; amount_paise: number; discount_paise: number; bonus_credits: number }>) {
      const s = stats.get(r.offer_id) ?? { redeemed: 0, pending: 0, revenuePaise: 0, discountGivenPaise: 0, bonusGiven: 0 };
      if (r.status === "redeemed") {
        s.redeemed++; s.revenuePaise += r.amount_paise; s.discountGivenPaise += r.discount_paise; s.bonusGiven += r.bonus_credits;
      } else s.pending++;
      stats.set(r.offer_id, s);
    }
    const offers = (data ?? []).map((o: import("@/lib/offers.server").OfferRow) => ({
      ...o,
      ...(stats.get(o.id) ?? { redeemed: 0, pending: 0, revenuePaise: 0, discountGivenPaise: 0, bonusGiven: 0 }),
    })) as AdminOffer[];
    return { offers, needsMigration: false };
  });

const KINDS = ["packs", "monthly", "yearly", "lifetime", "autopay"] as const;

const offerInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - or _ only"),
  title: z.string().trim().max(80).default(""),
  discountType: z.enum(["percent", "flat_inr", "bonus_credits"]),
  discountValue: z.number().positive(),
  appliesTo: z.array(z.enum(KINDS)).min(1, "Pick at least one thing the offer applies to"),
  planCodes: z.array(z.string().trim().min(1)).default([]),
  recurring: z.enum(["first", "cycles", "forever"]).default("first"),
  recurringCycles: z.number().int().min(1).max(36).nullable().optional(),
  razorpayOfferId: z.string().trim().max(40).regex(/^(offer_[A-Za-z0-9]{14})?$/, "Razorpay offer IDs look like offer_XXXXXXXXXXXXXX").nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  minAmountInr: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  showBanner: z.boolean().default(false),
  bannerText: z.string().trim().max(160).nullable().optional(),
  autoApply: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (v.discountType === "percent" && v.discountValue > 90) ctx.addIssue({ code: "custom", message: "Percent off can be at most 90%", path: ["discountValue"] });
  if (v.discountType === "bonus_credits" && v.discountValue > 500) ctx.addIssue({ code: "custom", message: "Bonus credits can be at most +500%", path: ["discountValue"] });
  if (v.recurring === "cycles" && !v.recurringCycles) ctx.addIssue({ code: "custom", message: "How many months should the discount last?", path: ["recurringCycles"] });
  if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) ctx.addIssue({ code: "custom", message: "End must be after start", path: ["endsAt"] });
});

export const saveOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => offerInput.parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb(context as unknown as Ctx);
    const row = {
      code: data.code.toUpperCase(),
      title: data.title,
      discount_type: data.discountType,
      discount_value: data.discountValue,
      applies_to: data.appliesTo,
      plan_codes: data.planCodes,
      recurring: data.recurring,
      recurring_cycles: data.recurring === "cycles" ? data.recurringCycles ?? null : null,
      razorpay_offer_id: data.razorpayOfferId || null,
      starts_at: data.startsAt ?? null,
      ends_at: data.endsAt ?? null,
      max_redemptions: data.maxRedemptions ?? null,
      per_user_limit: data.perUserLimit,
      min_amount_inr: data.minAmountInr,
      active: data.active,
      show_banner: data.showBanner,
      banner_text: data.bannerText || null,
      auto_apply: data.autoApply,
      updated_at: new Date().toISOString(),
    };
    const q = data.id ? db.from("offers").update(row).eq("id", data.id) : db.from("offers").insert(row);
    const { error } = await q;
    if (error) {
      if (error.code === "23505") throw new Error(`The code ${row.code} already exists.`);
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const setOfferActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb(context as unknown as Ctx);
    const { error } = await db.from("offers").update({ active: data.active, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete an offer nobody has used yet (used offers are switched off instead, to keep invoices intact). */
export const deleteOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb(context as unknown as Ctx);
    const { count } = await db.from("offer_redemptions").select("id", { count: "exact", head: true }).eq("offer_id", data.id);
    if ((count ?? 0) > 0) throw new Error("This offer has been used, so it can't be deleted. Switch it off instead.");
    const { error } = await db.from("offers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: the festival banner to show on the landing / pricing pages, if one is live. */
export const getOfferBanner = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { bannerOffer, offerLabel } = await import("@/lib/offers.server");
    const o = await bannerOffer(supabaseAdmin);
    if (!o) return null;
    return {
      title: o.title || "Special offer",
      text: o.banner_text || null,
      label: offerLabel(o),
      // Codes that apply automatically don't need to be shown.
      code: o.auto_apply ? null : o.code,
      autoApply: o.auto_apply,
      endsAt: o.ends_at,
    };
  } catch {
    return null; // never break the landing page over a banner
  }
});
