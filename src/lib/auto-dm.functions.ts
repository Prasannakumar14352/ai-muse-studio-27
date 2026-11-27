// User-facing server functions for Auto DM. Every function checks the session;
// everything except the status check also requires the Creator plan (server-side).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any -- auto-DM tables are not in the generated types yet */

async function gate(userId: string) {
  const { assertFeature } = await import("./plan-access.server");
  await assertFeature(userId, "auto_dm");
}

async function ownConnection(context: { supabase: any; userId: string }, id: string) {
  const { data, error } = await context.supabase
    .from("platform_connections")
    .select("id, platform")
    .eq("id", id)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error || !data) throw new Error("Account not found.");
  if (data.platform !== "instagram" && data.platform !== "facebook")
    throw new Error("Auto DM supports Instagram and Facebook only.");
  return data as { id: string; platform: string };
}

/** Is Auto DM live yet? (Meta app saved + webhook token set) and may this user use it. */
export const getAutoDmStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg } = await supabaseAdmin
      .from("oauth_provider_configs")
      .select("client_id, client_secret_encrypted, enabled")
      .eq("provider", "meta")
      .maybeSingle();
    const metaApp = Boolean(cfg?.client_id && cfg?.client_secret_encrypted && cfg?.enabled);
    const verify = process.env.META_WEBHOOK_VERIFY_TOKEN;
    const webhookToken = Boolean(verify && verify.length >= 16);
    const { getUserTier } = await import("./plan-access.server");
    const { isAdmin } = await getUserTier(context.userId);
    let allowed = true;
    try {
      await gate(context.userId);
    } catch {
      allowed = false;
    }
    return { live: metaApp && webhookToken, metaApp, webhookToken, allowed, isAdmin };
  });

/** Instagram / Facebook connections with their Auto DM state. */
export const listDmAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await gate(context.userId);
    const { hasDmScopes } = await import("./auto-dm.server");
    const { data, error } = await (context.supabase as any)
      .from("platform_connections")
      .select(
        "id, platform, account_label, avatar_url, profile_url, scopes, status, dm_enabled, dm_subscribed_at, last_error",
      )
      .eq("user_id", context.userId)
      .in("platform", ["instagram", "facebook"])
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((c) => ({
      id: c.id as string,
      platform: c.platform as "instagram" | "facebook",
      label: (c.account_label as string | null) ?? c.platform,
      avatarUrl: c.avatar_url as string | null,
      profileUrl: c.profile_url as string | null,
      status: c.status as string,
      dmEnabled: !!c.dm_enabled,
      needsPermissions: !hasDmScopes(c.platform, c.scopes),
      lastError: c.last_error as string | null,
    }));
  });

export const setDmEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ connectionId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.enabled) await gate(context.userId);
    await ownConnection(context as any, data.connectionId);
    const { loadConnection, setPageSubscription, hasDmScopes } = await import("./auto-dm.server");
    const conn = await loadConnection(data.connectionId);
    if (!conn) throw new Error("Account not found.");
    if (data.enabled && !hasDmScopes(conn.platform, conn.scopes)) {
      throw new Error(
        "This account needs messaging permission. Use “Reconnect for Auto DM” first.",
      );
    }
    try {
      await setPageSubscription(conn, data.enabled);
    } catch (e) {
      if (data.enabled)
        throw new Error(
          `Meta refused the webhook subscription: ${e instanceof Error ? e.message : e}`,
        );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any)
      .from("platform_connections")
      .update({
        dm_enabled: data.enabled,
        dm_subscribed_at: data.enabled ? new Date().toISOString() : null,
        last_error: null,
      })
      .eq("id", conn.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const listDmMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ connectionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await gate(context.userId);
    await ownConnection(context as any, data.connectionId);
    const { loadConnection, listRecentMedia } = await import("./auto-dm.server");
    const conn = await loadConnection(data.connectionId);
    if (!conn) throw new Error("Account not found.");
    return listRecentMedia(conn);
  });

const ruleSchema = z
  .object({
    id: z.string().uuid().optional(),
    connectionId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    trigger: z.enum(["comment_keyword", "any_comment", "dm_keyword"]),
    mediaId: z.string().trim().max(100).nullable().optional(),
    keywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    matchMode: z.enum(["contains", "exact"]).default("contains"),
    dmText: z.string().trim().min(1).max(1000),
    linkUrl: z
      .string()
      .trim()
      .url()
      .startsWith("https://")
      .max(500)
      .nullable()
      .optional()
      .or(z.literal("")),
    publicReplies: z.array(z.string().trim().min(1).max(200)).max(5).default([]),
    active: z.boolean().default(true),
  })
  .refine((r) => r.trigger === "any_comment" || r.keywords.length > 0, {
    message: "Add at least one keyword.",
    path: ["keywords"],
  })
  .refine((r) => r.trigger !== "dm_keyword" || r.publicReplies.length === 0, {
    message: "Public replies only apply to comments.",
    path: ["publicReplies"],
  });

export const listDmRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await gate(context.userId);
    const { data, error } = await (context.supabase as any)
      .from("dm_rules")
      .select(
        "id, connection_id, name, trigger, media_id, keywords, match_mode, dm_text, link_url, public_replies, active, created_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      connection_id: string;
      name: string;
      trigger: "comment_keyword" | "any_comment" | "dm_keyword";
      media_id: string | null;
      keywords: string[];
      match_mode: "contains" | "exact";
      dm_text: string;
      link_url: string | null;
      public_replies: string[];
      active: boolean;
      created_at: string;
    }>;
  });

export const saveDmRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ruleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await gate(context.userId);
    await ownConnection(context as any, data.connectionId);
    const row = {
      user_id: context.userId,
      connection_id: data.connectionId,
      name: data.name,
      trigger: data.trigger,
      media_id: data.trigger === "dm_keyword" ? null : data.mediaId || null,
      keywords: data.trigger === "any_comment" ? [] : data.keywords,
      match_mode: data.matchMode,
      dm_text: data.dmText,
      link_url: data.linkUrl || null,
      public_replies: data.trigger === "dm_keyword" ? [] : data.publicReplies,
      active: data.active,
    };
    const q = (context.supabase as any).from("dm_rules");
    const { data: saved, error } = data.id
      ? await q.update(row).eq("id", data.id).eq("user_id", context.userId).select("id")
      : await q.insert(row).select("id");
    if (error) throw new Error(error.message);
    if (!saved || saved.length === 0) throw new Error("Rule not found.");
    return { ok: true };
  });

export const deleteDmRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("dm_rules")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDmActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await gate(context.userId);
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const sb = context.supabase as any;
    const [{ data: rows, error }, { count: sent }, { count: failed }] = await Promise.all([
      sb
        .from("dm_sends")
        .select("id, connection_id, kind, recipient_name, text, status, error, created_at, sent_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      sb
        .from("dm_sends")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("status", "sent")
        .gte("created_at", since),
      sb
        .from("dm_sends")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .eq("status", "failed")
        .gte("created_at", since),
    ]);
    if (error) throw new Error(error.message);
    return {
      sent7d: sent ?? 0,
      failed7d: failed ?? 0,
      items: (rows ?? []) as Array<{
        id: string;
        connection_id: string;
        kind: "private_reply" | "dm" | "public_reply";
        recipient_name: string | null;
        text: string;
        status: string;
        error: string | null;
        created_at: string;
        sent_at: string | null;
      }>,
    };
  });
