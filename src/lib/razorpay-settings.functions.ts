import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { userId: string; supabase: unknown }) {
  const sb = ctx.supabase as {
    rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }>;
  };
  const { data } = await sb.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Public: safe branding for browser checkout (no secrets). */
export const getRazorpayBranding = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveRazorpayBranding } = await import("@/lib/razorpay-settings.server");
  return await resolveRazorpayBranding();
});

/** Admin: read settings (secrets are masked as booleans only). */
export const getRazorpaySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { getAdminSettings } = await import("@/lib/razorpay-settings.server");
    return await getAdminSettings();
  });

/** Admin: save settings. Secrets encrypted before persist. */
export const saveRazorpaySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    environment: "test" | "live";
    enabled: boolean;
    keyId: string;
    keySecret?: string | null;
    webhookSecret?: string | null;
    companyName?: string | null;
    logoUrl?: string | null;
    themeColor?: string | null;
    currency?: string;
  }) => {
    if (input.environment !== "test" && input.environment !== "live") {
      throw new Error("Invalid environment");
    }
    if (typeof input.keyId !== "string") throw new Error("keyId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { saveAdminSettings } = await import("@/lib/razorpay-settings.server");
    return await saveAdminSettings(data, context.userId);
  });

/** Admin: ping Razorpay to verify credentials. */
export const testRazorpayConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { testConnection } = await import("@/lib/razorpay-settings.server");
    try {
      return await testConnection();
    } catch (e) {
      return { ok: false, kind: "network" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

/**
 * Admin diagnostic: creates a tiny INR order (never charged) and reports
 * UPI/QR availability + key mode. Used by the Razorpay debugger to isolate
 * "blank QR" issues to code vs. credentials vs. merchant activation.
 */
export const runRazorpayDiagnostic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { runDiagnostic } = await import("@/lib/razorpay-settings.server");
    return await runDiagnostic();
  });

/**
 * Admin: create a real ₹1 INR order (manual capture) so the admin can open
 * Razorpay Checkout and visually inspect UPI QR rendering. Not auto-charged.
 */
export const createRazorpayCheckoutProbe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { createCheckoutProbeOrder } = await import("@/lib/razorpay-settings.server");
    return await createCheckoutProbeOrder();
  });
