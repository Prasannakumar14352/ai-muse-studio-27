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

const isVideoUrl = (u: string) => u.startsWith("data:video") || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u);

/** Why this content can't go to this platform, or null when it can. */
export function platformMediaProblem(platform: Platform, mediaUrls: string[]): string | null {
  const hasVideo = mediaUrls.some(isVideoUrl);
  if (platform === "youtube" && !hasVideo) return "YouTube needs a rendered video.";
  if (platform === "instagram" && mediaUrls.length === 0) return "Instagram needs an image or a video.";
  return null;
}

/** The user's connection for this platform, or a friendly error. Shared by schedulePost and Promo Studio. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertPublishConnection(supabase: any, userId: string, platform: Platform, connectionId: string): Promise<{ id: string }> {
  const { data: conn } = await supabase.from("platform_connections")
    .select("id, status, expires_at, account_label")
    .eq("user_id", userId).eq("platform", platform).eq("id", connectionId)
    .maybeSingle();
  if (!conn) throw new Error(`That ${platform} account isn't connected any more. Reconnect it in Connected Accounts.`);
  return conn as { id: string };
}

// Upload an embedded (data:) image or video to storage so it can be published
// by URL. Returns a signed URL; the publisher re-signs it when it runs.
export const stagePublishMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dataUrl: z.string().startsWith("data:").max(6_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const m = data.dataUrl.match(/^data:((?:image|video)\/[\w.+-]+);base64,(.+)$/s);
    if (!m) throw new Error("Unsupported media");
    const mime = m[1];
    const bytes = Buffer.from(m[2], "base64");
    const ext = (mime.split("/")[1] ?? "bin").replace("jpeg", "jpg").replace("quicktime", "mov");
    const path = `${context.userId}/publish/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from("renders").upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data: signed, error: sErr } = await supabaseAdmin.storage.from("renders").createSignedUrl(path, 7 * 24 * 3600);
    if (sErr || !signed) throw new Error("Upload failed");
    return { url: signed.signedUrl };
  });

// Publish now, or schedule for later, with the user's connected account.
// "Publish now" runs immediately and returns the result; scheduled posts are
// picked up by the publish worker (pg_cron, every 5 minutes).
export const schedulePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    projectId: z.string().uuid().optional(),
    platform: platformSchema,
    // Required: posts only go to an account the user explicitly picked.
    connectionId: z.string().uuid(),
    title: z.string().max(300).optional(),
    caption: z.string().optional(),
    hashtags: z.string().optional(),
    mediaUrls: z.array(z.string()).optional(),
    scheduledAt: z.string().datetime().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const media = data.mediaUrls ?? [];
    const problem = platformMediaProblem(data.platform, media);
    if (problem) throw new Error(problem);

    const conn = await assertPublishConnection(supabase, userId, data.platform, data.connectionId);

    const scheduled = data.scheduledAt ?? null;
    if (scheduled && new Date(scheduled).getTime() < Date.now() - 60_000) {
      throw new Error("Pick a time in the future.");
    }
    const { data: row, error } = await supabase.from("scheduled_posts").insert({
      user_id: userId,
      project_id: data.projectId ?? null,
      platform: data.platform,
      connection_id: conn.id,
      title: data.title ?? null,
      caption: data.caption ?? null,
      hashtags: data.hashtags ?? null,
      media_urls: media as never,
      scheduled_at: scheduled,
      status: scheduled ? "scheduled" : "ready",
    } as never).select("id").single();
    if (error) throw error;
    const id = row.id as string;

    if (scheduled) {
      if (data.projectId) {
        await supabase.from("projects").update({ publish_status: "scheduled" } as never)
          .eq("id", data.projectId).eq("user_id", userId);
      }
      return { ok: true, id, status: "scheduled", url: null as string | null, error: null as string | null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runPublishJob } = await import("./social-publish.server");
    const r = await runPublishJob(supabaseAdmin, id);
    return { ok: r.status === "published" || r.status === "publishing", id, ...r };
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

// Update a scheduled post's schedule / caption / hashtags / status.
export const updateScheduledPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    scheduledAt: z.string().datetime().nullable().optional(),
    caption: z.string().nullable().optional(),
    hashtags: z.string().nullable().optional(),
    status: z.enum(["draft", "ready", "scheduled"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.scheduledAt !== undefined) patch.scheduled_at = data.scheduledAt;
    if (data.caption !== undefined) patch.caption = data.caption;
    if (data.hashtags !== undefined) patch.hashtags = data.hashtags;
    if (data.status !== undefined) patch.status = data.status;
    const { error } = await context.supabase
      .from("scheduled_posts").update(patch as never)
      .eq("id", data.id).eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

// Publish a queued/scheduled post right now.
export const publishScheduledPostNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("scheduled_posts").update({
      status: "ready",
      scheduled_at: null,
      attempts: 0,
      last_error: null,
    } as never).eq("id", data.id).eq("user_id", context.userId).neq("status", "publishing");
    if (error) throw error;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runPublishJob } = await import("./social-publish.server");
    const r = await runPublishJob(supabaseAdmin, data.id);
    return { ok: r.status === "published" || r.status === "publishing", ...r };
  });

// Publishing analytics: counts by status + per-platform totals + 30d timeline.
export const getPublishingAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("scheduled_posts")
      .select("status, platform, published_at, created_at, scheduled_at")
      .eq("user_id", context.userId)
      .limit(1000);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      status: string; platform: string;
      published_at: string | null; created_at: string; scheduled_at: string | null;
    }>;
    const byStatus: Record<string, number> = {};
    const byPlatform: Record<string, { total: number; published: number; failed: number; scheduled: number }> = {};
    const last30: Record<string, number> = {};
    const now = Date.now();
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      const p = (byPlatform[r.platform] ??= { total: 0, published: 0, failed: 0, scheduled: 0 });
      p.total += 1;
      if (r.status === "published" || r.status === "manually_published") p.published += 1;
      else if (r.status === "failed") p.failed += 1;
      else if (r.status === "scheduled" || r.status === "ready" || r.status === "publishing") p.scheduled += 1;
      const ts = r.published_at ?? r.created_at;
      if (ts) {
        const t = new Date(ts).getTime();
        if (now - t <= 30 * 24 * 3600 * 1000) {
          const day = new Date(ts).toISOString().slice(0, 10);
          last30[day] = (last30[day] ?? 0) + (r.status === "published" || r.status === "manually_published" ? 1 : 0);
        }
      }
    }
    const total = rows.length;
    const published = (byStatus.published ?? 0) + (byStatus.manually_published ?? 0);
    const failed = byStatus.failed ?? 0;
    const successRate = total ? Math.round((published / Math.max(1, published + failed)) * 100) : 0;
    return { total, published, failed, successRate, byStatus, byPlatform, last30 };
  });

// Platform status: connection health per platform.
export const getPlatformStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_connections")
      .select("platform, status, account_label, expires_at, updated_at")
      .eq("user_id", context.userId);
    if (error) throw error;
    const conns = (data ?? []) as Array<{
      platform: string; status: string | null; account_label: string | null;
      expires_at: string | null; updated_at: string | null;
    }>;
    return PLATFORMS.map((p) => {
      const c = conns.find((x) => x.platform === p && x.status !== "expired") ?? conns.find((x) => x.platform === p);
      // YouTube tokens refresh automatically; others must be reconnected when expired.
      const expired = p !== "youtube" && c?.expires_at ? new Date(c.expires_at).getTime() < Date.now() : false;
      return {
        platform: p,
        accounts: conns.filter((x) => x.platform === p).length,
        connected: !!c && c.status === "connected" && !expired,
        status: expired ? "expired" : (c?.status ?? "disconnected"),
        accountName: c?.account_label ?? null,
        expiresAt: c?.expires_at ?? null,
        updatedAt: c?.updated_at ?? null,
      };
    });
  });

// Every connected account the user can publish to, grouped client-side by platform.
export const listPublishTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_connections")
      .select("id, platform, account_id, account_label, avatar_url, status, expires_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((c) => {
      const platform = c.platform as Platform;
      const expired = platform !== "youtube" && c.expires_at ? new Date(c.expires_at as string).getTime() < Date.now() : false;
      return {
        id: c.id as string,
        platform,
        label: (c.account_label as string | null) ?? (c.account_id as string | null) ?? platform,
        avatarUrl: (c.avatar_url as string | null) ?? null,
        usable: c.status === "connected" && !expired,
        status: expired ? "expired" : ((c.status as string | null) ?? "unknown"),
      };
    });
  });

// Retry every failed post for the user.
export const retryAllFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("scheduled_posts").update({
      status: "ready", attempts: 0, last_error: null,
    } as never).eq("user_id", context.userId).eq("status", "failed").select("id");
    if (error) throw error;
    return { ok: true, count: (data ?? []).length };
  });
