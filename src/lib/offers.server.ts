// Festival / promo offers. All pricing decisions happen here, on the server:
// the browser only ever sends a code, never an amount.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type OfferKind = "packs" | "monthly" | "yearly" | "lifetime" | "autopay";

export type OfferRow = {
  id: string; code: string; title: string;
  discount_type: "percent" | "flat_inr" | "bonus_credits"; discount_value: number;
  applies_to: OfferKind[]; plan_codes: string[];
  recurring: "first" | "cycles" | "forever"; recurring_cycles: number | null;
  razorpay_offer_id: string | null;
  starts_at: string | null; ends_at: string | null;
  max_redemptions: number | null; per_user_limit: number; min_amount_inr: number;
  active: boolean; show_banner: boolean; banner_text: string | null; auto_apply: boolean;
  created_at: string; updated_at: string;
};

export type OfferQuote = {
  offerId: string;
  code: string;
  title: string;
  /** Short human label: "30% off", "₹200 off", "+50% bonus credits". */
  label: string;
  originalPaise: number;
  discountPaise: number;
  finalPaise: number;
  bonusCredits: number;
  /** Auto-renew only: attach this Razorpay offer to the subscription. */
  razorpayOfferId: string | null;
  /** Auto-renew only: how long the discount lasts, for display. */
  duration: string | null;
};

const MIN_PAISE = 100; // Razorpay minimum for INR is ₹1.00

export function normalizeCode(code: string): string {
  // Codes are letters, digits, - and _ only (enforced in admin), stored uppercase.
  return code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

export function offerLabel(o: Pick<OfferRow, "discount_type" | "discount_value">): string {
  const v = Number(o.discount_value);
  if (o.discount_type === "percent") return `${v}% off`;
  if (o.discount_type === "flat_inr") return `₹${v.toLocaleString("en-IN")} off`;
  return `+${v}% bonus credits`;
}

export function offerDuration(o: Pick<OfferRow, "recurring" | "recurring_cycles">, cycle: "monthly" | "yearly"): string {
  const unit = cycle === "yearly" ? "year" : "month";
  if (o.recurring === "forever") return `every ${unit} while subscribed`;
  if (o.recurring === "cycles" && o.recurring_cycles && o.recurring_cycles > 1) return `for the first ${o.recurring_cycles} ${unit}s`;
  return `on the first ${unit}`;
}

function isLive(o: OfferRow, now = Date.now()): boolean {
  if (!o.active) return false;
  if (o.starts_at && new Date(o.starts_at).getTime() > now) return false;
  if (o.ends_at && new Date(o.ends_at).getTime() <= now) return false;
  return true;
}

async function redeemedCount(admin: Admin, offerId: string, userId?: string): Promise<number> {
  let q = admin.from("offer_redemptions").select("id", { count: "exact", head: true }).eq("offer_id", offerId).eq("status", "redeemed");
  if (userId) q = q.eq("user_id", userId);
  const { count } = await q;
  return count ?? 0;
}

/** Live offers that apply automatically (no code typed), newest first. */
async function autoApplyOffers(admin: Admin): Promise<OfferRow[]> {
  const { data } = await admin.from("offers").select("*").eq("active", true).eq("auto_apply", true).order("created_at", { ascending: false });
  return ((data ?? []) as OfferRow[]).filter((o) => isLive(o));
}

export class OfferError extends Error {}

/**
 * Work out what an offer does to one checkout.
 * - `code` given → that offer must be valid, otherwise an OfferError explains why.
 * - no code → the best live auto-apply offer, if any (silently none otherwise).
 */
export async function quoteOffer(admin: Admin, args: {
  code?: string | null;
  userId: string;
  kind: OfferKind;
  planCode?: string | null;
  cycle?: "monthly" | "yearly" | null;
  amountPaise: number;
  credits: number;
}): Promise<OfferQuote | null> {
  const code = args.code ? normalizeCode(args.code) : "";
  if (args.code && !code) throw new OfferError("That code isn't valid.");
  let candidates: OfferRow[];
  if (code) {
    // Exact match only — never a pattern, so "%" can't reveal another code.
    const { data } = await admin.from("offers").select("*").eq("code", code).maybeSingle();
    const o = data as OfferRow | null;
    if (!o || !o.active) throw new OfferError("That code isn't valid.");
    if (o.starts_at && new Date(o.starts_at).getTime() > Date.now()) throw new OfferError("This offer hasn't started yet.");
    if (o.ends_at && new Date(o.ends_at).getTime() <= Date.now()) throw new OfferError("This offer has ended.");
    candidates = [o];
  } else {
    candidates = await autoApplyOffers(admin);
    if (!candidates.length) return null;
  }

  const quotes: OfferQuote[] = [];
  for (const o of candidates) {
    const why = await whyNot(admin, o, args);
    if (why) {
      if (code) throw new OfferError(why);
      continue;
    }
    quotes.push(computeQuote(o, args));
  }
  if (!quotes.length) return null;
  // Best deal for the customer when several auto-apply offers match.
  return quotes.sort((a, b) => (b.discountPaise - a.discountPaise) || (b.bonusCredits - a.bonusCredits))[0];
}

async function whyNot(admin: Admin, o: OfferRow, args: { userId: string; kind: OfferKind; planCode?: string | null; amountPaise: number }): Promise<string | null> {
  if (!(o.applies_to ?? []).includes(args.kind)) {
    const names: Record<OfferKind, string> = { packs: "credit packs", monthly: "monthly plans", yearly: "yearly plans", lifetime: "lifetime plans", autopay: "auto-renew plans" };
    const ok = (o.applies_to ?? []).map((k) => names[k]).filter(Boolean);
    return ok.length ? `This code works on ${ok.join(", ")} only.` : "This code can't be used here.";
  }
  if (args.kind !== "packs" && (o.plan_codes ?? []).length && (!args.planCode || !o.plan_codes.includes(args.planCode))) {
    return "This code doesn't apply to this plan.";
  }
  if (o.min_amount_inr && args.amountPaise < o.min_amount_inr * 100) {
    return `This code needs an order of at least ₹${o.min_amount_inr.toLocaleString("en-IN")}.`;
  }
  if (o.max_redemptions && (await redeemedCount(admin, o.id)) >= o.max_redemptions) return "This offer has been fully used.";
  if ((await redeemedCount(admin, o.id, args.userId)) >= (o.per_user_limit || 1)) return "You've already used this code.";
  return null;
}

function computeQuote(o: OfferRow, args: { kind: OfferKind; cycle?: "monthly" | "yearly" | null; amountPaise: number; credits: number }): OfferQuote {
  const value = Number(o.discount_value);
  const original = args.amountPaise;
  let discount = 0;
  let bonus = 0;
  let razorpayOfferId: string | null = null;
  let duration: string | null = null;

  if (o.discount_type === "bonus_credits") {
    bonus = Math.floor((args.credits * value) / 100);
  } else {
    const off = o.discount_type === "percent"
      ? Math.round((original * Math.min(90, value)) / 100)
      : Math.round(value * 100);
    if (args.kind === "autopay") {
      // Razorpay subscriptions charge the plan price; a Razorpay offer makes the
      // discount. Without one, the customer gets the same value as bonus credits.
      if (o.razorpay_offer_id) {
        discount = Math.min(off, original - MIN_PAISE);
        razorpayOfferId = o.razorpay_offer_id;
        duration = offerDuration(o, args.cycle ?? "monthly");
      } else {
        bonus = Math.floor((args.credits * Math.min(off, original)) / Math.max(1, original));
      }
    } else {
      discount = Math.min(off, Math.max(0, original - MIN_PAISE));
    }
  }
  const finalPaise = Math.max(MIN_PAISE, original - discount);
  // Whole rupees, like every other price we charge.
  const finalRounded = Math.max(MIN_PAISE, Math.round(finalPaise / 100) * 100);
  return {
    offerId: o.id,
    code: o.code,
    title: o.title || o.code,
    label: bonus && !discount && o.discount_type !== "bonus_credits" ? `+${bonus.toLocaleString()} bonus credits` : offerLabel(o),
    originalPaise: original,
    discountPaise: original - finalRounded,
    finalPaise: finalRounded,
    bonusCredits: bonus,
    razorpayOfferId,
    duration,
  };
}

/** Remember that a checkout used an offer. Redeemed only after payment succeeds. */
export async function recordPendingRedemption(admin: Admin, args: {
  quote: OfferQuote; userId: string; paymentRef: string; kind: OfferKind;
}): Promise<void> {
  const { error } = await admin.from("offer_redemptions").insert({
    offer_id: args.quote.offerId,
    user_id: args.userId,
    payment_ref: args.paymentRef,
    kind: args.kind,
    original_paise: args.quote.originalPaise,
    discount_paise: args.quote.discountPaise,
    amount_paise: args.quote.finalPaise,
    bonus_credits: args.quote.bonusCredits,
  });
  if (error) console.error("offer redemption insert failed", error.message);
}

/** Mark the redemption for this order / subscription as used. Returns it, once. */
export async function markRedeemed(admin: Admin, paymentRef: string): Promise<{ bonus_credits: number; amount_paise: number } | null> {
  const { data } = await admin.from("offer_redemptions")
    .update({ status: "redeemed", redeemed_at: new Date().toISOString() })
    .eq("payment_ref", paymentRef).eq("status", "pending")
    .select("bonus_credits, amount_paise");
  const row = (data ?? [])[0] as { bonus_credits: number; amount_paise: number } | undefined;
  return row ?? null;
}

/** The offer to advertise in the site banner (live + show_banner), if any. */
export async function bannerOffer(admin: Admin): Promise<OfferRow | null> {
  const { data } = await admin.from("offers").select("*").eq("active", true).eq("show_banner", true).order("created_at", { ascending: false });
  return ((data ?? []) as OfferRow[]).find((o) => isLive(o)) ?? null;
}

export async function addBonusCredits(admin: Admin, userId: string, credits: number): Promise<void> {
  if (!credits || credits <= 0) return;
  const { data: profile } = await admin.from("profiles").select("user_credits").eq("id", userId).maybeSingle();
  const current = (profile as { user_credits?: number } | null)?.user_credits ?? 0;
  await admin.from("profiles").update({ user_credits: current + credits }).eq("id", userId);
}
