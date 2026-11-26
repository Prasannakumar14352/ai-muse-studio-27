/**
 * Shared generation-job service. Every AI module (SEO, image editing, video,
 * voiceover) writes into `generation_jobs` through these functions so that:
 *   - credit reservation happens exactly once per job (linked via ledger_id)
 *   - status/progress is polled from the DB, not fabricated in the UI
 *   - failures can be retried
 *   - admins can audit all runs from one table
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type JobStatus =
  | "queued"
  | "validating"
  | "processing"
  | "rendering"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled";

// JSON-serializable payload shape (matches Supabase `jsonb`).
// Must not use `unknown` — TanStack serialization rejects it at the RPC boundary.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type JsonPayload = { [k: string]: JsonValue };

export type GenerationJob = {
  id: string;
  user_id: string;
  project_id: string | null;
  module_type: string;
  job_type: string;
  status: JobStatus;
  progress: number;
  current_step: string | null;
  provider: string | null;
  provider_job_id: string | null;
  request_payload: JsonPayload;
  output_payload: JsonPayload;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  credits_reserved: number;
  credits_charged: number;
  ledger_id: string | null;
  idempotency_key: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
};

const createSchema = z.object({
  moduleType: z.string().min(1).max(64),
  jobType: z.string().min(1).max(64),
  projectId: z.string().uuid().nullable().optional(),
  requestPayload: z.any(),
  creditsEstimated: z.number().int().min(0).max(5000).default(0),
  provider: z.string().max(64).optional(),
  idempotencyKey: z.string().min(1).max(128),
});

function rowToJob(row: unknown): GenerationJob {
  return row as GenerationJob;
}

export const createGenerationJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => createSchema.parse(v))
  .handler(async ({ data, context }) => createGenerationJobAdmin(context.userId, data));

/**
 * Server-side job creation for use INSIDE other server functions. Calling
 * createGenerationJobFn from a server function fails in production builds
 * ("Server function info not found"), so server code must call this instead.
 */
export async function createGenerationJobAdmin(userId: string, data: z.infer<typeof createSchema>): Promise<{ job: GenerationJob; reused: boolean }> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("generation_jobs")
      .select("*")
      .eq("user_id", userId)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing) return { job: rowToJob(existing), reused: true } as { job: GenerationJob; reused: boolean };

    const insertRow = {
      user_id: userId,
      project_id: data.projectId ?? null,
      module_type: data.moduleType,
      job_type: data.jobType,
      status: "queued" as JobStatus,
      progress: 0,
      request_payload: data.requestPayload as never,
      provider: data.provider ?? null,
      credits_reserved: data.creditsEstimated,
      idempotency_key: data.idempotencyKey,
    };
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("generation_jobs")
      .insert(insertRow)
      .select("*")
      .single();
    if (insErr || !inserted) throw new Error(insErr?.message ?? "insert failed");

    if (data.creditsEstimated > 0) {
      const { data: res, error: rpcErr } = await supabaseAdmin.rpc("reserve_credits", {
        _user_id: userId,
        _amount: data.creditsEstimated,
        _action: `${data.moduleType}:${data.jobType}`,
        _project_id: (data.projectId ?? null) as unknown as string,
        _idempotency_key: `job:${inserted.id}`,
        _description: `${data.moduleType} · ${data.jobType}`,
      });
      if (rpcErr) {
        await supabaseAdmin.from("generation_jobs").update({
          status: "failed",
          error_code: "credit_reserve_error",
          error_message: rpcErr.message.slice(0, 400),
          failed_at: new Date().toISOString(),
        }).eq("id", inserted.id);
        throw new Error(rpcErr.message);
      }
      const r = (res ?? {}) as { ok?: boolean; ledger_id?: string; error?: string };
      if (!r.ok) {
        await supabaseAdmin.from("generation_jobs").update({
          status: "failed",
          error_code: r.error ?? "insufficient_credits",
          error_message: r.error ?? "insufficient_credits",
          failed_at: new Date().toISOString(),
        }).eq("id", inserted.id);
        const err = new Error(r.error ?? "insufficient_credits");
        (err as { code?: string; details?: unknown }).code = "insufficient_credits";
        (err as { code?: string; details?: unknown }).details = res;
        throw err;
      }
      if (r.ledger_id) {
        await supabaseAdmin
          .from("generation_jobs")
          .update({ ledger_id: r.ledger_id })
          .eq("id", inserted.id);
        await supabaseAdmin
          .from("credit_ledger")
          .update({ job_id: inserted.id })
          .eq("id", r.ledger_id);
      }
    }

    const { data: fresh } = await supabaseAdmin
      .from("generation_jobs").select("*").eq("id", inserted.id).single();
    return { job: rowToJob(fresh), reused: false } as { job: GenerationJob; reused: boolean };
}

export const getGenerationJobFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("generation_jobs").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return (row ? rowToJob(row) : null) as GenerationJob | null;
  });

export const listGenerationJobsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      moduleType: z.string().optional(),
      projectId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("generation_jobs").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.moduleType) q = q.eq("module_type", data.moduleType);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown[]).map(rowToJob) as GenerationJob[];
  });

export const cancelGenerationJobFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { cancelJobAndRefund } = await import("@/lib/credit-refund.server");
    type Db = import("@/lib/credit-refund.server").AdminDb;
    // Refunds only the server-linked, still-reserved ledger row of the caller's own job.
    const r = await cancelJobAndRefund(supabaseAdmin as unknown as Db, context.userId, data.id);
    return { ok: true, alreadyTerminal: r.alreadyTerminal };
  });

/**
 * Finalize a job that succeeded. Idempotent.
 */
export async function markJobCompleteAdmin(opts: {
  jobId: string;
  outputPayload: JsonPayload;
  provider?: string | null;
  providerJobId?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin.from("generation_jobs")
    .select("id, ledger_id, credits_reserved, status").eq("id", opts.jobId).maybeSingle();
  if (!row) return;
  if (row.status === "completed") return;
  await supabaseAdmin.from("generation_jobs").update({
    status: "completed",
    progress: 100,
    current_step: "done",
    output_payload: opts.outputPayload as never,
    provider: opts.provider ?? undefined,
    provider_job_id: opts.providerJobId ?? undefined,
    credits_charged: row.credits_reserved,
    completed_at: new Date().toISOString(),
  }).eq("id", opts.jobId);
  if (row.ledger_id) {
    try { await supabaseAdmin.rpc("finalize_credits", { _ledger_id: row.ledger_id }); }
    catch (e) { console.warn("finalize_credits", e); }
  }
}

export async function markJobFailedAdmin(opts: {
  jobId: string;
  code: string;
  message: string;
  refund?: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin.from("generation_jobs")
    .select("id, ledger_id, status").eq("id", opts.jobId).maybeSingle();
  if (!row || row.status === "completed" || row.status === "failed") return;
  await supabaseAdmin.from("generation_jobs").update({
    status: "failed",
    error_code: opts.code.slice(0, 64),
    error_message: opts.message.slice(0, 400),
    failed_at: new Date().toISOString(),
  }).eq("id", opts.jobId);
  if (opts.refund && row.ledger_id) {
    try { await supabaseAdmin.rpc("refund_credits_by_ledger", { _ledger_id: row.ledger_id, _reason: opts.code }); }
    catch (e) { console.warn("refund_credits_by_ledger", e); }
  }
}

export async function updateJobProgressAdmin(opts: {
  jobId: string;
  status?: JobStatus;
  progress?: number;
  currentStep?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const patch: {
    status?: JobStatus;
    progress?: number;
    current_step?: string;
    started_at?: string;
  } = {};
  if (opts.status) patch.status = opts.status;
  if (typeof opts.progress === "number") patch.progress = Math.max(0, Math.min(100, opts.progress));
  if (opts.currentStep) patch.current_step = opts.currentStep.slice(0, 120);
  if (opts.status === "processing") patch.started_at = new Date().toISOString();
  await supabaseAdmin.from("generation_jobs").update(patch).eq("id", opts.jobId);
}
