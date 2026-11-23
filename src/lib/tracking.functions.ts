// Signup attribution + a few funnel events for the HQ dashboard.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { userId: string };

function header(name: string): string | null {
  try {
    const v = getRequest().headers.get(name);
    if (!v) return null;
    return decodeURIComponent(v).slice(0, 80);
  } catch { return null; }
}

/** Records where this user came from — once; later calls are ignored. */
export const recordAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    source: z.string().max(40).default("direct"),
    medium: z.string().max(60).nullable().optional(),
    campaign: z.string().max(120).nullable().optional(),
    referrer: z.string().max(300).nullable().optional(),
    landing_path: z.string().max(200).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as unknown as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { error } = await db.from("signup_attribution").upsert({
      user_id: userId,
      source: data.source.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40) || "direct",
      medium: data.medium ?? null,
      campaign: data.campaign ?? null,
      referrer: data.referrer ?? null,
      landing_path: data.landing_path ?? null,
      country: header("x-vercel-ip-country"),
      region: header("x-vercel-ip-country-region"),
      city: header("x-vercel-ip-city"),
    }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) { console.warn("[attribution]", error.message); return { ok: false }; }
    return { ok: true };
  });

const EVENTS = [
  "pricing_view", "credits_exhausted", "series_interest",
  // "Notify me" clicks on the coming-soon AI Tools page (one event per tool,
  // because events are de-duplicated per user per event per day).
  "tool_subtitles_interest", "tool_bg_remove_interest", "tool_upscale_interest",
  "tool_talking_photo_interest", "tool_scene_stitch_interest",
] as const;

/** Funnel step, stored at most once per user per event per day. */
export const trackFunnelEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event: z.enum(EVENTS), meta: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as unknown as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await db.from("analytics_events").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("event", data.event).gte("occurred_at", since);
    if ((count ?? 0) === 0) {
      await db.from("analytics_events").insert({ user_id: userId, event: data.event, meta: data.meta ?? {} });
    }
    return { ok: true };
  });
