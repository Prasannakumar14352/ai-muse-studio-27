/**
 * Centralized credit-guard server functions. Every AI generation module
 * calls reserve → (work) → finalize | refund via `useCreditGuard`.
 *
 * The underlying RPCs are locked down to service_role only; these thin
 * wrappers use `requireSupabaseAuth` so the caller's userId is trusted
 * from the bearer token, never from client input.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReserveResult =
  | {
      ok: true;
      ledger_id: string;
      source: "subscription" | "balance" | "lifetime" | "admin";
      balance_before: number;
      balance_after: number;
      unlimited?: boolean;
      reused?: boolean;
      status?: string;
    }
  | {
      ok: false;
      error: "insufficient_credits" | "invalid_amount" | string;
      required?: number;
      available?: number;
      shortage?: number;
      monthly_remaining?: number;
      balance?: number;
      lifetime?: number;
      plan_type?: string;
    };

export type CreditSummary = {
  unlimited: boolean;
  plan_type: string;
  monthly_remaining: number;
  balance: number;
  lifetime: number;
  available: number;
  can_buy_topups: boolean;
};

const MAX_AMOUNT = 5000;

export const reserveCreditsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    amount: number;
    action: string;
    projectId?: string | null;
    idempotencyKey: string;
    description?: string;
  }) => {
    if (!input || typeof input.amount !== "number" || input.amount < 0 || input.amount > MAX_AMOUNT) {
      throw new Error("invalid amount");
    }
    if (!input.action || typeof input.action !== "string" || input.action.length > 64) {
      throw new Error("invalid action");
    }
    if (!input.idempotencyKey || typeof input.idempotencyKey !== "string" || input.idempotencyKey.length > 128) {
      throw new Error("invalid idempotencyKey");
    }
    return {
      amount: Math.floor(input.amount),
      action: input.action,
      projectId: input.projectId ?? null,
      idempotencyKey: input.idempotencyKey,
      description: (input.description ?? "").slice(0, 240),
    };
  })
  .handler(async ({ data, context }): Promise<ReserveResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("reserve_credits", {
      _user_id: context.userId,
      _amount: data.amount,
      _action: data.action,
      _project_id: (data.projectId ?? null) as unknown as string,
      _idempotency_key: data.idempotencyKey,
      _description: data.description,
    });
    if (error) {
      console.error("[reserve_credits] rpc error", error);
      throw new Error(error.message);
    }
    return result as ReserveResult;
  });

export const finalizeCreditsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ledgerId: string }) => {
    if (!input?.ledgerId || typeof input.ledgerId !== "string") throw new Error("ledgerId required");
    return { ledgerId: input.ledgerId };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify ownership before finalizing
    const { data: row, error: rowErr } = await supabaseAdmin
      .from("credit_ledger").select("user_id").eq("id", data.ledgerId).maybeSingle();
    if (rowErr || !row || row.user_id !== context.userId) {
      throw new Error("forbidden");
    }
    const { data: result, error } = await supabaseAdmin.rpc("finalize_credits", {
      _ledger_id: data.ledgerId,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean };
  });

export const refundLedgerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ledgerId: string; reason?: string }) => {
    if (!input?.ledgerId) throw new Error("ledgerId required");
    return { ledgerId: input.ledgerId, reason: (input.reason ?? "generation_failed").slice(0, 240) };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("credit_ledger").select("user_id").eq("id", data.ledgerId).maybeSingle();
    if (!row || row.user_id !== context.userId) throw new Error("forbidden");
    const { data: result, error } = await supabaseAdmin.rpc("refund_credits_by_ledger", {
      _ledger_id: data.ledgerId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return result as { ok: boolean; refunded?: number };
  });

export const getCreditSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreditSummary> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("get_credit_summary", {
      _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return data as CreditSummary;
  });
