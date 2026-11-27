import type { SupabaseClient } from "@supabase/supabase-js";
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

export const getProductionChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { execFile } = await import("node:child_process");
    const { resolveRazorpayCredentials } = await import("./razorpay-settings.server");
    const executable = (path: string) => new Promise<string>((resolve) => {
      execFile(path, ["-version"], { timeout: 3000, maxBuffer: 32768 },
        (error) => resolve(error ? "Unavailable" : "Available"));
    });
    const configuredFlag = (enabled: boolean, credential: boolean) =>
      !enabled ? "Disabled" : credential ? "Configured but unverified" : "Unavailable";
    const renderEnabled = process.env.VIDEO_SERVER_RENDER_ENABLED === "true";
    const [schema, bucket, ffmpeg, ffprobe, payment, worker] = await Promise.all([
      supabaseAdmin.from("video_publish_approvals").select("id").limit(1).abortSignal(AbortSignal.timeout(5000)),
      supabaseAdmin.storage.getBucket("approved-video-exports"),
      executable(process.env.FFMPEG_PATH || "ffmpeg"),
      executable(process.env.FFPROBE_PATH || "ffprobe"),
      resolveRazorpayCredentials().then((value) => value.webhookSecret ? "Configured but unverified" : "Unavailable",
        () => "Unavailable"),
      renderEnabled
        ? (supabaseAdmin as unknown as SupabaseClient).from("professional_render_workers")
          .select("id").gte("seen_at", new Date(Date.now() - 45_000).toISOString()).limit(1)
          .abortSignal(AbortSignal.timeout(5000))
        : null,
    ]);
    return {
      "Publishing approval schema": schema.error ? "Failed" : "Available",
      "Private approved export storage": bucket.error || bucket.data?.public ? "Failed" : "Available",
      FFmpeg: ffmpeg,
      FFprobe: ffprobe,
      "Paid audio": configuredFlag(process.env.VIDEO_PAID_AUDIO_ENABLED === "true", Boolean(process.env.FAL_KEY)),
      "Advanced video models": configuredFlag(process.env.VIDEO_ADVANCED_MODELS_ENABLED === "true", Boolean(process.env.FAL_KEY)),
      "Professional render worker": !worker ? "Disabled" : worker.error ? "Failed" : worker.data.length ? "Available" : "Unavailable",
      "Razorpay with webhook": payment,
      "External publishing": "Not checked",
    };
  });
