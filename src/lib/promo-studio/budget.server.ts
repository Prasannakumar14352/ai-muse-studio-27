/**
 * Promo Studio company spend: reserve → call provider → settle. Server-only.
 *
 * withSpend() is the ONLY way Promo code reaches a paid provider:
 *  1. Reserve: promo_reserve_spend (one advisory lock; kill switch, admin role, per-call cap,
 *     rate limits, monthly cap; inserts a 'pending' cost-log row at the estimate).
 *  2. Call the provider (only if the reservation succeeded).
 *  3. Settle exactly once (promo_settle_spend), success or failure. A settle failure is logged and
 *     the row stays pending, which keeps counting at its estimate (conservative).
 * A retry is a new withSpend call, so every attempt has its own cost-log row.
 *
 * This is company money, never user credits: nothing here touches the user credit tables.
 */
import type { PromoProvider, PromoSpendStep, PromoUnitType } from "./constants";
import { isPricedModel, PROMO_PRICES } from "./prices.server";

/** The slice of the service-role client withSpend needs (the RPCs aren't in the generated types yet). */
export type BudgetDb = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function serviceDb(): Promise<BudgetDb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The promo_* RPCs aren't in the generated Database types until types.ts is regenerated.
  return supabaseAdmin as unknown as BudgetDb;
}

export type SpendMeta = {
  adminId: string;
  step: PromoSpendStep;
  provider: PromoProvider;
  model: string;
  batchId: string | null;
  creativeId?: string | null;
  units?: number | null;
  unitType: PromoUnitType | null;
};

export type SpendCallResult<T> = {
  value: T;
  /** Exact provider cost if known (OpenRouter usage.cost); null = settle at the estimate. */
  actualUsd: number | null;
  units?: number | null;
  requestId?: string | null;
  creativeId?: string | null;
};

/**
 * Throw this from the provider call when the provider billed the request but the result is
 * unusable (e.g. invalid JSON), so the real cost is still recorded on the failed row.
 */
export class SpendCallError extends Error {
  readonly actualUsd: number | null;
  readonly units: number | null;
  readonly requestId: string | null;
  constructor(
    message: string,
    opts: { actualUsd?: number | null; units?: number | null; requestId?: string | null } = {},
  ) {
    super(message);
    this.name = "SpendCallError";
    this.actualUsd = opts.actualUsd ?? null;
    this.units = opts.units ?? null;
    this.requestId = opts.requestId ?? null;
  }
}

export type SpendRefusalCode =
  "budget" | "rate" | "disabled" | "forbidden" | "per_request" | "invalid";

export type SpendResult<T> =
  | { ok: true; value: T; alert: boolean; logId: string }
  | { ok: false; code: SpendRefusalCode | "provider"; message: string; error?: unknown };

type ReserveResponse = {
  ok?: boolean;
  id?: string;
  code?: string;
  cap?: number | string;
  spent?: number | string;
  est?: number | string;
  retry_after_s?: number;
  alert?: boolean;
};

function usd(v: number | string | undefined | null): string {
  const n = Number(v ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

/** User-facing message for each refusal (design I4 / I5 / I6). */
export function refusalMessage(r: ReserveResponse): { code: SpendRefusalCode; message: string } {
  switch (r.code) {
    case "budget":
      return {
        code: "budget",
        message: `Monthly Promo Studio budget reached (${usd(r.cap)}). Raise it in Brand Kit → Budget.`,
      };
    case "rate": {
      const mins = Math.max(1, Math.ceil(Number(r.retry_after_s ?? 60) / 60));
      return {
        code: "rate",
        message: `Slow down. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      };
    }
    case "per_request":
      return {
        code: "per_request",
        message: `This request is estimated at ${usd(r.est)}, over the ${usd(r.cap)} per-request limit.`,
      };
    case "disabled":
      return { code: "disabled", message: "Promo Studio is turned off." };
    case "forbidden":
      return { code: "forbidden", message: "Forbidden: admin only" };
    default:
      return { code: "invalid", message: "This request can't be priced. Try again." };
  }
}

/**
 * Whole-request check before any provider call (I5): the summed estimate of every call a
 * Generate click can make must fit under the per-request cap. No row is written when it fails.
 */
export function checkPerRequestCap(
  estUsd: number,
  settings: { per_request_cap_usd: number | string },
): { ok: true } | { ok: false; code: "per_request"; message: string; estUsd: number } {
  const cap = Number(settings.per_request_cap_usd);
  if (!Number.isFinite(estUsd) || !(estUsd <= cap)) {
    const { message } = refusalMessage({ code: "per_request", est: estUsd, cap });
    return { ok: false, code: "per_request", message, estUsd };
  }
  return { ok: true };
}

export async function withSpend<T>(
  meta: SpendMeta,
  estUsd: number,
  call: () => Promise<SpendCallResult<T>>,
  opts: { db?: BudgetDb } = {},
): Promise<SpendResult<T>> {
  // Only priced models from the code table can be reserved: the DB can't enable another model.
  if (!isPricedModel(meta.model) || PROMO_PRICES[meta.model].provider !== meta.provider) {
    throw new Error(`Promo Studio: model ${meta.model} is not allowed`);
  }
  if (!Number.isFinite(estUsd) || estUsd < 0) throw new Error("Promo Studio: invalid estimate");

  const db = opts.db ?? (await serviceDb());
  const { data, error } = await db.rpc("promo_reserve_spend", {
    _admin: meta.adminId,
    _step: meta.step,
    _provider: meta.provider,
    _model: meta.model,
    _est: estUsd,
    _batch: meta.batchId,
    _creative: meta.creativeId ?? null,
    _units: meta.units ?? null,
    _unit_type: meta.unitType,
  });
  if (error) throw new Error("Couldn't check the Promo Studio budget. Try again.");
  const r = (data ?? {}) as ReserveResponse;
  if (r.ok !== true || typeof r.id !== "string") {
    return { ok: false, ...refusalMessage(r) };
  }
  const logId = r.id;

  let settle: {
    ok: boolean;
    actual: number | null;
    units: number | null;
    error: string | null;
    requestId: string | null;
    creative: string | null;
  };
  let result: SpendResult<T>;
  try {
    const out = await call();
    settle = {
      ok: true,
      actual: out.actualUsd,
      units: out.units ?? null,
      error: null,
      requestId: out.requestId ?? null,
      creative: out.creativeId ?? null,
    };
    result = { ok: true, value: out.value, alert: r.alert === true, logId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ce = e instanceof SpendCallError ? e : null;
    settle = {
      ok: false,
      actual: ce?.actualUsd ?? null,
      units: ce?.units ?? null,
      error: msg,
      requestId: ce?.requestId ?? null,
      creative: null,
    };
    result = { ok: false, code: "provider", message: msg.slice(0, 300), error: e };
  }

  try {
    const { error: settleErr } = await db.rpc("promo_settle_spend", {
      _id: logId,
      _ok: settle.ok,
      _actual: settle.actual,
      _units: settle.units,
      _error: settle.error,
      _request_id: settle.requestId,
      _creative: settle.creative,
    });
    if (settleErr)
      console.error("[promo-studio] settle failed; row stays pending", logId, settleErr.message);
  } catch (e) {
    console.error(
      "[promo-studio] settle failed; row stays pending",
      logId,
      e instanceof Error ? e.message : e,
    );
  }
  return result;
}

/** Claim the once-a-month 80% alert. True for exactly one caller per month. */
export async function claimCapAlert(opts: { db?: BudgetDb } = {}): Promise<boolean> {
  const db = opts.db ?? (await serviceDb());
  const { data, error } = await db.rpc("promo_claim_cap_alert", {});
  if (error) return false;
  return data === true;
}
