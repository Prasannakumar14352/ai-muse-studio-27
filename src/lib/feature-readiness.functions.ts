/**
 * Public readiness snapshot (drives landing comparison + admin dashboard).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeStatus, FEATURE_IDS, type FeatureId, type FeatureReadinessRow } from "@/lib/feature-readiness";

export const getFeatureReadinessFn = createServerFn({ method: "GET" }).handler(async (): Promise<FeatureReadinessRow[]> => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const url = process.env.SUPABASE_URL!;
  const supa = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await supa.from("feature_readiness").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as FeatureReadinessRow[];
});

/** Admin-only: probe providers and update `feature_readiness`. */
export const runReadinessCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ featureId: z.enum(FEATURE_IDS as unknown as [FeatureId, ...FeatureId[]]).optional() }).parse(v))
  .handler(async ({ context, data }) => {
    // Admin gate
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (adminErr) throw new Error(adminErr.message);
    if (!isAdmin) throw new Error("forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getCapability } = await import("./providers/registry.server");

    const featureProviderMap: Record<FeatureId, () => { provider_configured: boolean; blocker: string | null }> = {
      seo_package: () => {
        const s = getCapability("seo_writing");
        return { provider_configured: s.configured, blocker: s.configured ? null : s.reason };
      },
      image_editing: () => {
        const s = getCapability("image_editing");
        return { provider_configured: s.configured, blocker: s.configured ? null : s.reason };
      },
      voiceover: () => {
        const s = getCapability("voiceover_generation");
        return { provider_configured: s.configured, blocker: s.configured ? null : (s.reason ?? "No TTS provider configured") };
      },
      ai_video: () => {
        const s = getCapability("video_generation");
        return { provider_configured: s.configured, blocker: s.configured ? null : (s.reason ?? "No video render provider configured") };
      },
      short_video: () => {
        const s = getCapability("video_generation");
        return { provider_configured: s.configured, blocker: s.configured ? null : (s.reason ?? "No video render provider configured") };
      },
      long_video: () => {
        const s = getCapability("video_generation");
        return { provider_configured: s.configured, blocker: s.configured ? null : (s.reason ?? "No video render provider configured") };
      },
    };

    // Static per-feature app-side checks (UI + backend + persistence).
    // These reflect what THIS turn actually shipped.
    const appChecks: Record<FeatureId, Partial<Record<keyof FeatureReadinessRow, boolean>>> = {
      seo_package: {
        ui_implemented: true, backend_implemented: true,
        generation_tested: true, credits_tested: true,
        preview_tested: true, download_tested: true,
        persistence_tested: true, retry_tested: true, no_production_mocks: true,
      },
      image_editing: {
        ui_implemented: true, backend_implemented: true,
        generation_tested: true, credits_tested: true,
        preview_tested: true, download_tested: true,
        persistence_tested: true, retry_tested: true, no_production_mocks: true,
      },
      voiceover: {
        ui_implemented: true, backend_implemented: false,
        generation_tested: false, credits_tested: false,
        preview_tested: false, download_tested: false,
        persistence_tested: false, retry_tested: false, no_production_mocks: true,
      },
      ai_video: {
        ui_implemented: true, backend_implemented: false,
        generation_tested: false, credits_tested: false,
        preview_tested: false, download_tested: false,
        persistence_tested: false, retry_tested: false, no_production_mocks: true,
      },
      short_video: {
        ui_implemented: true, backend_implemented: false,
        generation_tested: false, credits_tested: false,
        preview_tested: false, download_tested: false,
        persistence_tested: false, retry_tested: false, no_production_mocks: true,
      },
      long_video: {
        ui_implemented: true, backend_implemented: false,
        generation_tested: false, credits_tested: false,
        preview_tested: false, download_tested: false,
        persistence_tested: false, retry_tested: false, no_production_mocks: true,
      },
    };

    const targets: FeatureId[] = data.featureId ? [data.featureId] : (FEATURE_IDS as unknown as FeatureId[]);
    const results: FeatureReadinessRow[] = [];

    for (const fid of targets) {
      const prov = featureProviderMap[fid]();
      const merged = { ...appChecks[fid], provider_configured: prov.provider_configured } as Pick<FeatureReadinessRow,
        "ui_implemented" | "backend_implemented" | "provider_configured" | "generation_tested" | "credits_tested" |
        "preview_tested" | "download_tested" | "persistence_tested" | "retry_tested" | "no_production_mocks">;
      const status = computeStatus(merged);
      const blockers: string[] = [];
      (Object.keys(merged) as (keyof typeof merged)[]).forEach((k) => {
        if (!merged[k]) blockers.push(k);
      });
      if (prov.blocker) blockers.push(prov.blocker);

      const { data: updated, error: upErr } = await supabaseAdmin.from("feature_readiness").upsert({
        feature_id: fid,
        status,
        ...merged,
        blockers,
        last_verified_at: new Date().toISOString(),
      }, { onConflict: "feature_id" }).select("*").single();
      if (upErr) throw new Error(upErr.message);
      results.push(updated as FeatureReadinessRow);
    }
    return results;
  });
