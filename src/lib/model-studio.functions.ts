// Model Studio server functions: run third-party models (Seedance, FLUX,
// ElevenLabs…) with server-side credit billing.
//
// Billing flow (never trusts the browser):
//   start → price computed here from the catalog → reserve credits → submit to fal
//   poll  → when the job ends, finalize (success) or refund (failure) exactly once
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { creditsFor, findModel } from "@/lib/model-catalog";

export type ModelGeneration = {
  id: string;
  model_id: string;
  kind: "video" | "image" | "audio";
  prompt: string;
  params: { durationSec?: number; aspectRatio?: string; voice?: string };
  credits: number;
  status: "queued" | "completed" | "failed";
  output_url: string | null;
  error: string | null;
  created_at: string;
};

const PUBLIC_COLS =
  "id, model_id, kind, prompt, params, credits, status, output_url, error, created_at";
/** Jobs still unfinished after this long are failed and refunded. */
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

// model_generations is not in the generated Supabase types yet (regenerate
// types after running the migration), so access it through a loose handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function table(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabaseAdmin as any).from("model_generations");
}

export const getModelStudioStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { isFalConfigured } = await import("@/lib/fal.server");
    return { configured: isFalConfigured() };
  });

const StartInput = z.object({
  modelId: z.string().min(1).max(64),
  prompt: z.string().trim().min(2).max(2500),
  durationSec: z.number().int().optional(),
  aspectRatio: z.string().max(8).optional(),
  voice: z.string().max(40).optional(),
});

export const startModelGenerationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => StartInput.parse(v))
  .handler(async ({ data, context }) => {
    const model = findModel(data.modelId);
    if (!model) throw new Error("Unknown model");
    const { assertFeature } = await import("@/lib/plan-access.server");
    await assertFeature(context.userId, `model:${model.id}`);

    // Validate options against what the model supports.
    const durationSec =
      model.kind === "video" ? (data.durationSec ?? model.durations?.[0] ?? 5) : undefined;
    if (model.kind === "video" && !model.durations?.includes(durationSec!))
      throw new Error("Unsupported duration");
    const aspectRatio = model.aspectRatios
      ? (data.aspectRatio ?? model.aspectRatios[0])
      : undefined;
    if (model.aspectRatios && !model.aspectRatios.includes(aspectRatio!))
      throw new Error("Unsupported aspect ratio");
    const voice = model.voices ? (data.voice ?? model.voices[0]) : undefined;
    if (model.voices && !model.voices.includes(voice!)) throw new Error("Unsupported voice");
    if (model.kind !== "audio" && data.prompt.length > 2000)
      throw new Error("Prompt is too long (max 2000 characters)");
    if (model.maxChars && data.prompt.length > model.maxChars)
      throw new Error(`Text is too long (max ${model.maxChars} characters)`);

    const priceParams = { durationSec, aspectRatio, textLength: data.prompt.length, numImages: 1 };
    const credits = creditsFor(model, priceParams);
    const providerCostUsd = model.costUsd(priceParams);

    const { isFalConfigured, buildFalInput, falSubmit } = await import("@/lib/fal.server");
    if (!isFalConfigured())
      throw new Error("Model Studio is not configured yet (missing FAL_KEY).");

    const { chargeCredits } = await import("@/lib/credits-guard.server");
    const reservation = await chargeCredits({
      userId: context.userId,
      action: `model_${model.kind}`,
      amount: credits,
      description: `${model.label}`,
    });

    let job: Awaited<ReturnType<typeof falSubmit>>;
    try {
      job = await falSubmit(
        model.endpoint,
        buildFalInput(model, { prompt: data.prompt, durationSec, aspectRatio, voice }),
      );
    } catch (e) {
      await reservation.refund(e instanceof Error ? e.message : "submit_failed");
      throw e;
    }

    const t = await table();
    const { data: row, error } = await t
      .insert({
        user_id: context.userId,
        model_id: model.id,
        kind: model.kind,
        prompt: data.prompt,
        params: { durationSec, aspectRatio, voice },
        credits,
        provider_cost_usd: Number(providerCostUsd.toFixed(4)),
        ledger_id: reservation.ledgerId,
        provider_request_id: job.requestId,
        status_url: job.statusUrl,
        response_url: job.responseUrl,
        status: "queued",
      })
      .select(PUBLIC_COLS)
      .single();
    if (error) {
      // We couldn't record the job, so the user would never see the result — don't charge them.
      await reservation.refund("tracking_insert_failed");
      throw new Error(error.message);
    }
    return row as ModelGeneration;
  });

/** Move a queued row to a terminal state exactly once; returns true if this call won. */
async function settle(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const t = await table();
  const { data } = await t.update(patch).eq("id", id).eq("status", "queued").select("id");
  return Array.isArray(data) && data.length > 0;
}

export const pollModelGenerationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const t = await table();
    const { data: row, error } = await t
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    const pick = (r: Record<string, unknown>) =>
      Object.fromEntries(PUBLIC_COLS.split(", ").map((k) => [k, r[k]])) as ModelGeneration;
    if (row.status !== "queued") return pick(row);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const refund = async (reason: string) => {
      if (row.ledger_id) {
        await supabaseAdmin.rpc("refund_credits_by_ledger", {
          _ledger_id: row.ledger_id,
          _reason: reason.slice(0, 240),
        });
      }
    };

    const model = findModel(row.model_id);
    const timedOut = Date.now() - new Date(row.created_at).getTime() > JOB_TIMEOUT_MS;

    const { falPoll } = await import("@/lib/fal.server");
    const result = model
      ? await falPoll(row.status_url, row.response_url, model.kind)
      : ({ state: "failed", error: "Model removed from catalog" } as const);

    if (result.state === "completed") {
      if (await settle(row.id, { status: "completed", output_url: result.outputUrl })) {
        if (row.ledger_id)
          await supabaseAdmin.rpc("finalize_credits", { _ledger_id: row.ledger_id });
      }
      return pick({ ...row, status: "completed", output_url: result.outputUrl });
    }
    if (result.state === "failed" || timedOut) {
      const message =
        result.state === "failed" ? result.error : "Timed out waiting for the provider";
      if (await settle(row.id, { status: "failed", error: message })) await refund(message);
      return pick({ ...row, status: "failed", error: message });
    }
    return pick(row);
  });

export const listModelGenerationsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t = await table();
    const { data, error } = await t
      .select(PUBLIC_COLS)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return (data ?? []) as ModelGeneration[];
  });
