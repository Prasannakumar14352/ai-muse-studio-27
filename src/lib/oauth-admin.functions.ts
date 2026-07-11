// Admin-only server functions for managing OAuth provider configs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const providerSchema = z.enum(["meta", "google", "linkedin"]);

async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

// List all provider configs (client_id shown, secret NEVER returned — only "configured" boolean).
export const listOAuthProviderConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("oauth_provider_configs")
      .select("provider, client_id, client_secret_encrypted, enabled, last_test_at, last_test_ok, last_test_error, updated_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      provider: r.provider as string,
      clientId: (r.client_id as string) ?? "",
      hasSecret: Boolean(r.client_secret_encrypted),
      enabled: Boolean(r.enabled),
      lastTestAt: r.last_test_at as string | null,
      lastTestOk: r.last_test_ok as boolean | null,
      lastTestError: r.last_test_error as string | null,
      updatedAt: r.updated_at as string,
    }));
  });

export const saveOAuthProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    provider: providerSchema,
    clientId: z.string().trim().optional(),
    clientSecret: z.string().trim().optional(), // if omitted or empty, keep existing
    enabled: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: context.userId };
    if (data.clientId !== undefined) patch.client_id = data.clientId || null;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.clientSecret && data.clientSecret.length > 0) {
      const { encryptSecret } = await import("./oauth-crypto.server");
      const { cipher, iv } = await encryptSecret(data.clientSecret);
      patch.client_secret_encrypted = cipher;
      patch.client_secret_iv = iv;
    }
    const { error } = await supabaseAdmin
      .from("oauth_provider_configs")
      .upsert({ provider: data.provider, ...patch } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Test config by verifying credentials with a lightweight endpoint per provider.
export const testOAuthProviderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ provider: providerSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("oauth_provider_configs").select("*").eq("provider", data.provider).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.client_id || !row?.client_secret_encrypted) {
      return { ok: false, error: "Missing Client ID or Client Secret." };
    }
    let ok = false; let msg = "";
    try {
      const { decryptSecret } = await import("./oauth-crypto.server");
      const secret = await decryptSecret(row.client_secret_encrypted as string, row.client_secret_iv as string);
      if (data.provider === "meta") {
        // client_credentials app-access-token endpoint
        const r = await fetch(`https://graph.facebook.com/oauth/access_token?client_id=${encodeURIComponent(row.client_id as string)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`);
        const j = await r.json();
        ok = r.ok && Boolean(j.access_token);
        if (!ok) msg = j.error?.message ?? `HTTP ${r.status}`;
      } else if (data.provider === "google") {
        // Google has no cheap credential-verify. Do a discovery ping to ensure client_id looks like Google.
        ok = (row.client_id as string).endsWith(".apps.googleusercontent.com") && secret.length > 8;
        if (!ok) msg = "Client ID must end with .apps.googleusercontent.com and a client secret must be set.";
      } else if (data.provider === "linkedin") {
        const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "client_credentials", client_id: row.client_id as string, client_secret: secret }),
        });
        // LinkedIn returns 400 "unauthorized_client" if credentials invalid, 200 or "invalid_grant_type" if credentials are correct
        const j = await r.json().catch(() => ({}));
        ok = r.status !== 401 && j.error !== "invalid_client" && j.error !== "unauthorized_client";
        if (!ok) msg = j.error_description ?? j.error ?? `HTTP ${r.status}`;
      }
    } catch (e) {
      ok = false; msg = e instanceof Error ? e.message : String(e);
    }
    await supabaseAdmin.from("oauth_provider_configs").update({
      last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_error: ok ? null : msg,
    } as never).eq("provider", data.provider);
    return { ok, error: ok ? undefined : msg };
  });
