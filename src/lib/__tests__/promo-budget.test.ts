// Promo Studio company-spend logic (design §5, I1–I7) with the RPCs mocked.
// fakeBudgetDb mirrors promo_reserve_spend / promo_settle_spend from
// supabase/migrations/20261127090000_promo_studio.sql; the SQL itself is covered by
// supabase/tests/promo_studio.sql.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  withSpend,
  checkPerRequestCap,
  claimCapAlert,
  refusalMessage,
  SpendCallError,
  type BudgetDb,
  type SpendMeta,
} from "@/lib/promo-studio/budget.server";
import {
  estimateCopyUsd,
  estimateBackgroundUsd,
  estimateRequestUsd,
  BG_SIZE_PX,
  PROMO_COPY_MODEL,
  PROMO_BG_MODEL,
} from "@/lib/promo-studio/prices.server";

type Row = {
  id: string;
  admin_id: string;
  est_usd: number;
  actual_usd: number | null;
  state: "pending" | "settled";
  ok: boolean | null;
  error: string | null;
  created_at: number;
  creative_id: string | null;
  provider_request_id: string | null;
};

type Settings = {
  enabled: boolean;
  monthly_cap_usd: number;
  per_request_cap_usd: number;
  rate_10m: number;
  rate_24h: number;
  cap_alerted: boolean;
};

const ADMIN = "11111111-1111-4111-8111-111111111111";

function fakeBudgetDb(over: Partial<Settings> = {}, admins = new Set([ADMIN])) {
  const s: Settings = {
    enabled: true,
    monthly_cap_usd: 10,
    per_request_cap_usd: 1,
    rate_10m: 40,
    rate_24h: 300,
    cap_alerted: false,
    ...over,
  };
  const rows: Row[] = [];
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  let now = Date.UTC(2026, 10, 26, 12, 0, 0);
  let seq = 0;
  let settleError: { message: string } | null = null;

  const reserve = (a: Record<string, unknown>) => {
    if (!s.enabled) return { ok: false, code: "disabled" };
    if (!admins.has(a._admin as string)) return { ok: false, code: "forbidden" };
    const est = Number(a._est);
    if (est > s.per_request_cap_usd) return { ok: false, code: "per_request", cap: s.per_request_cap_usd, est };
    const mine = rows.filter((r) => r.admin_id === a._admin && r.created_at > now - 24 * 3600_000);
    const in10 = mine.filter((r) => r.created_at > now - 10 * 60_000);
    if (in10.length >= s.rate_10m) {
      const oldest = Math.min(...in10.map((r) => r.created_at));
      return { ok: false, code: "rate", retry_after_s: Math.max(60, Math.round((oldest + 600_000 - now) / 1000)) };
    }
    if (mine.length >= s.rate_24h) return { ok: false, code: "rate", retry_after_s: 3600 };
    const spent = rows.reduce((t, r) => t + (r.actual_usd ?? r.est_usd), 0);
    if (spent + est > s.monthly_cap_usd) return { ok: false, code: "budget", cap: s.monthly_cap_usd, spent };
    const id = `log-${++seq}`;
    rows.push({
      id,
      admin_id: a._admin as string,
      est_usd: est,
      actual_usd: null,
      state: "pending",
      ok: null,
      error: null,
      created_at: now,
      creative_id: (a._creative as string | null) ?? null,
      provider_request_id: null,
    });
    return {
      ok: true,
      id,
      spent_after: spent + est,
      cap: s.monthly_cap_usd,
      alert: spent + est >= 0.8 * s.monthly_cap_usd && !s.cap_alerted,
    };
  };

  const db: BudgetDb = {
    rpc(fn, args) {
      calls.push({ fn, args });
      if (fn === "promo_reserve_spend") return Promise.resolve({ data: reserve(args), error: null });
      if (fn === "promo_settle_spend") {
        if (settleError) return Promise.resolve({ data: null, error: settleError });
        const r = rows.find((x) => x.id === args._id && x.state === "pending"); // WHERE state = 'pending'
        if (r) {
          Object.assign(r, {
            state: "settled",
            ok: args._ok,
            actual_usd: args._actual,
            error: args._error,
            provider_request_id: args._request_id,
            creative_id: r.creative_id ?? args._creative,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }
      if (fn === "promo_claim_cap_alert") {
        const won = !s.cap_alerted;
        s.cap_alerted = true;
        return Promise.resolve({ data: won ? true : null, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    },
  };
  return {
    db,
    rows,
    calls,
    settings: s,
    advance(ms: number) {
      now += ms;
    },
    failSettle(e: { message: string } | null) {
      settleError = e;
    },
    count: (fn: string) => calls.filter((c) => c.fn === fn).length,
  };
}

const copyMeta = (over: Partial<SpendMeta> = {}): SpendMeta => ({
  adminId: ADMIN,
  step: "copy",
  provider: "openrouter",
  model: PROMO_COPY_MODEL,
  batchId: "22222222-2222-4222-8222-222222222222",
  unitType: "input_tokens+output_tokens",
  ...over,
});

const okCall = (actualUsd: number | null = 0.001) =>
  vi.fn(async () => ({ value: "copy-json", actualUsd, units: 1234, requestId: "gen-1" }));

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
});

describe("estimates (prices.server)", () => {
  it("copy is bounded by max_tokens: ≈ $0.0069 worst case", () => {
    expect(estimateCopyUsd()).toBeCloseTo(0.0069, 6);
    expect(estimateCopyUsd({ inputChars: 3500 })).toBeCloseTo((1000 * 0.3 + 1800 * 2.5) / 1e6, 6);
  });
  it("flux/schnell backgrounds stay ≤ 1 MP and cost $0.003", () => {
    for (const size of ["4:5", "1:1", "9:16"] as const) {
      const { width, height } = BG_SIZE_PX[size];
      expect(width * height).toBeLessThanOrEqual(1_000_000);
      expect(estimateBackgroundUsd({ width, height })).toBe(0.003);
    }
  });
  it("request = one copy call + one background per variant", () => {
    expect(estimateRequestUsd({ size: "4:5", variants: 4, aiBackground: true })).toBeCloseTo(0.0069 + 4 * 0.003, 6);
    expect(estimateRequestUsd({ size: "4:5", variants: 4, aiBackground: false })).toBeCloseTo(0.0069, 6);
  });
});

describe("per-request cap (I5)", () => {
  it("refuses a request whose estimate is over the cap, with the estimate in the message", () => {
    const est = estimateRequestUsd({ size: "1:1", variants: 4, aiBackground: true });
    const r = checkPerRequestCap(est, { per_request_cap_usd: 0.001 });
    expect(r).toEqual({
      ok: false,
      code: "per_request",
      estUsd: est,
      message: "This request is estimated at $0.02, over the $0.00 per-request limit.",
    });
    expect(checkPerRequestCap(est, { per_request_cap_usd: "1.00" })).toEqual({ ok: true });
    expect(checkPerRequestCap(Number.NaN, { per_request_cap_usd: 1 }).ok).toBe(false);
  });

  it("the reservation RPC also refuses a single call over the per-request cap; no provider call, no row", async () => {
    const f = fakeBudgetDb({ per_request_cap_usd: 0.005 });
    const call = okCall();
    const r = await withSpend(copyMeta(), 0.0069, call, { db: f.db });
    expect(r).toMatchObject({ ok: false, code: "per_request" });
    expect(call).not.toHaveBeenCalled();
    expect(f.rows).toHaveLength(0);
    expect(f.count("promo_settle_spend")).toBe(0);
  });
});

describe("monthly cap (I4)", () => {
  it("reserve fails once the month total would pass the cap; the provider is never called", async () => {
    const f = fakeBudgetDb({ monthly_cap_usd: 0.01 });
    const first = await withSpend(copyMeta(), 0.0069, okCall(null), { db: f.db });
    expect(first.ok).toBe(true);

    const call = okCall();
    const second = await withSpend(copyMeta(), 0.0069, call, { db: f.db });
    expect(second).toEqual({
      ok: false,
      code: "budget",
      message: "Monthly Promo Studio budget reached ($0.01). Raise it in Brand Kit → Budget.",
    });
    expect(call).not.toHaveBeenCalled();
    expect(f.rows).toHaveLength(1);
  });

  it("pending reservations count at their estimate, so a concurrent caller is refused (cap = 2 × est − ε)", async () => {
    const est = 0.003;
    const f = fakeBudgetDb({ monthly_cap_usd: 2 * est - 0.000001 });
    let release!: () => void;
    const slow = vi.fn(
      () =>
        new Promise<{ value: string; actualUsd: null }>((res) => {
          release = () => res({ value: "bg", actualUsd: null });
        }),
    );
    const meta = copyMeta({ step: "background", provider: "fal", model: PROMO_BG_MODEL, unitType: "megapixels" });
    const p1 = withSpend(meta, est, slow, { db: f.db }); // reserved, provider still running
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    const call2 = okCall();
    const r2 = await withSpend(meta, est, call2, { db: f.db });
    release();
    const r1 = await p1;
    expect(r1.ok).toBe(true);
    expect(r2).toMatchObject({ ok: false, code: "budget" });
    expect(call2).not.toHaveBeenCalled();
  });

  it("settled rows count at their actual cost", async () => {
    const f = fakeBudgetDb({ monthly_cap_usd: 0.01 });
    await withSpend(copyMeta(), 0.0069, okCall(0.001), { db: f.db }); // actual 0.001
    const r = await withSpend(copyMeta(), 0.0069, okCall(0.001), { db: f.db }); // 0.001 + 0.0069 ≤ 0.01
    expect(r.ok).toBe(true);
  });

  it("passes the 80% alert flag through, and the alert can be claimed exactly once", async () => {
    const f = fakeBudgetDb({ monthly_cap_usd: 0.01 });
    const r = await withSpend(copyMeta(), 0.0085, okCall(null), { db: f.db });
    expect(r).toMatchObject({ ok: true, alert: true });
    expect(await claimCapAlert({ db: f.db })).toBe(true);
    expect(await claimCapAlert({ db: f.db })).toBe(false);
  });
});

describe("rate limit (I6)", () => {
  it("the 41st call in 10 minutes is refused with a retry hint and no provider call", async () => {
    const f = fakeBudgetDb();
    for (let i = 0; i < 40; i++) {
      const r = await withSpend(copyMeta(), 0.0001, okCall(0.0001), { db: f.db });
      expect(r.ok).toBe(true);
      f.advance(1000);
    }
    const call = okCall();
    const r = await withSpend(copyMeta(), 0.0001, call, { db: f.db });
    expect(r).toEqual({ ok: false, code: "rate", message: "Slow down. Try again in 10 minutes." });
    expect(call).not.toHaveBeenCalled();
    expect(f.rows).toHaveLength(40);

    f.advance(10 * 60_000);
    expect((await withSpend(copyMeta(), 0.0001, okCall(), { db: f.db })).ok).toBe(true);
  });

  it("the daily limit trips too", async () => {
    const f = fakeBudgetDb({ rate_10m: 500, rate_24h: 3 });
    for (let i = 0; i < 3; i++) await withSpend(copyMeta(), 0.0001, okCall(), { db: f.db });
    expect(await withSpend(copyMeta(), 0.0001, okCall(), { db: f.db })).toEqual({
      ok: false,
      code: "rate",
      message: "Slow down. Try again in 60 minutes.",
    });
  });
});

describe("settle exactly once", () => {
  it("success: one settle with ok=true, the actual cost, units and request id", async () => {
    const f = fakeBudgetDb();
    const r = await withSpend(copyMeta(), 0.0069, okCall(0.0012), { db: f.db });
    expect(r).toMatchObject({ ok: true, value: "copy-json", alert: false, logId: "log-1" });
    expect(f.count("promo_settle_spend")).toBe(1);
    expect(f.calls.find((c) => c.fn === "promo_settle_spend")?.args).toEqual({
      _id: "log-1",
      _ok: true,
      _actual: 0.0012,
      _units: 1234,
      _error: null,
      _request_id: "gen-1",
      _creative: null,
    });
    expect(f.rows[0]).toMatchObject({ state: "settled", ok: true, actual_usd: 0.0012 });
  });

  it("provider failure: one settle with ok=false; a billed failure keeps its actual cost", async () => {
    const f = fakeBudgetDb();
    const r = await withSpend(
      copyMeta(),
      0.0069,
      async () => {
        throw new SpendCallError("AI returned invalid JSON", { actualUsd: 0.002, requestId: "gen-2" });
      },
      { db: f.db },
    );
    expect(r).toMatchObject({ ok: false, code: "provider", message: "AI returned invalid JSON" });
    expect(f.count("promo_settle_spend")).toBe(1);
    expect(f.rows[0]).toMatchObject({ state: "settled", ok: false, actual_usd: 0.002, error: "AI returned invalid JSON" });
  });

  it("an unbilled failure settles with actual = null (counts at the estimate)", async () => {
    const f = fakeBudgetDb();
    await withSpend(
      copyMeta(),
      0.0069,
      async () => {
        throw new Error("network down");
      },
      { db: f.db },
    );
    expect(f.rows[0]).toMatchObject({ state: "settled", ok: false, actual_usd: null });
  });

  it("a settle error is logged, not retried; the row stays pending and the result is still returned", async () => {
    const f = fakeBudgetDb();
    f.failSettle({ message: "db down" });
    const r = await withSpend(copyMeta(), 0.0069, okCall(), { db: f.db });
    expect(r.ok).toBe(true);
    expect(f.count("promo_settle_spend")).toBe(1);
    expect(f.rows[0].state).toBe("pending");
    expect(errSpy).toHaveBeenCalled();
  });

  it("a retry is a new reservation with its own row", async () => {
    const f = fakeBudgetDb();
    await withSpend(copyMeta(), 0.0069, async () => Promise.reject(new Error("502")), { db: f.db });
    await withSpend(copyMeta(), 0.0069, okCall(), { db: f.db });
    expect(f.rows.map((r) => [r.id, r.ok])).toEqual([
      ["log-1", false],
      ["log-2", true],
    ]);
    expect(f.count("promo_reserve_spend")).toBe(2);
    expect(f.count("promo_settle_spend")).toBe(2);
  });
});

describe("refusals before any provider call", () => {
  it("disabled and forbidden map to their messages", async () => {
    const off = fakeBudgetDb({ enabled: false });
    expect(await withSpend(copyMeta(), 0.001, okCall(), { db: off.db })).toEqual({
      ok: false,
      code: "disabled",
      message: "Promo Studio is turned off.",
    });
    const f = fakeBudgetDb();
    const call = okCall();
    expect(await withSpend(copyMeta({ adminId: "not-an-admin" }), 0.001, call, { db: f.db })).toEqual({
      ok: false,
      code: "forbidden",
      message: "Forbidden: admin only",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("an RPC error throws and never calls the provider", async () => {
    const call = okCall();
    const db: BudgetDb = { rpc: () => Promise.resolve({ data: null, error: { message: "permission denied" } }) };
    await expect(withSpend(copyMeta(), 0.001, call, { db })).rejects.toThrow(/budget/);
    expect(call).not.toHaveBeenCalled();
  });

  it("models outside the code price table (e.g. nano-banana) can't be reserved", async () => {
    const f = fakeBudgetDb();
    await expect(
      withSpend(copyMeta({ provider: "fal", model: "fal-ai/nano-banana", step: "background" }), 0.04, okCall(), {
        db: f.db,
      }),
    ).rejects.toThrow(/not allowed/);
    await expect(withSpend(copyMeta({ provider: "fal" }), 0.001, okCall(), { db: f.db })).rejects.toThrow(
      /not allowed/,
    );
    await expect(withSpend(copyMeta(), -1, okCall(), { db: f.db })).rejects.toThrow(/invalid estimate/);
    expect(f.calls).toHaveLength(0);
  });

  it("unknown refusal codes fail closed", () => {
    expect(refusalMessage({ code: "something-new" }).code).toBe("invalid");
    expect(refusalMessage({ code: "rate", retry_after_s: 61 }).message).toBe("Slow down. Try again in 2 minutes.");
    expect(refusalMessage({ code: "rate", retry_after_s: 60 }).message).toBe("Slow down. Try again in 1 minute.");
  });
});
