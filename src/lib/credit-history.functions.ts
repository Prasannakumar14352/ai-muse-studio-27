// Billing → Credit history: every credit spent, refunded or bought, newest first.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CreditHistoryRow = {
  id: string;
  at: string;
  label: string;
  /** Negative = spent, positive = added. */
  credits: number;
  status: "charged" | "refunded" | "reserved" | "purchase";
  balanceAfter: number | null;
};

const ACTION_LABEL: Record<string, string> = {
  // Media
  image: "AI image", image_hd: "AI image (HD)", image_regen: "Scene image (redo)", model_image: "Model Studio image",
  voiceover: "Voiceover", narration: "Narration", motion_clip: "Motion clip", final_export: "Video export",
  // Video Studio
  video_script: "Video script", video_scenes: "Video scenes", video_scenes_plan: "Scene plan from script",
  video_seo: "Video SEO", video_hook: "Video hook", video_chapters: "Video chapters",
  video_title_variants: "Video title ideas",
  // Planning & research
  plan_content: "Content plan", plan_regen_section: "Content plan (section redo)", research: "Topic research",
  strategy: "AI strategy", agent_campaign: "Agent campaign", creative_director: "Creative director",
  intent_detect: "Request analysis", ai_edit_text: "AI text edit",
  // Carousels / LinkedIn / captions
  carousel: "Carousel", carousel_plan: "Carousel plan", caption: "Captions", script: "Script & captions",
  linkedin: "LinkedIn post", linkedin_generate: "LinkedIn post", linkedin_regen_section: "LinkedIn post (section redo)",
  linkedin_score: "LinkedIn post score", linkedin_carousel: "LinkedIn carousel", linkedin_carousel_slide: "LinkedIn carousel slide",
  // Thumbnails / promo / SEO / publishing
  thumbnail: "Thumbnail", thumbnail_plan: "Thumbnail plan", thumbnail_analyze: "Thumbnail analysis",
  thumbnail_reverse: "Thumbnail remix", promo_plan: "Promo video plan", promo_scene_regen: "Promo scene redo",
  seo: "SEO package", seo_package: "SEO package", seo_regen: "SEO package (redo)",
  publish_kit: "Publish kit", publish_kit_review: "Publish kit review", repurpose: "Repurpose",
  model_studio: "Model Studio", generic: "AI generation",
};

/** Readable name: a real description wins; raw keys map to a label. */
export function creditActionLabel(action: string, description?: string | null): string {
  const d = (description ?? "").trim();
  // chargeMiddleware stores the raw key as the description ("video_hook") — skip those.
  if (d && !/^[a-z0-9_]+$/.test(d)) return d;
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  const words = (d || action).replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const listMyCreditHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ before: z.string().datetime().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const PAGE = 50;
    let ledgerQ = context.supabase
      .from("credit_ledger")
      .select("id, action, status, description, credits_reserved, credits_charged, credits_refunded, balance_after, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(PAGE);
    let payQ = context.supabase
      .from("payments")
      .select("id, pack_id, credits, created_at")
      .eq("user_id", context.userId)
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(PAGE);
    if (data.before) { ledgerQ = ledgerQ.lt("created_at", data.before); payQ = payQ.lt("created_at", data.before); }
    const [{ data: ledger, error }, { data: pays }] = await Promise.all([ledgerQ, payQ]);
    if (error) throw new Error(error.message);

    const rows: CreditHistoryRow[] = [];
    for (const l of (ledger ?? []) as Array<{
      id: string; action: string; status: string; description: string | null; credits_reserved: number | null;
      credits_charged: number | null; credits_refunded: number | null; balance_after: number | null; created_at: string;
    }>) {
      const charged = l.credits_charged ?? 0;
      const refunded = l.credits_refunded ?? 0;
      const status: CreditHistoryRow["status"] = l.status === "refunded" || (refunded > 0 && refunded >= charged)
        ? "refunded" : l.status === "reserved" ? "reserved" : "charged";
      const credits = status === "reserved" ? -(l.credits_reserved ?? 0) : -(charged - refunded);
      rows.push({
        id: l.id,
        at: l.created_at,
        label: creditActionLabel(l.action, l.description),
        credits: status === "refunded" ? 0 : credits,
        status,
        balanceAfter: l.balance_after,
      });
    }
    for (const p of (pays ?? []) as Array<{ id: string; pack_id: string | null; credits: number; created_at: string }>) {
      const plan = p.pack_id?.startsWith("plan_");
      rows.push({
        id: `pay_${p.id}`,
        at: p.created_at,
        label: plan ? `Plan purchase (${p.pack_id!.slice(5).replace(/_/g, " ")})` : "Credit pack purchase",
        credits: p.credits,
        status: "purchase",
        balanceAfter: null,
      });
    }
    rows.sort((a, b) => b.at.localeCompare(a.at));
    const page = rows.slice(0, PAGE);
    return { rows: page, nextBefore: rows.length >= PAGE ? page[page.length - 1].at : null };
  });
