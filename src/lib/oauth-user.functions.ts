// User-facing server functions: start OAuth flow, list connections, disconnect,
// select a destination account, and report which providers are available.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROVIDERS, PLATFORM_TO_PROVIDER, callbackUrl, type PlatformId } from "./oauth-providers.server";

const platformSchema = z.enum(["instagram", "facebook", "youtube", "linkedin"]);

function requestOrigin(): string {
  const req = getRequest();
  const url = new URL(req.url);
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedHost) return `${forwardedProto ?? url.protocol.replace(":", "")}://${forwardedHost}`;
  return url.origin;
}

// Which providers are configured & enabled — safe for any user to know.
export const listProviderAvailability = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("oauth_provider_configs")
    .select("provider, client_id, client_secret_encrypted, enabled");
  const byProvider = new Map((data ?? []).map((r) => [r.provider as string, r]));
  const availability = (["instagram", "facebook", "youtube", "linkedin"] as PlatformId[]).map((platform) => {
    const providerId = PLATFORM_TO_PROVIDER[platform];
    const row = byProvider.get(providerId);
    const configured = Boolean(row?.client_id && row?.client_secret_encrypted);
    const enabled = Boolean(row?.enabled);
    return { platform, providerId, configured, enabled, available: configured && enabled };
  });
  return availability;
});

// Kick off OAuth: return the provider's auth URL. Browser will navigate there.
export const startOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ platform: platformSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const providerId = PLATFORM_TO_PROVIDER[data.platform];
    const { data: cfg } = await supabaseAdmin.from("oauth_provider_configs")
      .select("client_id, client_secret_encrypted, enabled").eq("provider", providerId).maybeSingle();
    if (!cfg?.client_id || !cfg?.client_secret_encrypted) {
      throw new Error("This provider has not been configured by the administrator.");
    }
    if (!cfg.enabled) throw new Error("This provider is currently disabled by the administrator.");

    const { randomToken } = await import("./oauth-crypto.server");
    const state = randomToken(24);
    const origin = requestOrigin();
    const redirectUri = callbackUrl(origin, data.platform);

    await supabaseAdmin.from("oauth_states").insert({
      state, user_id: context.userId, platform: data.platform, redirect_to: `${origin}/connections`,
    } as never);

    const spec = PROVIDERS[providerId];
    const scopes = spec.scopes[data.platform];
    const params = new URLSearchParams({
      client_id: cfg.client_id as string,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: scopes.join(providerId === "google" ? " " : ","),
    });
    if (spec.extraAuth) for (const [k, v] of Object.entries(spec.extraAuth)) params.set(k, v);
    return { url: `${spec.authUrl}?${params.toString()}` };
  });

export const listMyConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("platform_connections")
      .select("id, platform, account_label, account_id, avatar_url, profile_url, scopes, status, expires_at, metadata, last_error, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const disconnectPlatform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("platform_connections").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const selectDestinationAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    accountId: z.string(),
    accountLabel: z.string(),
    avatarUrl: z.string().url().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("platform_connections").update({
      account_id: data.accountId,
      account_label: data.accountLabel,
      avatar_url: data.avatarUrl ?? null,
    } as never).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
