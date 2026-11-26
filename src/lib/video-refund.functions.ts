// Settle a video job's generation credits when the video completes.
//
// There is deliberately no client-callable "refund this video job" function
// (removed 2026-11-26, audit C4). The job id is chosen by the browser and sent
// in the x-cf-job header, so it cannot authorise a refund. Every charge tagged
// with a job is opened by the server (images, voice, motion clips) and the
// server already refunds it while it is still 'reserved' when the provider
// fails. Finalized ('charged') assets are not refunded when the final
// in-browser render fails.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * The video finished: mark every still-"reserved" charge of this job as charged.
 * Covers motion clips whose status poll never reached the server (tab closed,
 * network drop) — otherwise those stay "In progress" in Credit history.
 */
export const settleVideoJobCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("credit_ledger")
      .select("id")
      .eq("user_id", context.userId)
      .eq("render_job_id", data.jobId)
      .eq("status", "reserved")
      .limit(500);
    if (error) throw new Error(error.message);
    let settled = 0;
    for (const r of (rows ?? []) as Array<{ id: string }>) {
      const { error: e } = await supabaseAdmin.rpc("finalize_credits", { _ledger_id: r.id });
      if (!e) settled += 1;
    }
    return { settled };
  });
