// OAuth callback: verify state, exchange code, fetch profile,
// encrypt tokens, upsert platform_connections, redirect to /connections.
import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS, PLATFORM_TO_PROVIDER, callbackUrl, fetchProfile, exchangeCode, type PlatformId } from "@/lib/oauth-providers.server";

export const Route = createFileRoute("/api/public/oauth/$platform/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const platform = params.platform as PlatformId;
        if (!["instagram", "facebook", "youtube", "linkedin"].includes(platform)) {
          return new Response("Unknown platform", { status: 400 });
        }
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const origin = (() => {
          const fh = request.headers.get("x-forwarded-host");
          const fp = request.headers.get("x-forwarded-proto") ?? "https";
          return fh ? `${fp}://${fh}` : url.origin;
        })();
        const back = (msg: string, ok = false) =>
          Response.redirect(`${origin}/connections?${ok ? "ok" : "err"}=${encodeURIComponent(`${platform}:${msg}`)}`, 302);

        if (errorParam) return back(errorParam);
        if (!code || !state) return back("Missing code or state");

        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("oauth_states").select("*").eq("state", state).maybeSingle();
        if (stateErr || !stateRow) return back("Invalid or expired state");
        if (stateRow.platform !== platform) return back("State/platform mismatch");
        await supabaseAdmin.from("oauth_states").delete().eq("state", state);

        const providerId = PLATFORM_TO_PROVIDER[platform];
        const { data: cfg } = await supabaseAdmin.from("oauth_provider_configs")
          .select("client_id, client_secret_encrypted, client_secret_iv, enabled").eq("provider", providerId).maybeSingle();
        if (!cfg?.client_id || !cfg?.client_secret_encrypted || !cfg?.enabled) {
          return back("Provider not configured or disabled");
        }
        const { decryptSecret, encryptSecret } = await import("@/lib/oauth-crypto.server");
        let clientSecret: string;
        try {
          clientSecret = await decryptSecret(cfg.client_secret_encrypted as string, cfg.client_secret_iv as string);
        } catch {
          return back("Failed to decrypt admin secret");
        }

        try {
          const redirectUri = callbackUrl(origin, platform);
          const token = await exchangeCode({
            provider: providerId,
            clientId: cfg.client_id as string,
            clientSecret,
            code,
            redirectUri,
          });
          if (!token.access_token) return back("No access token returned");

          const profile = await fetchProfile(platform, token.access_token);
          const spec = PROVIDERS[providerId];

          const { cipher: accCipher, iv: accIv } = await encryptSecret(token.access_token);
          const refresh = token.refresh_token
            ? await encryptSecret(token.refresh_token)
            : { cipher: null as string | null, iv: null as string | null };

          const expiresAt = token.expires_in
            ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;

          await supabaseAdmin.from("platform_connections").upsert({
            user_id: stateRow.user_id as string,
            platform,
            account_id: profile.accountId,
            account_label: profile.accountLabel,
            avatar_url: profile.avatarUrl ?? null,
            profile_url: profile.profileUrl ?? null,
            scopes: spec.scopes[platform],
            status: "connected",
            expires_at: expiresAt,
            access_token_encrypted: accCipher,
            token_iv: accIv,
            refresh_token_encrypted: refresh.cipher,
            refresh_iv: refresh.iv,
            metadata: { accounts: profile.accounts ?? [] },
            last_error: null,
          } as never, { onConflict: "user_id,platform,account_id" });

          return Response.redirect(`${origin}/connections?ok=${encodeURIComponent(platform)}`, 302);
        } catch (e) {
          return back(e instanceof Error ? e.message : "OAuth failed");
        }
      },
    },
  },
});
