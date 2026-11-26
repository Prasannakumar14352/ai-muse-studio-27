// requireAdmin (Promo Studio design §4.1): anonymous → Unauthorized, non-admin → Forbidden,
// admin → adminId in context. The role comes only from has_role via the service role, never from
// profiles.is_admin, ADMIN_EMAIL, the user-scoped client or the request.
import { describe, it, expect, vi, beforeEach } from "vitest";

const adminRpc = vi.fn();
const adminFrom = vi.fn(() => {
  throw new Error("requireAdmin must not read tables (e.g. profiles.is_admin)");
});
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...a: unknown[]) => adminRpc(...a), from: (...a: unknown[]) => adminFrom(...(a as [])) },
}));

let currentRequest: Request | undefined;
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => currentRequest }));

import { requireAdmin } from "@/lib/require-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = Record<string, unknown>;
type Next = (o?: { context?: Ctx }) => Promise<{ context: Ctx }>;
type ServerFn = (a: { next: Next; context: Ctx }) => Promise<{ context: Ctx }>;
type MwOptions = { middleware?: Array<{ options: { server: ServerFn } }>; server: ServerFn };

const adminOptions = requireAdmin.options as unknown as MwOptions;
const authOptions = requireSupabaseAuth.options as unknown as MwOptions;

/** Runs requireAdmin's chain the way TanStack Start does: each middleware's server(), in order. */
async function runChain(context: Ctx = {}) {
  const handler = vi.fn(async (o?: { context?: Ctx }) => ({ context: { ...(o?.context ?? {}) } }));
  const chain = [...(adminOptions.middleware ?? []).map((m) => m.options.server), adminOptions.server];
  const step = async (i: number, ctx: Ctx): Promise<{ context: Ctx }> => {
    if (i === chain.length) return handler({ context: ctx });
    return chain[i]({ context: ctx, next: async (o) => step(i + 1, { ...ctx, ...(o?.context ?? {}) }) });
  };
  const out = await step(0, context);
  return { out, handler };
}

beforeEach(() => {
  adminRpc.mockReset();
  adminFrom.mockClear();
  currentRequest = undefined;
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
});

describe("requireAdmin", () => {
  it("chains requireSupabaseAuth first", () => {
    expect(adminOptions.middleware?.[0]?.options.server).toBe(authOptions.server);
  });

  it("rejects an unauthenticated caller (no Authorization header) before any role lookup", async () => {
    currentRequest = new Request("http://localhost/_serverFn/x", { method: "POST" });
    await expect(runChain()).rejects.toThrow(/^Unauthorized/);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed bearer token before any role lookup", async () => {
    currentRequest = new Request("http://localhost/_serverFn/x", {
      method: "POST",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    await expect(runChain()).rejects.toThrow(/^Unauthorized/);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("rejects a signed-in non-admin with 'Forbidden: admin only'", async () => {
    adminRpc.mockResolvedValue({ data: false, error: null });
    const next = vi.fn();
    await expect(adminOptions.server({ next, context: { userId: "user-1" } })).rejects.toThrow("Forbidden: admin only");
    expect(next).not.toHaveBeenCalled();
    expect(adminRpc).toHaveBeenCalledWith("has_role", { _user_id: "user-1", _role: "admin" });
  });

  it("ignores profiles.is_admin, ADMIN_EMAIL claims and the user-scoped client", async () => {
    adminRpc.mockResolvedValue({ data: false, error: null });
    const userClient = {
      rpc: vi.fn(async () => ({ data: true, error: null })), // would say "admin" if it were (wrongly) used
      from: vi.fn(() => {
        throw new Error("must not read with the user client");
      }),
    };
    const next = vi.fn();
    await expect(
      adminOptions.server({
        next,
        context: {
          userId: "user-2",
          supabase: userClient,
          // stand-in for the ADMIN_EMAIL address and a profiles.is_admin=true user
          claims: { sub: "user-2", email: "owner@example.test", is_admin: true, role: "admin" },
          isAdmin: true,
        },
      }),
    ).rejects.toThrow("Forbidden: admin only");
    expect(userClient.rpc).not.toHaveBeenCalled();
    expect(adminFrom).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("treats a null / non-boolean has_role answer as not admin", async () => {
    for (const data of [null, "true", 1, {}]) {
      adminRpc.mockResolvedValueOnce({ data, error: null });
      await expect(adminOptions.server({ next: vi.fn(), context: { userId: "u" } })).rejects.toThrow(
        "Forbidden: admin only",
      );
    }
  });

  it("fails closed when the role check errors", async () => {
    adminRpc.mockResolvedValue({ data: true, error: { message: "boom" } });
    const next = vi.fn();
    await expect(adminOptions.server({ next, context: { userId: "u" } })).rejects.toThrow("Admin check failed");
    expect(next).not.toHaveBeenCalled();
  });

  it("lets an admin through with adminId = the session user id", async () => {
    adminRpc.mockResolvedValue({ data: true, error: null });
    const next = vi.fn(async (o?: { context?: Ctx }) => ({ context: o?.context ?? {} }));
    const out = await adminOptions.server({ next, context: { userId: "admin-1" } });
    expect(next).toHaveBeenCalledWith({ context: { adminId: "admin-1" } });
    expect(out.context).toEqual({ adminId: "admin-1" });
  });
});
