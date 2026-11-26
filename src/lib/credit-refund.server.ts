/**
 * Refund rules for client-reachable refund paths (audit 2026-11-26, C4).
 *
 * - Only an open reservation (credit_ledger.status = 'reserved') is refundable.
 *   A 'charged' row is a generation that succeeded; it is never refunded.
 * - A browser-called refund (refundLedgerFn) may only touch reservations the
 *   browser itself opened through reserveCreditsFn (idempotency key prefixed
 *   with CLIENT_RESERVATION_PREFIX). Reservations the server opened itself
 *   (images, voice, motion clips, Model Studio, generation jobs) are refunded
 *   by the server when the provider fails; letting the browser refund them
 *   while the provider is still running would make the result free.
 * - Ownership always comes from the verified session, never from input.
 */

export const CLIENT_RESERVATION_PREFIX = "client:";

export type RefundResult = { ok: boolean; refunded?: number; error?: string; reused?: boolean };

// Minimal structural view of the service-role client, so tests can pass a fake.
type QueryResult = { data: unknown; error: { message: string } | null };
type SelectChain = {
  eq: (col: string, val: unknown) => SelectChain;
  maybeSingle: () => PromiseLike<QueryResult>;
};
type UpdateChain = {
  eq: (col: string, val: unknown) => UpdateChain & PromiseLike<QueryResult>;
} & PromiseLike<QueryResult>;
export type AdminDb = {
  from: (table: string) => {
    select: (cols: string) => SelectChain;
    update: (patch: Record<string, unknown>) => UpdateChain;
  };
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<QueryResult>;
};

type LedgerRow = { user_id: string; status: string; idempotency_key: string | null; job_id?: string | null };

async function refundLedgerRpc(db: AdminDb, ledgerId: string, reason: string): Promise<RefundResult> {
  const { data, error } = await db.rpc("refund_credits_by_ledger", {
    _ledger_id: ledgerId,
    _reason: reason.slice(0, 240),
  });
  if (error) throw new Error(error.message);
  return (data ?? { ok: false, error: "no_result" }) as RefundResult;
}

/** Browser-requested refund of the caller's own, still-open, browser-opened reservation. */
export async function refundClientReservation(
  db: AdminDb,
  userId: string,
  ledgerId: string,
  reason: string,
): Promise<RefundResult> {
  const { data } = await db
    .from("credit_ledger")
    .select("user_id, status, idempotency_key")
    .eq("id", ledgerId)
    .maybeSingle();
  const row = data as LedgerRow | null;
  if (!row || row.user_id !== userId) throw new Error("forbidden");
  if (row.status !== "reserved") return { ok: false, error: "not_refundable" };
  if (!(row.idempotency_key ?? "").startsWith(CLIENT_RESERVATION_PREFIX)) {
    return { ok: false, error: "not_refundable" };
  }
  return refundLedgerRpc(db, ledgerId, reason);
}

/**
 * Cancel the caller's generation job. Refunds only the ledger row the server
 * linked to this job (credit_ledger.job_id = job.id), owned by the caller and
 * still 'reserved'.
 */
export async function cancelJobAndRefund(
  db: AdminDb,
  userId: string,
  jobId: string,
): Promise<{ ok: true; alreadyTerminal: boolean; refund?: RefundResult }> {
  const { data } = await db
    .from("generation_jobs")
    .select("id, user_id, status, ledger_id")
    .eq("id", jobId)
    .maybeSingle();
  const job = data as { id: string; user_id: string; status: string; ledger_id: string | null } | null;
  if (!job || job.user_id !== userId) throw new Error("forbidden");
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return { ok: true, alreadyTerminal: true };
  }
  await db.from("generation_jobs").update({
    status: "cancelled",
    failed_at: new Date().toISOString(),
    error_code: "cancelled_by_user",
  }).eq("id", jobId);

  if (!job.ledger_id) return { ok: true, alreadyTerminal: false };

  const { data: l } = await db
    .from("credit_ledger")
    .select("user_id, status, idempotency_key, job_id")
    .eq("id", job.ledger_id)
    .maybeSingle();
  const ledger = l as LedgerRow | null;
  if (!ledger || ledger.user_id !== userId || ledger.job_id !== job.id || ledger.status !== "reserved") {
    return { ok: true, alreadyTerminal: false, refund: { ok: false, error: "not_refundable" } };
  }
  try {
    const refund = await refundLedgerRpc(db, job.ledger_id, "user_cancelled");
    return { ok: true, alreadyTerminal: false, refund };
  } catch (e) {
    console.warn("[cancel] refund failed", e);
    return { ok: true, alreadyTerminal: false, refund: { ok: false, error: "refund_failed" } };
  }
}
