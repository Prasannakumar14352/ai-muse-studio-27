// Regression tests for audit 2026-11-26 C3/C4: client-reachable refund paths
// must never refund a finalized ('charged') generation, another user's row,
// or a reservation the server opened itself.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  refundClientReservation,
  cancelJobAndRefund,
  CLIENT_RESERVATION_PREFIX,
  type AdminDb,
} from "@/lib/credit-refund.server";

type Row = Record<string, unknown> & { id: string };

/** In-memory stand-in for the service-role Supabase client. */
function fakeDb(tables: Record<string, Row[]>) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }> = [];

  const db: AdminDb = {
    from(table: string) {
      return {
        select() {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(col: string, val: unknown) { filters[col] = val; return chain; },
            maybeSingle() {
              const row = (tables[table] ?? []).find((r) =>
                Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null;
              return Promise.resolve({ data: row ? { ...row } : null, error: null });
            },
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          const run = () => {
            updates.push({ table, patch, filters: { ...filters } });
            for (const r of tables[table] ?? []) {
              if (Object.entries(filters).every(([k, v]) => r[k] === v)) Object.assign(r, patch);
            }
            return { data: null, error: null };
          };
          const chain = {
            eq(col: string, val: unknown) { filters[col] = val; return chain; },
            then<T>(onF: (v: { data: unknown; error: null }) => T) { return Promise.resolve(run()).then(onF); },
          };
          return chain as never;
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      // Mirrors the new SQL: only 'reserved' rows are refundable.
      const row = (tables.credit_ledger ?? []).find((r) => r.id === args._ledger_id);
      if (!row) return Promise.resolve({ data: { ok: false, error: "not_found" }, error: null });
      if (row.status !== "reserved") {
        return Promise.resolve({ data: { ok: false, error: "not_refundable" }, error: null });
      }
      row.status = "refunded";
      return Promise.resolve({ data: { ok: true, refunded: row.credits_reserved }, error: null });
    },
  };
  return { db, rpcCalls, updates };
}

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("refundClientReservation (refundLedgerFn)", () => {
  let tables: Record<string, Row[]>;
  beforeEach(() => {
    tables = {
      credit_ledger: [
        { id: "reserved-client", user_id: ME, status: "reserved", credits_reserved: 5, idempotency_key: `${CLIENT_RESERVATION_PREFIX}${ME}:seo:abc` },
        { id: "charged-client", user_id: ME, status: "charged", credits_reserved: 5, idempotency_key: `${CLIENT_RESERVATION_PREFIX}${ME}:seo:def` },
        { id: "reserved-server", user_id: ME, status: "reserved", credits_reserved: 20, idempotency_key: `${ME}:motion_clip:uuid` },
        { id: "reserved-other", user_id: OTHER, status: "reserved", credits_reserved: 5, idempotency_key: `${CLIENT_RESERVATION_PREFIX}${OTHER}:seo:x` },
      ],
    };
  });

  it("refunds the caller's own open browser reservation", async () => {
    const { db, rpcCalls } = fakeDb(tables);
    const r = await refundClientReservation(db, ME, "reserved-client", "generation_failed");
    expect(r).toEqual({ ok: true, refunded: 5 });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("refund_credits_by_ledger");
  });

  it("rejects a charged (successful) row without calling the refund RPC", async () => {
    const { db, rpcCalls } = fakeDb(tables);
    const r = await refundClientReservation(db, ME, "charged-client", "x");
    expect(r).toEqual({ ok: false, error: "not_refundable" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects another user's row", async () => {
    const { db, rpcCalls } = fakeDb(tables);
    await expect(refundClientReservation(db, ME, "reserved-other", "x")).rejects.toThrow("forbidden");
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects an unknown ledger id", async () => {
    const { db } = fakeDb(tables);
    await expect(refundClientReservation(db, ME, "nope", "x")).rejects.toThrow("forbidden");
  });

  it("rejects a reservation the server opened (e.g. a motion clip still rendering)", async () => {
    const { db, rpcCalls } = fakeDb(tables);
    const r = await refundClientReservation(db, ME, "reserved-server", "x");
    expect(r).toEqual({ ok: false, error: "not_refundable" });
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("cancelJobAndRefund (cancelGenerationJobFn)", () => {
  it("refunds only the server-linked reserved ledger row of the caller's job", async () => {
    const tables: Record<string, Row[]> = {
      generation_jobs: [{ id: "job-1", user_id: ME, status: "processing", ledger_id: "l-1" }],
      credit_ledger: [{ id: "l-1", user_id: ME, status: "reserved", credits_reserved: 4, job_id: "job-1", idempotency_key: "job:job-1" }],
    };
    const { db, rpcCalls } = fakeDb(tables);
    const r = await cancelJobAndRefund(db, ME, "job-1");
    expect(r.alreadyTerminal).toBe(false);
    expect(r.refund).toEqual({ ok: true, refunded: 4 });
    expect(rpcCalls.map((c) => c.args._ledger_id)).toEqual(["l-1"]);
    expect(tables.generation_jobs[0].status).toBe("cancelled");
  });

  it("does not refund a charged ledger row", async () => {
    const tables: Record<string, Row[]> = {
      generation_jobs: [{ id: "job-1", user_id: ME, status: "processing", ledger_id: "l-1" }],
      credit_ledger: [{ id: "l-1", user_id: ME, status: "charged", credits_reserved: 4, job_id: "job-1", idempotency_key: "job:job-1" }],
    };
    const { db, rpcCalls } = fakeDb(tables);
    const r = await cancelJobAndRefund(db, ME, "job-1");
    expect(r.refund).toEqual({ ok: false, error: "not_refundable" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("does not refund a ledger row that isn't linked to this job (rewritten ledger_id)", async () => {
    const tables: Record<string, Row[]> = {
      generation_jobs: [{ id: "job-1", user_id: ME, status: "queued", ledger_id: "l-other" }],
      credit_ledger: [{ id: "l-other", user_id: ME, status: "reserved", credits_reserved: 50, job_id: null, idempotency_key: `${ME}:motion_clip:x` }],
    };
    const { db, rpcCalls } = fakeDb(tables);
    const r = await cancelJobAndRefund(db, ME, "job-1");
    expect(r.refund).toEqual({ ok: false, error: "not_refundable" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("does not refund a ledger row owned by someone else", async () => {
    const tables: Record<string, Row[]> = {
      generation_jobs: [{ id: "job-1", user_id: ME, status: "queued", ledger_id: "l-1" }],
      credit_ledger: [{ id: "l-1", user_id: OTHER, status: "reserved", credits_reserved: 4, job_id: "job-1", idempotency_key: "job:job-1" }],
    };
    const { db, rpcCalls } = fakeDb(tables);
    const r = await cancelJobAndRefund(db, ME, "job-1");
    expect(r.refund).toEqual({ ok: false, error: "not_refundable" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects cancelling another user's job", async () => {
    const tables: Record<string, Row[]> = {
      generation_jobs: [{ id: "job-1", user_id: OTHER, status: "queued", ledger_id: "l-1" }],
      credit_ledger: [],
    };
    const { db, updates } = fakeDb(tables);
    await expect(cancelJobAndRefund(db, ME, "job-1")).rejects.toThrow("forbidden");
    expect(updates).toHaveLength(0);
  });

  it("leaves a terminal job alone", async () => {
    const tables: Record<string, Row[]> = {
      generation_jobs: [{ id: "job-1", user_id: ME, status: "completed", ledger_id: "l-1" }],
      credit_ledger: [{ id: "l-1", user_id: ME, status: "charged", credits_reserved: 4, job_id: "job-1", idempotency_key: "job:job-1" }],
    };
    const { db, rpcCalls, updates } = fakeDb(tables);
    const r = await cancelJobAndRefund(db, ME, "job-1");
    expect(r.alreadyTerminal).toBe(true);
    expect(rpcCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

// Source-level guards: the minting paths must not come back.
describe("removed credit-minting paths stay removed", () => {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url))); // src/
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "__tests__") walk(p); continue; }
      if (/\.(ts|tsx)$/.test(name) && !p.includes(join("integrations", "supabase", "types.ts"))) files.push(p);
    }
  })(root);
  const src = files.map((f) => [f, readFileSync(f, "utf8")] as const);

  it("no code calls the refund_credits RPC or refundCreditsFn", () => {
    expect(existsSync(join(root, "lib", "credits.functions.ts"))).toBe(false);
    const hits = src.filter(([, s]) => /rpc\(\s*["']refund_credits["']/.test(s) || /refundCreditsFn/.test(s));
    expect(hits.map(([f]) => f)).toEqual([]);
  });

  it("no client-callable video-job refund exists (x-cf-job can't authorise a refund)", () => {
    const hits = src.filter(([, s]) => /refundVideoJobCredits/.test(s));
    expect(hits.map(([f]) => f)).toEqual([]);
  });

  it("refund_credits_by_ledger is only called from server code", () => {
    const callers = src
      .filter(([, s]) => /["']refund_credits_by_ledger["']/.test(s))
      .map(([f]) => relative(root, f).replace(/\\/g, "/"));
    expect(callers.length).toBeGreaterThan(0);
    const bad = callers.filter((f) =>
      !(f.endsWith(".server.ts") || f.endsWith(".functions.ts") || f.startsWith("routes/api/")));
    expect(bad).toEqual([]);
  });

  it("the browser no longer writes credits, admin flags or subscriptions", () => {
    const tsx = src.filter(([f]) => f.endsWith(".tsx"));
    const hits = tsx.filter(([, s]) =>
      /from\(\s*["']profiles["']\s*\)[\s\S]{0,80}\.update\(\s*\{[^}]*(user_credits|lifetime_credits|is_admin|role|plan)\b/.test(s) ||
      /from\(\s*["']subscriptions["']\s*\)[\s\S]{0,80}\.(update|insert|upsert|delete)\(/.test(s) ||
      /from\(\s*["']generation_jobs["']\s*\)[\s\S]{0,80}\.(update|insert|upsert|delete)\(/.test(s));
    expect(hits.map(([f]) => f)).toEqual([]);
  });
});
