// Server functions for publishing / scheduling / marking manually published.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PLATFORMS = ["instagram", "facebook", "youtube", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PUBLISH_STATUSES = [
  "draft", "ready", "scheduled", "publishing",
  "published", "manually_published", "failed", "reconnect_required",
] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];

const platformSchema = z.enum(PLATFORMS);

// Mark a project as manually published on a given platform (with optional URL).
export const markManuallyPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    projectId: z.string().uuid(),
    platform: platformSchema.optional(),
    url: z.string().url().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj, error: pErr } = await supabase
      .from("projects").select("platform_urls").eq("id", data.projectId).eq("user_id", userId).maybeSingle();
    if (pErr) throw pErr;
    const existing = ((proj?.platform_urls as Record<string, string> | null) ?? {});
    if (data.platform && data.url) existing[data.platform] = data.url;
    const { error } = await supabase.from("projects").update({
      publish_status: "manually_published",
      manually_published_at: new Date().toISOString(),
      platform_urls: existing,
    } as never).eq("id", data.projectId).eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

// Schedule (or immediately queue) a publish job. Stubbed: on run the worker
// will mark the project `manually_published` since no OAuth adapter is wired.
export const schedulePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    projectId: z.string().uuid(),
    platform: platformSchema,
    caption: z.string().optional(),
    hashtags: z.string().optional(),
    mediaUrls: z.array(z.string()).optional(),
    scheduledAt: z.string().datetime().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const scheduled = data.scheduledAt ?? null;
    const { data: row, error } = await supabase.from("scheduled_posts").insert({
      user_id: userId,
      project_id: data.projectId,
      platform: data.platform,
      caption: data.caption ?? null,
      hashtags: data.hashtags ?? null,
      media_urls: (data.mediaUrls ?? []) as never,
      scheduled_at: scheduled,
      status: scheduled ? "scheduled" : "ready",
    } as never).select("id").single();
    if (error) throw error;
    await supabase.from("projects").update({
      publish_status: scheduled ? "scheduled" : "ready",
    } as never).eq("id", data.projectId).eq("user_id", userId);
    return { ok: true, id: row.id as string };
  });

export const cancelScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scheduled_posts").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const listScheduledPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scheduled_posts").select("*")
      .eq("user_id", context.userId)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const retryScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scheduled_posts").update({
      status: "ready",
      attempts: 0,
      last_error: null,
    } as never).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
