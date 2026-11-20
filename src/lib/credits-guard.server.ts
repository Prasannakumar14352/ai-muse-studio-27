/**
 * Server-side credit charging helpers.
 *
 * These are the single authoritative place where AI-generation server
 * functions reserve and finalize credits, so we can't accidentally ship a
 * generation endpoint that skips billing.
 *
 * Usage:
 *   // Option A: middleware (preferred for whole-handler charging)
 *   createServerFn({ method: "POST" })
 *     .middleware([requireSupabaseAuth, chargeMiddleware("linkedin_generate", 1)])
 *     .handler(async ({ data, context }) => { ... });
 *
 *   // Option B: manual (when amount depends on validated input)
 *   const ch = await chargeCredits({ userId, action: "video_scenes", amount });
 *   try { const out = await work(); await ch.finalize(); return out; }
 *   catch (e) { await ch.refund(String(e)); throw e; }
 *
 * Insufficient-credit failures are surfaced as an Error whose message is
 * `insufficient_credits:{"required":N,"available":M,...}` so a client-side
 * function middleware can parse it and open the upgrade / top-up modal
 * without losing the user's current wizard state.
 */
import { createMiddleware } from "@tanstack/react-start";

export const ACTION_COSTS = {
  // Text / planning
  plan_content: 1,
  plan_regen_section: 1,
  research: 1,
  strategy: 1,
  agent_campaign: 2,
  publish_kit: 1,
  publish_kit_review: 1,
  ai_edit_text: 1,
  creative_director: 1,
  intent_detect: 0, // heuristic, no charge

  // LinkedIn
  linkedin_generate: 1,
  linkedin_regen_section: 1,
  linkedin_score: 0,
  linkedin_carousel: 1,
  linkedin_carousel_slide: 1,

  // Carousel (Instagram)
  carousel_plan: 1,

  // Video AI (plans; scene image renders billed separately at asset level)
  video_script: 1,
  video_scenes_plan: 1,
  video_seo: 1,
  video_title_variants: 1,
  video_hook: 1,
  video_chapters: 1,

  // Post-generation studio (voice audio itself is charged per call in /api/tts)
  narration: 0,
  final_export: 1,

  // Thumbnails
  thumbnail_plan: 1,
  thumbnail_analyze: 0,
  thumbnail_reverse: 1,

  // Promo video
  promo_plan: 1,
  promo_scene_regen: 1,

  // SEO package
  seo_package: 2,
  seo_regen: 1,

  // Repurpose
  repurpose: 1,

  // Image / assets — charged server-side in /api/generate-image
  // Provider cost: FLUX Schnell ~$0.003, Nano Banana (HD/edits) ~$0.04.
  // Cheapest credit sold is ~$0.0108, so these keep at least ~2x margin.
  image: 1,
  // Nano Banana bills ~$0.04/image on fal → 8 credits keeps ≥2× at the cheapest credit.
  image_hd: 8,
  // Voice — charged per started 100 characters in /api/tts
  // (ElevenLabs Turbo via fal: $0.05 per 1,000 chars = $0.005 per 100)
  tts_per_100_chars: 1,
  // Real-motion clips — amount computed per clip in motion-clips.ts
  // (fal image-to-video price × MARKUP / CREDIT_FLOOR_USD).
  motion_clip: 20,
} as const;

export type ChargeAction = keyof typeof ACTION_COSTS;

export type ChargeOptions = {
  userId: string;
  action: string;
  amount?: number;
  projectId?: string | null;
  /**
   * Video job this charge belongs to (stored in credit_ledger.render_job_id).
   * Not project_id: finalize_credits copies project_id into usage_history, whose
   * project_id references projects(id) — a job id there fails the FK and the row
   * is left "reserved" forever.
   */
  jobTag?: string | null;
  description?: string;
  idempotencyKey?: string;
};

export type Reservation = {
  ledgerId: string | null;
  source: string;
  finalize: () => Promise<void>;
  refund: (reason?: string) => Promise<void>;
};

function randomKey(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Reserve credits and return a handle that must be finalized or refunded. */
export async function chargeCredits(opts: ChargeOptions): Promise<Reservation> {
  const amount = Math.max(0, Math.floor(opts.amount ?? ACTION_COSTS[opts.action as ChargeAction] ?? 1));
  // Plan gate: actions that belong to a paid feature are refused before any credits move.
  const { assertActionAllowed } = await import("@/lib/plan-access.server");
  await assertActionAllowed(opts.userId, opts.action);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const idempotencyKey = opts.idempotencyKey ?? `${opts.userId}:${opts.action}:${randomKey()}`;

  const { data, error } = await supabaseAdmin.rpc("reserve_credits", {
    _user_id: opts.userId,
    _amount: amount,
    _action: opts.action,
    _project_id: (opts.projectId ?? null) as unknown as string,
    _idempotency_key: idempotencyKey,
    _description: (opts.description ?? opts.action).slice(0, 240),
  });
  if (error) {
    console.error("[chargeCredits] reserve rpc error", error);
    throw new Error(error.message);
  }
  const res = data as {
    ok: boolean; ledger_id?: string; source?: string;
    required?: number; available?: number; shortage?: number;
    monthly_remaining?: number; balance?: number; lifetime?: number;
    plan_type?: string; error?: string;
  };

  if (!res.ok) {
    if (res.error === "insufficient_credits") {
      const payload = {
        required: res.required ?? amount,
        available: res.available ?? 0,
        shortage: res.shortage ?? amount,
        monthly_remaining: res.monthly_remaining ?? 0,
        balance: res.balance ?? 0,
        lifetime: res.lifetime ?? 0,
        plan_type: res.plan_type ?? "free",
      };
      throw new Error(`insufficient_credits:${JSON.stringify(payload)}`);
    }
    throw new Error(res.error || "Could not reserve credits");
  }

  const ledgerId = res.ledger_id ?? null;
  if (ledgerId && opts.jobTag) {
    const { error: tagErr } = await supabaseAdmin
      .from("credit_ledger")
      .update({ render_job_id: opts.jobTag } as never)
      .eq("id", ledgerId);
    if (tagErr) console.warn("[chargeCredits] job tag failed", tagErr.message);
  }
  return {
    ledgerId,
    source: res.source ?? "balance",
    async finalize() {
      if (!ledgerId) return;
      const { error: e } = await supabaseAdmin.rpc("finalize_credits", { _ledger_id: ledgerId });
      if (e) console.warn("[chargeCredits] finalize failed", e.message);
    },
    async refund(reason?: string) {
      if (!ledgerId) return;
      const { error: e } = await supabaseAdmin.rpc("refund_credits_by_ledger", {
        _ledger_id: ledgerId,
        _reason: (reason ?? "generation_failed").slice(0, 240),
      });
      if (e) console.warn("[chargeCredits] refund failed", e.message);
    },
  };
}

/** Reserve → run work → finalize on success / refund on failure. */
export async function withCharge<T>(opts: ChargeOptions, work: () => Promise<T>): Promise<T> {
  const reservation = await chargeCredits(opts);
  try {
    const out = await work();
    await reservation.finalize();
    return out;
  } catch (err) {
    await reservation.refund(err instanceof Error ? err.message : "generation_failed");
    throw err;
  }
}

/**
 * Middleware factory: charges `amount` credits (default = ACTION_COSTS[action])
 * before the handler runs, then finalizes on success or refunds on error.
 * Must appear AFTER `requireSupabaseAuth` in the middleware chain.
 */
export function chargeMiddleware(action: string, amount?: number) {
  return createMiddleware({ type: "function" }).server(async ({ next, context }) => {
    const ctx = context as unknown as { userId?: string };
    if (!ctx.userId) {
      // Should not happen when placed after requireSupabaseAuth.
      throw new Error("chargeMiddleware requires requireSupabaseAuth first");
    }
    const reservation = await chargeCredits({
      userId: ctx.userId,
      action,
      amount,
      description: action,
    });
    try {
      const result = await next();
      await reservation.finalize();
      return result;
    } catch (err) {
      await reservation.refund(err instanceof Error ? err.message : "generation_failed");
      throw err;
    }
  });
}
