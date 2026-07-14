/**
 * FX rate service — USD → INR.
 *
 * Provider abstraction so we can swap without touching checkout. Default provider
 * is open.er-api.com/v6 (free, no API key, well maintained). Rates are cached in
 * `public.fx_rates` (rate, provider, fetched_at, expires_at, status). Admin can
 * override with a manual fallback stored in `public.app_settings`.
 *
 * Rules of resolution (`resolveUsdInrRate`):
 *   1. If manual override is enabled → use manual fallback rate (source="manual_override")
 *   2. If newest cached row exists AND expires_at > now() → use it (source="cache")
 *   3. Otherwise try to fetch live → cache + return (source="live")
 *   4. On fetch failure fall back to newest cached row regardless of expiry (source="stale_cache")
 *   5. If no cache at all → use manual fallback (source="manual_fallback")
 *
 * We NEVER silently use the old hardcoded 88.5 default. If nothing is set,
 * we use the seeded manual fallback (96.25) — that's the ONE floor.
 */
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const FX_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
export const FX_STALE_WARN_MS = 24 * 60 * 60 * 1000; // 24h
export const FX_HARD_FLOOR = 96.25; // absolute last-resort fallback if DB is empty

export type FxRateSource =
  | "live"
  | "cache"
  | "stale_cache"
  | "manual_override"
  | "manual_fallback"
  | "hard_floor";

export interface ResolvedFxRate {
  rate: number;
  source: FxRateSource;
  provider: string | null;
  fetchedAt: string; // ISO
  expiresAt: string | null; // ISO or null when synthetic
  status: "live" | "cached" | "manual" | "error";
  warning: string | null;
  nextRefreshAt: string | null;
}

// ---------- Provider abstraction ----------
export interface FxProvider {
  readonly id: string;
  fetchUsdInr(): Promise<{ rate: number; raw: unknown }>;
}

class OpenErApiProvider implements FxProvider {
  readonly id = "open.er-api";
  async fetchUsdInr() {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { accept: "application/json" },
      // short timeout: don't hold the checkout flow
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`FX provider HTTP ${res.status}`);
    const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (body.result !== "success" || !body.rates?.INR) {
      throw new Error("FX provider returned no INR rate");
    }
    const rate = Number(body.rates.INR);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX provider returned invalid rate");
    return { rate, raw: body };
  }
}

// Currently active provider. Swap here to change the source.
export const activeFxProvider: FxProvider = new OpenErApiProvider();

// ---------- Settings helpers ----------
async function readSetting<T = unknown>(key: string): Promise<{ value: T | null; updatedAt: string | null }> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value, updated_at")
    .eq("key", key)
    .maybeSingle();
  const row = data as { value?: T; updated_at?: string } | null;
  return { value: (row?.value as T) ?? null, updatedAt: row?.updated_at ?? null };
}

export async function readManualFallback(): Promise<{ rate: number; updatedAt: string | null }> {
  const { value, updatedAt } = await readSetting<{ rate?: number }>("usd_to_inr_manual_fallback");
  const r = Number(value?.rate);
  if (Number.isFinite(r) && r > 0) return { rate: r, updatedAt };
  // Legacy key from earlier iteration:
  const legacy = await readSetting<{ rate?: number }>("usd_to_inr_rate");
  const lr = Number(legacy.value?.rate);
  if (Number.isFinite(lr) && lr > 0) return { rate: lr, updatedAt: legacy.updatedAt };
  return { rate: FX_HARD_FLOOR, updatedAt: null };
}

export async function readManualOverride(): Promise<boolean> {
  const { value } = await readSetting<{ enabled?: boolean }>("usd_to_inr_manual_override");
  return !!value?.enabled;
}

// ---------- Cache ops ----------
type FxRow = Database["public"]["Tables"]["fx_rates"]["Row"];

export async function newestCachedRate(): Promise<FxRow | null> {
  const { data } = await supabaseAdmin
    .from("fx_rates")
    .select("*")
    .eq("base_currency", "USD")
    .eq("quote_currency", "INR")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as FxRow | null) ?? null;
}

export async function fetchAndCacheLiveRate(): Promise<FxRow> {
  const { rate, raw } = await activeFxProvider.fetchUsdInr();
  const now = new Date();
  const expires = new Date(now.getTime() + FX_CACHE_TTL_MS);
  const { data, error } = await supabaseAdmin
    .from("fx_rates")
    .insert({
      base_currency: "USD",
      quote_currency: "INR",
      rate,
      provider: activeFxProvider.id,
      status: "live",
      fetched_at: now.toISOString(),
      expires_at: expires.toISOString(),
      raw: raw as never,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to cache fx rate");
  return data as FxRow;
}

// ---------- Public resolver used by checkout ----------
export async function resolveUsdInrRate(opts: { forceRefresh?: boolean } = {}): Promise<ResolvedFxRate> {
  const override = await readManualOverride();
  if (override) {
    const fb = await readManualFallback();
    return {
      rate: fb.rate,
      source: "manual_override",
      provider: null,
      fetchedAt: fb.updatedAt ?? new Date().toISOString(),
      expiresAt: null,
      status: "manual",
      warning: null,
      nextRefreshAt: null,
    };
  }

  const cached = opts.forceRefresh ? null : await newestCachedRate();
  const now = Date.now();
  if (cached && new Date(cached.expires_at).getTime() > now) {
    return {
      rate: Number(cached.rate),
      source: "cache",
      provider: cached.provider,
      fetchedAt: cached.fetched_at,
      expiresAt: cached.expires_at,
      status: "cached",
      warning: null,
      nextRefreshAt: cached.expires_at,
    };
  }

  // Try live.
  try {
    const row = await fetchAndCacheLiveRate();
    return {
      rate: Number(row.rate),
      source: "live",
      provider: row.provider,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
      status: "live",
      warning: null,
      nextRefreshAt: row.expires_at,
    };
  } catch (e) {
    // Live failed → newest cache regardless of expiry.
    const stale = cached ?? (await newestCachedRate());
    if (stale) {
      const age = now - new Date(stale.fetched_at).getTime();
      const warn =
        age > FX_STALE_WARN_MS
          ? `Live FX unavailable and cached rate is ${(age / 3_600_000).toFixed(1)}h old. Please retry shortly.`
          : null;
      return {
        rate: Number(stale.rate),
        source: "stale_cache",
        provider: stale.provider,
        fetchedAt: stale.fetched_at,
        expiresAt: stale.expires_at,
        status: warn ? "error" : "cached",
        warning: warn,
        nextRefreshAt: null,
      };
    }
    // No cache at all → manual fallback.
    const fb = await readManualFallback();
    return {
      rate: fb.rate,
      source: fb.updatedAt ? "manual_fallback" : "hard_floor",
      provider: null,
      fetchedAt: fb.updatedAt ?? new Date().toISOString(),
      expiresAt: null,
      status: "manual",
      warning: `Live FX unavailable (${e instanceof Error ? e.message : "error"}); using admin fallback rate.`,
      nextRefreshAt: null,
    };
  }
}
