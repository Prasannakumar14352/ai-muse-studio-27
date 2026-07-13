import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-only credit refund. Called when a generation partially succeeds
 * and the client needs to reverse a `deduct_credits` charge.
 *
 * The RPC is restricted to service_role — callers cannot invoke it directly.
 * This wrapper validates the authenticated user matches the target user and
 * then invokes the admin RPC to perform the refund.
 */
export const refundCreditsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    amount: number;
    projectId?: string | null;
    description: string;
    source: "subscription" | "balance" | "admin";
  }) => {
    if (!input || typeof input.amount !== "number" || input.amount <= 0) {
      throw new Error("amount must be a positive number");
    }
    if (input.amount > 10_000) throw new Error("amount too large");
    if (typeof input.description !== "string" || !input.description.trim()) {
      throw new Error("description required");
    }
    return {
      amount: Math.floor(input.amount),
      projectId: input.projectId ?? null,
      description: input.description.slice(0, 240),
      source: input.source,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("refund_credits", {
      _user_id: context.userId,
      _amount: data.amount,
      _project_id: data.projectId,
      _description: data.description,
      _source: data.source,
    });
    if (error) {
      console.error("[refund_credits] rpc error", error);
      throw new Error(error.message);
    }
    return result as { ok: boolean; source?: string; refunded?: number; error?: string };
  });
