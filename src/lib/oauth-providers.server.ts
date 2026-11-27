// Provider definitions for admin-managed OAuth (Meta, Google, LinkedIn).
// Instagram + Facebook share a single "meta" provider config (same Client ID/Secret).
/** Meta Graph API version used for login, profile lookups and publishing. */
export const GRAPH_VERSION = "v23.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type PlatformId = "instagram" | "facebook" | "youtube" | "linkedin";
export type ProviderId = "meta" | "google" | "linkedin";

export const PLATFORM_TO_PROVIDER: Record<PlatformId, ProviderId> = {
  instagram: "meta",
  facebook: "meta",
  youtube: "google",
  linkedin: "linkedin",
};

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  authUrl: string;
  tokenUrl: string;
  scopes: Record<PlatformId, string[]>;
  extraAuth?: Record<string, string>;
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  meta: {
    id: "meta",
    label: "Meta (Instagram + Facebook)",
    authUrl: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`,
    tokenUrl: `${GRAPH}/oauth/access_token`,
    scopes: {
      instagram: [
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
        "business_management",
      ],
      facebook: [
        "pages_show_list",
        "pages_manage_posts",
        "pages_read_engagement",
        "public_profile",
      ],
      youtube: [],
      linkedin: [],
    },
  },
  google: {
    id: "google",
    label: "Google (YouTube)",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: {
      youtube: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload",
        "openid",
        "email",
        "profile",
      ],
      instagram: [], facebook: [], linkedin: [],
    },
    extraAuth: { access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true" },
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: {
      linkedin: ["openid", "profile", "email", "w_member_social"],
      instagram: [], facebook: [], youtube: [],
    },
  },
};

export function callbackUrl(origin: string, platform: PlatformId): string {
  return `${origin.replace(/\/$/, "")}/api/public/oauth/${platform}/callback`;
}

// Exchange authorization code → access token (+ refresh token when applicable).
export async function exchangeCode(args: {
  provider: ProviderId;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }> {
  const { provider, clientId, clientSecret, code, redirectUri } = args;
  const spec = PROVIDERS[provider];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(spec.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Token exchange failed [${res.status}]: ${text}`);
  try { return JSON.parse(text); }
  catch { // Meta sometimes returns urlencoded
    const p = new URLSearchParams(text);
    return {
      access_token: p.get("access_token") ?? "",
      refresh_token: p.get("refresh_token") ?? undefined,
      expires_in: p.get("expires_in") ? Number(p.get("expires_in")) : undefined,
    };
  }
}

// Meta returns a ~1-hour user token. Swap it for a ~60-day one so scheduled
// posts still work later; Page tokens derived from it don't expire.
export async function exchangeMetaLongLivedToken(args: {
  clientId: string; clientSecret: string; accessToken: string;
}): Promise<{ access_token: string; expires_in?: number }> {
  const q = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    fb_exchange_token: args.accessToken,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${q}`);
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || !j.access_token) throw new Error(`Meta long-lived token exchange failed: ${j.error?.message ?? res.status}`);
  return { access_token: j.access_token, expires_in: j.expires_in };
}

// Fetch profile / eligible destinations for a platform after token exchange.
export async function fetchProfile(platform: PlatformId, accessToken: string): Promise<{
  accountId: string;
  accountLabel: string;
  avatarUrl?: string;
  profileUrl?: string;
  accounts?: Array<{ id: string; label: string; avatarUrl?: string; kind: string; profileUrl?: string; pageId?: string }>;
}> {
  if (platform === "youtube") {
    const r = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const j = await r.json();
    if (!r.ok) throw new Error(`YouTube profile failed: ${JSON.stringify(j)}`);
    const items = (j.items ?? []) as Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url?: string } } } }>;
    if (items.length === 0) throw new Error("No YouTube channel found on this Google account.");
    const primary = items[0];
    return {
      accountId: primary.id,
      accountLabel: primary.snippet.title,
      avatarUrl: primary.snippet.thumbnails?.default?.url,
      profileUrl: `https://www.youtube.com/channel/${primary.id}`,
      accounts: items.map((c) => ({
        id: c.id, label: c.snippet.title,
        avatarUrl: c.snippet.thumbnails?.default?.url, kind: "channel",
        profileUrl: `https://www.youtube.com/channel/${c.id}`,
      })),
    };
  }
  if (platform === "linkedin") {
    const r = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(`LinkedIn profile failed: ${JSON.stringify(j)}`);
    return {
      accountId: j.sub,
      accountLabel: j.name ?? j.email ?? "LinkedIn member",
      avatarUrl: j.picture,
      profileUrl: undefined,
      accounts: [{ id: j.sub, label: j.name ?? j.email ?? "LinkedIn member", avatarUrl: j.picture, kind: "person", profileUrl: undefined }],
    };
  }
  // Facebook / Instagram — list Pages, then optional IG business account per Page.
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,picture,instagram_business_account{id,username,name,profile_picture_url}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const pagesJ = await pagesRes.json();
  if (!pagesRes.ok) throw new Error(`Meta pages failed: ${JSON.stringify(pagesJ)}`);
  const pages = (pagesJ.data ?? []) as Array<{
    id: string; name: string; access_token?: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
  }>;
  if (platform === "facebook") {
    if (pages.length === 0) throw new Error("No Facebook Pages found. You need at least one Page to publish.");
    const p = pages[0];
    return {
      accountId: p.id,
      accountLabel: p.name,
      avatarUrl: p.picture?.data?.url,
      profileUrl: `https://facebook.com/${p.id}`,
      accounts: pages.map((pg) => ({ id: pg.id, label: pg.name, avatarUrl: pg.picture?.data?.url, kind: "page", profileUrl: `https://facebook.com/${pg.id}` })),
    };
  }
  // instagram
  const igs = pages.filter((p) => p.instagram_business_account).map((p) => ({
    id: p.instagram_business_account!.id,
    label: p.instagram_business_account!.username ?? p.instagram_business_account!.name ?? p.name,
    avatarUrl: p.instagram_business_account!.profile_picture_url,
    kind: "instagram_business",
    pageId: p.id,
    profileUrl: p.instagram_business_account!.username ? `https://instagram.com/${p.instagram_business_account!.username}` : undefined,
  }));
  if (igs.length === 0) throw new Error("No Instagram Business account linked to your Facebook Pages.");
  return {
    accountId: igs[0].id,
    accountLabel: igs[0].label,
    avatarUrl: igs[0].avatarUrl,
    profileUrl: `https://instagram.com/${igs[0].label}`,
    accounts: igs,
  };
}

/** Permissions the user actually granted to a Meta token (Meta grants are cumulative). */
export async function fetchMetaGrantedScopes(accessToken: string): Promise<string[] | null> {
  try {
    const r = await fetch(`${GRAPH}/me/permissions`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = (await r.json()) as { data?: Array<{ permission: string; status: string }> };
    if (!r.ok || !Array.isArray(j.data)) return null;
    return j.data.filter((x) => x.status === "granted").map((x) => x.permission);
  } catch {
    return null;
  }
}
