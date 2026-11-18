// What the support agent knows about CreatorFlow. Plans and prices are read
// live from the database; everything else is written here. Keep it short and
// factual — the agent is told to escalate anything this doesn't cover.

import { CREDIT_COSTS } from "@/lib/credit-costs";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const STATIC_KB = `
ABOUT
- CreatorFlow AI (creatorflowai.prodxstore.com) makes short reels, long videos, carousels, images, thumbnails, captions, SEO packs and LinkedIn posts with AI, and can publish them to connected Instagram, Facebook and YouTube accounts.
- Support email: ${SUPPORT_EMAIL}.

ACCOUNT & CREDITS
- New accounts get 50 free credits once at signup. There is no free monthly top-up.
- Monthly / yearly plans refill their credits every billing period. Lifetime plans include one-time credits plus a small monthly bonus.
- Spending order: plan monthly credits → top-up wallet → lifetime credits.
- If a generation fails, its credits are refunded automatically within a minute. Users can check Billing → history.
- Extra credits: Pricing → Credit packs, or Billing → Top up. Payments are by Razorpay (UPI, cards, netbanking).
- Auto-renew can be turned off any time in Billing; the plan stays active until the period ends.

HOW TO
- Short reel: AI Studio → Short reel → enter topic, pick language, length (15/30/60s), style and voice → Generate. Scene images start automatically; then press "Render video". The download is a 1080×1920 MP4.
- Cinematic video with the same character in every scene: Projects (Video studio) → keep "Keep the same person in every scene" on.
- Telugu / Hindi / Tamil and other languages: choose the Language option (or "Same as topic" and type the topic in that language). Script, captions and voice follow it.
- Carousel: Carousels → New, or AI Studio → Carousel. The slide count follows the number in the topic ("7 tools" → 9 slides incl. cover and CTA). Slides generate automatically; export as ZIP/PDF.
- Publishing: Connections → connect Instagram (Business/Creator account linked to a Facebook Page), Facebook Page or YouTube. Then the Publish button on any finished video/image. Needs the Creator plan or higher. LinkedIn and TikTok publishing are not available — copy the caption and post manually.
- Model Studio: premium video/image/voice models (Seedance, FLUX, ElevenLabs); the cost is shown before generating. Results can be saved to the Media Library.
- Voice preview: tap the speaker icon next to each voice (free).

KNOWN LIMITS
- Videos and in-progress jobs from the Video studio are stored in the browser on that device; they don't sync between devices.
- Keep the browser tab open while a video renders.
- Reel "Render video" creates any missing scene images first.

REFUND POLICY
- Failed generations refund automatically. Other refunds (verified platform issues) are handled by the team by email within 7 days of the issue — the agent must NOT promise refunds; escalate.
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function liveKb(db: any): Promise<string> {
  const { data: plans } = await db
    .from("pricing_plans")
    .select("name,plan_type,price_monthly_usd,price_yearly_usd,price_lifetime_usd,monthly_credits,included_credits")
    .eq("active", true)
    .order("sort_order");
  const planLines = (plans ?? []).map((p: Record<string, number | string>) =>
    p.plan_type === "lifetime"
      ? `- ${p.name}: $${p.price_lifetime_usd} once, ${p.included_credits} credits + ${p.monthly_credits}/month bonus`
      : p.plan_type === "free"
        ? `- ${p.name}: free, ${p.included_credits} credits once`
        : `- ${p.name}: $${p.price_monthly_usd}/month or $${p.price_yearly_usd}/year, ${p.monthly_credits} credits/month`,
  );
  const costLines = CREDIT_COSTS.map((c) => `- ${c.label}: ${c.credits} credits ${c.unit}`);
  // Bugs fixed recently, so the agent can tell people "this was fixed".
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: fixed } = await db
    .from("agent_tasks")
    .select("title,resolved_at")
    .eq("kind", "bug").eq("status", "done").gte("resolved_at", since)
    .order("resolved_at", { ascending: false }).limit(10);
  const fixedLines = (fixed ?? []).map((t: { title: string; resolved_at: string }) => `- ${t.title} (fixed ${t.resolved_at.slice(0, 10)})`);
  return `${STATIC_KB}
PLANS (live)
${planLines.join("\n")}

CREDIT COSTS
${costLines.join("\n")}
${fixedLines.length ? `\nRECENTLY FIXED\n${fixedLines.join("\n")}` : ""}`;
}
