import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AdminCtx = { userId: string; supabase: { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => Promise<{ data: unknown }> } };
async function assertAdmin(ctx: AdminCtx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Public: resolve current USD→INR rate for checkout confirmation UI. */
export const getExchangeRate = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveUsdInrRate } = await import("@/lib/fx-rate.server");
  return await resolveUsdInrRate();
});

/** Admin: force refresh from the live FX provider. */
export const refreshExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { resolveUsdInrRate } = await import("@/lib/fx-rate.server");
    return await resolveUsdInrRate({ forceRefresh: true });
  });

/** Admin: read full exchange rate admin dashboard state. */
export const getExchangeRateAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const {
      resolveUsdInrRate,
      readManualFallback,
      readManualOverride,
      newestCachedRate,
      activeFxProvider,
      FX_CACHE_TTL_MS,
    } = await import("@/lib/fx-rate.server");
    const [resolved, fallback, override, cached] = await Promise.all([
      resolveUsdInrRate(),
      readManualFallback(),
      readManualOverride(),
      newestCachedRate(),
    ]);
    return {
      resolved,
      manualFallback: fallback,
      manualOverrideEnabled: override,
      activeProvider: activeFxProvider.id,
      cacheTtlHours: FX_CACHE_TTL_MS / 3_600_000,
      latestCached: cached
        ? {
            rate: Number(cached.rate),
            provider: cached.provider,
            status: cached.status,
            fetchedAt: cached.fetched_at,
            expiresAt: cached.expires_at,
          }
        : null,
    };
  });

/** Admin: set manual fallback rate. */
export const setManualFallbackRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rate: number }) => {
    const r = Number(input?.rate);
    if (!Number.isFinite(r) || r <= 0 || r > 1000) throw new Error("Invalid rate");
    return { rate: r };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        key: "usd_to_inr_manual_fallback",
        value: { rate: data.rate },
        updated_by: context.userId,
      });
    if (error) throw new Error(error.message);
    return { ok: true, rate: data.rate };
  });

/** Admin: enable/disable manual override (force use of manual rate). */
export const setManualOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { enabled: boolean }) => ({ enabled: !!input?.enabled }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        key: "usd_to_inr_manual_override",
        value: { enabled: data.enabled },
        updated_by: context.userId,
      });
    if (error) throw new Error(error.message);
    return { ok: true, enabled: data.enabled };
  });
