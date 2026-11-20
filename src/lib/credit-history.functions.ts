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
  script: "Script & captions", image: "AI image", image_hd: "AI image (HD)", image_regen: "Scene image (redo)",
  carousel: "Carousel", voiceover: "Voiceover", motion_clip: "Motion clip", caption: "Captions",
  thumbnail: "Thumbnail", research: "Research", seo: "SEO package", linkedin: "LinkedIn post",
  repurpose: "Repurpose", strategy: "AI strategy", model_studio: "Model Studio",
};

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
        label: l.description || ACTION_LABEL[l.action] || l.action.replace(/_/g, " "),
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
