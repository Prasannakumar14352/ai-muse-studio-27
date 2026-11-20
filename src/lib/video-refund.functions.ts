// Refund a video job's generation credits when its final render fails validation.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const refundVideoJobCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid(), reason: z.string().max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only this user's charges that were tagged with this job, from the last day.
    const { data: rows, error } = await supabaseAdmin
      .from("credit_ledger")
      .select("id, credits_reserved, status")
      .eq("user_id", context.userId)
      .eq("project_id", data.jobId)
      .in("status", ["charged", "reserved"])
      .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString())
      .limit(500);
    if (error) throw new Error(error.message);
    let refunded = 0;
    for (const r of (rows ?? []) as Array<{ id: string; credits_reserved: number }>) {
      const { data: res, error: e } = await supabaseAdmin.rpc("refund_credits_by_ledger", {
        _ledger_id: r.id,
        _reason: (data.reason ?? "render_failed_validation").slice(0, 240),
      });
      const out = res as { ok?: boolean; refunded?: number } | null;
      if (!e && out?.ok) refunded += out.refunded ?? 0;
    }
    return { refunded, rows: rows?.length ?? 0 };
  });
