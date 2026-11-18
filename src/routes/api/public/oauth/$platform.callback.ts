// OAuth callback: verify state, exchange code, fetch profile,
// encrypt tokens, upsert platform_connections, redirect to /connections.
import { createFileRoute } from "@tanstack/react-router";
import { PROVIDERS, PLATFORM_TO_PROVIDER, callbackUrl, fetchProfile, exchangeCode, exchangeMetaLongLivedToken, type PlatformId } from "@/lib/oauth-providers.server";

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
          let token = await exchangeCode({
            provider: providerId,
            clientId: cfg.client_id as string,
            clientSecret,
            code,
            redirectUri,
          });
          if (!token.access_token) return back("No access token returned");
          if (providerId === "meta") {
            const long = await exchangeMetaLongLivedToken({
              clientId: cfg.client_id as string, clientSecret, accessToken: token.access_token,
            });
            token = { ...token, access_token: long.access_token, expires_in: long.expires_in ?? 60 * 24 * 3600 };
          }

          const profile = await fetchProfile(platform, token.access_token);
          const spec = PROVIDERS[providerId];

          const { cipher: accCipher, iv: accIv } = await encryptSecret(token.access_token);
          const refresh = token.refresh_token
            ? await encryptSecret(token.refresh_token)
            : { cipher: null as string | null, iv: null as string | null };

          const expiresAt = token.expires_in
            ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;

          // Every account this login can post to becomes its own connection
          // (e.g. several Facebook Pages, or another YouTube channel added later).
          // Accounts already connected get fresh tokens; new ones count against
          // the plan's per-platform limit.
          const userId = stateRow.user_id as string;
          const found = (profile.accounts && profile.accounts.length > 0)
            ? profile.accounts
            : [{ id: profile.accountId, label: profile.accountLabel, avatarUrl: profile.avatarUrl, kind: "account", profileUrl: profile.profileUrl }];

          const { data: existing } = await supabaseAdmin.from("platform_connections")
            .select("account_id").eq("user_id", userId).eq("platform", platform);
          const existingIds = new Set((existing ?? []).map((r) => r.account_id as string));
          const { maxAccountsPerPlatform } = await import("@/lib/plan-access.server");
          const max = await maxAccountsPerPlatform(userId);
          let room = Math.max(0, max - existingIds.size);
          const toSave = found.filter((a) => {
            if (existingIds.has(a.id)) return true;
            if (room > 0) { room -= 1; return true; }
            return false;
          });
          const skipped = found.length - toSave.length;
          if (toSave.length === 0) {
            return back(`Your plan allows ${max} ${platform} account${max === 1 ? "" : "s"}. Disconnect one or upgrade to add more.`);
          }

          const rows = toSave.map((a) => ({
            user_id: userId,
            platform,
            account_id: a.id,
            account_label: a.label,
            avatar_url: a.avatarUrl ?? null,
            profile_url: a.profileUrl ?? null,
            scopes: spec.scopes[platform],
            status: "connected",
            expires_at: expiresAt,
            access_token_encrypted: accCipher,
            token_iv: accIv,
            refresh_token_encrypted: refresh.cipher,
            refresh_iv: refresh.iv,
            metadata: { kind: a.kind, login_account_id: profile.accountId },
            last_error: null,
          }));
          // Google only returns a refresh token on some consents; keep the old one otherwise.
          for (const row of rows) {
            if (!row.refresh_token_encrypted) {
              const { refresh_token_encrypted: _r, refresh_iv: _i, ...rest } = row;
              const { data: upd } = await supabaseAdmin.from("platform_connections")
                .update(rest as never).eq("user_id", userId).eq("platform", platform).eq("account_id", row.account_id).select("id");
              if (upd && upd.length > 0) continue;
            }
            const { error: upErr } = await supabaseAdmin.from("platform_connections")
              .upsert(row as never, { onConflict: "user_id,platform,account_id" });
            if (upErr) return back(upErr.message);
          }

          const names = toSave.map((a) => a.label).join(", ");
          const note = skipped > 0 ? ` (${skipped} more skipped: plan limit is ${max})` : "";
          return Response.redirect(`${origin}/connections?ok=${encodeURIComponent(`${platform}: ${names}${note}`)}`, 302);
        } catch (e) {
          return back(e instanceof Error ? e.message : "OAuth failed");
        }
      },
    },
  },
});
