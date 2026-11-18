// Real publishing to connected social accounts.
//
// runPublishJob(id) takes one scheduled_posts row, publishes it with the
// user's connected account and records the outcome:
//   published            → external_post_id / external_post_url set
//   publishing           → Instagram is still processing a video; the worker
//                          continues it on its next run (provider_state)
//   scheduled (retry)    → temporary error, retried up to MAX_ATTEMPTS times
//   failed               → permanent error, message in last_error
//   reconnect_required   → no usable connection / token expired
//
// Adapters: LinkedIn (text, image, video), Facebook Page (text, photo, video),
// Instagram Business (image, carousel, reel), YouTube (video upload).
import { GRAPH, PLATFORM_TO_PROVIDER, type PlatformId } from "./oauth-providers.server";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export const MAX_ATTEMPTS = 3;

export type JobRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  platform: string;
  connection_id: string | null;
  caption: string | null;
  hashtags: string | null;
  title: string | null;
  media_urls: unknown;
  attempts: number | null;
  status: string;
  provider_state: Record<string, unknown> | null;
};

type Outcome =
  | { kind: "published"; id: string; url: string | null }
  | { kind: "pending"; state: Record<string, unknown> }
  | { kind: "error"; message: string; retryable: boolean; reconnect?: boolean };

class PublishError extends Error {
  constructor(message: string, public retryable = false, public reconnect = false) { super(message); }
}

// ───────────────────────────── helpers ─────────────────────────────

type Media = { kind: "image" | "video"; url: string; mime: string };

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|$)/i;

function mediaKindFromUrl(url: string): "image" | "video" {
  if (url.startsWith("data:")) return url.startsWith("data:video") ? "video" : "image";
  return VIDEO_EXT.test(url) ? "video" : "image";
}

/** Storage object path when the URL points at this project's Supabase storage. */
function storagePath(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/([^?]+)/);
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
}

/**
 * Turn whatever the app stored (data: URL, expiring signed URL, public URL)
 * into a URL the social network can fetch for the next hour.
 */
async function resolveMedia(admin: Admin, userId: string, raw: string): Promise<Media> {
  const kind = mediaKindFromUrl(raw);
  if (raw.startsWith("data:")) {
    const m = raw.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
    if (!m) throw new PublishError("Unreadable media data");
    const mime = m[1];
    const bytes = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
    const path = `${userId}/publish/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from("renders").upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new PublishError(`Couldn't stage media for upload: ${error.message}`, true);
    const { data, error: sErr } = await admin.storage.from("renders").createSignedUrl(path, 3600);
    if (sErr || !data) throw new PublishError("Couldn't sign media URL", true);
    return { kind, url: data.signedUrl, mime };
  }
  const sp = storagePath(raw);
  if (sp) {
    const { data, error } = await admin.storage.from(sp.bucket).createSignedUrl(sp.path, 3600);
    if (!error && data) return { kind, url: data.signedUrl, mime: kind === "video" ? "video/mp4" : "image/jpeg" };
  }
  return { kind, url: raw, mime: kind === "video" ? "video/mp4" : "image/jpeg" };
}

async function fetchBytes(media: Media): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const r = await fetch(media.url);
  if (!r.ok) throw new PublishError(`Couldn't download media (${r.status})`, true);
  return { bytes: await r.arrayBuffer(), mime: r.headers.get("content-type") ?? media.mime };
}

function fullText(job: JobRow): string {
  const caption = (job.caption ?? "").trim();
  const tags = (job.hashtags ?? "").trim();
  if (!tags) return caption;
  // Don't repeat hashtags that are already in the caption.
  const missing = tags.split(/\s+/).filter((t) => t && !caption.includes(t)).join(" ");
  return missing ? `${caption}\n\n${missing}`.trim() : caption;
}

async function jsonOrThrow(res: Response, label: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try { j = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = (j.error as { message?: string; code?: number } | undefined);
    const msg = err?.message ?? (j.message as string | undefined) ?? text.slice(0, 300);
    const status = res.status;
    // 401/190 = token revoked or expired → user must reconnect.
    const reconnect = status === 401 || err?.code === 190;
    throw new PublishError(`${label}: ${msg || status}`, status >= 500 || status === 429, reconnect);
  }
  return j;
}

// ─────────────────────────── connections ───────────────────────────

type Conn = {
  id: string; account_id: string | null; account_label: string | null;
  accessToken: string; metadata: Record<string, unknown>;
};

async function loadConnection(admin: Admin, userId: string, platform: PlatformId, connectionId: string | null): Promise<Conn> {
  let q = admin.from("platform_connections")
    .select("id, account_id, account_label, status, expires_at, access_token_encrypted, token_iv, refresh_token_encrypted, refresh_iv, metadata")
    .eq("user_id", userId).eq("platform", platform);
  // A post targets one specific account; older posts fall back to the newest one.
  q = connectionId ? q.eq("id", connectionId) : q.order("updated_at", { ascending: false });
  const { data: row } = await q.limit(1).maybeSingle();
  if (!row || !row.access_token_encrypted || !row.token_iv) {
    throw new PublishError(
      connectionId
        ? `The ${platform} account for this post was disconnected. Reconnect it in Connected Accounts.`
        : `No ${platform} account connected. Connect it in Connected Accounts.`,
      false, true,
    );
  }
  const { decryptSecret, encryptSecret } = await import("./oauth-crypto.server");
  let accessToken = await decryptSecret(row.access_token_encrypted as string, row.token_iv as string);
  const expired = row.expires_at ? new Date(row.expires_at as string).getTime() < Date.now() + 60_000 : false;

  if (expired) {
    if (platform !== "youtube" || !row.refresh_token_encrypted || !row.refresh_iv) {
      await admin.from("platform_connections").update({ status: "expired", last_error: "Session expired" } as never).eq("id", row.id as string);
      throw new PublishError(`Your ${platform} connection expired. Reconnect it in Connected Accounts.`, false, true);
    }
    // Google: refresh the access token.
    const refresh = await decryptSecret(row.refresh_token_encrypted as string, row.refresh_iv as string);
    const { data: cfg } = await admin.from("oauth_provider_configs")
      .select("client_id, client_secret_encrypted, client_secret_iv").eq("provider", "google").maybeSingle();
    if (!cfg?.client_id || !cfg.client_secret_encrypted) throw new PublishError("Google app is not configured by the admin.");
    const secret = await decryptSecret(cfg.client_secret_encrypted as string, cfg.client_secret_iv as string);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: cfg.client_id as string, client_secret: secret }),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !j.access_token) {
      await admin.from("platform_connections").update({ status: "expired", last_error: j.error ?? "refresh failed" } as never).eq("id", row.id as string);
      throw new PublishError("YouTube access was revoked. Reconnect it in Connected Accounts.", false, true);
    }
    accessToken = j.access_token;
    const enc = await encryptSecret(accessToken);
    await admin.from("platform_connections").update({
      access_token_encrypted: enc.cipher, token_iv: enc.iv, status: "connected", last_error: null,
      expires_at: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(),
    } as never).eq("id", row.id as string);
  }
  return {
    id: row.id as string,
    account_id: (row.account_id as string | null) ?? null,
    account_label: (row.account_label as string | null) ?? null,
    accessToken,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}

// ───────────────────────────── LinkedIn ─────────────────────────────

/** LinkedIn versions live ~12 months; use the month two months back. */
function linkedInVersion(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** LinkedIn "little text": escape reserved characters, keep #hashtags as hashtags. */
export function linkedInCommentary(text: string): string {
  const parts = text.split(/(#[\p{L}\p{M}\p{N}_]+)/u);
  return parts.map((p) => {
    if (/^#[\p{L}\p{M}\p{N}_]+$/u.test(p)) return `{hashtag|\\#|${p.slice(1)}}`;
    return p.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
  }).join("");
}

async function publishLinkedIn(conn: Conn, job: JobRow, media: Media[]): Promise<Outcome> {
  const author = `urn:li:person:${conn.account_id}`;
  const headers = {
    Authorization: `Bearer ${conn.accessToken}`,
    "LinkedIn-Version": linkedInVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
  let mediaId: string | null = null;
  const first = media[0];
  if (first?.kind === "image") {
    const init = await jsonOrThrow(await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
      method: "POST", headers, body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    }), "LinkedIn image init");
    const v = init.value as { uploadUrl: string; image: string };
    const { bytes, mime } = await fetchBytes(first);
    const up = await fetch(v.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${conn.accessToken}`, "Content-Type": mime }, body: bytes });
    if (!up.ok) throw new PublishError(`LinkedIn image upload failed (${up.status})`, up.status >= 500);
    mediaId = v.image;
  } else if (first?.kind === "video") {
    const { bytes } = await fetchBytes(first);
    const init = await jsonOrThrow(await fetch("https://api.linkedin.com/rest/videos?action=initializeUpload", {
      method: "POST", headers,
      body: JSON.stringify({ initializeUploadRequest: { owner: author, fileSizeBytes: bytes.byteLength, uploadCaptions: false, uploadThumbnail: false } }),
    }), "LinkedIn video init");
    const v = init.value as { video: string; uploadToken?: string; uploadInstructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }> };
    const etags: string[] = [];
    for (const part of v.uploadInstructions) {
      const chunk = bytes.slice(part.firstByte, part.lastByte + 1);
      const up = await fetch(part.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: chunk });
      if (!up.ok) throw new PublishError(`LinkedIn video upload failed (${up.status})`, up.status >= 500);
      etags.push(up.headers.get("etag") ?? "");
    }
    await jsonOrThrow(await fetch("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
      method: "POST", headers,
      body: JSON.stringify({ finalizeUploadRequest: { video: v.video, uploadToken: v.uploadToken ?? "", uploadedPartIds: etags } }),
    }), "LinkedIn video finalize");
    mediaId = v.video;
  }

  const body: Record<string, unknown> = {
    author,
    commentary: linkedInCommentary(fullText(job)),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (mediaId) body.content = { media: { id: mediaId, ...(job.title ? { title: job.title.slice(0, 200) } : {}) } };
  const res = await fetch("https://api.linkedin.com/rest/posts", { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) await jsonOrThrow(res, "LinkedIn post");
  const urn = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id") ?? "";
  return { kind: "published", id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}` : null };
}

// ───────────────────────────── Meta ─────────────────────────────

async function pageToken(conn: Conn, pageId: string): Promise<string> {
  const j = await jsonOrThrow(
    await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(conn.accessToken)}`),
    "Facebook Page token",
  );
  const t = j.access_token as string | undefined;
  if (!t) throw new PublishError("Couldn't get permission to post on this Page. Reconnect Facebook and allow Page access.", false, true);
  return t;
}

async function graphPost(path: string, params: Record<string, string>, label: string, base = GRAPH) {
  return jsonOrThrow(await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  }), label);
}

async function publishFacebook(conn: Conn, job: JobRow, media: Media[]): Promise<Outcome> {
  const pageId = conn.account_id;
  if (!pageId) throw new PublishError("Pick a Facebook Page in Connected Accounts.", false, true);
  const token = await pageToken(conn, pageId);
  const text = fullText(job);
  const first = media[0];
  if (first?.kind === "video") {
    const r = await graphPost(`${pageId}/videos`, {
      file_url: first.url, description: text, ...(job.title ? { title: job.title.slice(0, 255) } : {}), access_token: token,
    }, "Facebook video", GRAPH.replace("graph.facebook.com", "graph-video.facebook.com"));
    const id = String(r.id ?? "");
    return { kind: "published", id, url: id ? `https://www.facebook.com/${pageId}/videos/${id}` : null };
  }
  if (media.length > 1) {
    const ids: string[] = [];
    for (const m of media.filter((x) => x.kind === "image").slice(0, 10)) {
      const r = await graphPost(`${pageId}/photos`, { url: m.url, published: "false", access_token: token }, "Facebook photo");
      ids.push(String(r.id));
    }
    const params: Record<string, string> = { message: text, access_token: token };
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
    const r = await graphPost(`${pageId}/feed`, params, "Facebook post");
    const id = String(r.id ?? "");
    return { kind: "published", id, url: id ? `https://www.facebook.com/${id}` : null };
  }
  if (first?.kind === "image") {
    const r = await graphPost(`${pageId}/photos`, { url: first.url, caption: text, access_token: token }, "Facebook photo");
    const id = String(r.post_id ?? r.id ?? "");
    return { kind: "published", id, url: id ? `https://www.facebook.com/${id}` : null };
  }
  const r = await graphPost(`${pageId}/feed`, { message: text, access_token: token }, "Facebook post");
  const id = String(r.id ?? "");
  return { kind: "published", id, url: id ? `https://www.facebook.com/${id}` : null };
}

async function igContainerStatus(conn: Conn, containerId: string): Promise<string> {
  const j = await jsonOrThrow(
    await fetch(`${GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(conn.accessToken)}`),
    "Instagram status",
  );
  const code = String(j.status_code ?? "");
  if (code === "ERROR" || code === "EXPIRED") {
    throw new PublishError(`Instagram couldn't process the media: ${String(j.status ?? code)}`);
  }
  return code; // IN_PROGRESS | FINISHED | PUBLISHED
}

async function igFinish(conn: Conn, igId: string, containerId: string): Promise<Outcome> {
  const r = await graphPost(`${igId}/media_publish`, { creation_id: containerId, access_token: conn.accessToken }, "Instagram publish");
  const mediaId = String(r.id ?? "");
  let url: string | null = null;
  if (mediaId) {
    const p = await fetch(`${GRAPH}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(conn.accessToken)}`);
    const pj = (await p.json().catch(() => ({}))) as { permalink?: string };
    url = pj.permalink ?? null;
  }
  return { kind: "published", id: mediaId, url };
}

async function waitForContainer(conn: Conn, containerId: string, maxMs: number): Promise<boolean> {
  const until = Date.now() + maxMs;
  while (Date.now() < until) {
    const code = await igContainerStatus(conn, containerId);
    if (code === "FINISHED") return true;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

async function publishInstagram(conn: Conn, job: JobRow, media: Media[]): Promise<Outcome> {
  const igId = conn.account_id;
  if (!igId) throw new PublishError("Pick an Instagram Business account in Connected Accounts.", false, true);
  const state = job.provider_state ?? {};

  // Resume a container that was still processing on the last run.
  if (typeof state.ig_container === "string") {
    const done = await waitForContainer(conn, state.ig_container, 40_000);
    return done ? igFinish(conn, igId, state.ig_container) : { kind: "pending", state };
  }

  if (media.length === 0) throw new PublishError("Instagram needs an image or a video. Text-only posts aren't supported.");
  const caption = fullText(job).slice(0, 2200);
  const token = conn.accessToken;
  let container: string;

  if (media.length > 1) {
    const children: string[] = [];
    for (const m of media.slice(0, 10)) {
      const r = await graphPost(`${igId}/media`, m.kind === "video"
        ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true", access_token: token }
        : { image_url: m.url, is_carousel_item: "true", access_token: token }, "Instagram carousel item");
      children.push(String(r.id));
    }
    for (const c of children) await waitForContainer(conn, c, 30_000);
    const r = await graphPost(`${igId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption, access_token: token }, "Instagram carousel");
    container = String(r.id);
  } else if (media[0].kind === "video") {
    const r = await graphPost(`${igId}/media`, { media_type: "REELS", video_url: media[0].url, caption, share_to_feed: "true", access_token: token }, "Instagram reel");
    container = String(r.id);
  } else {
    const r = await graphPost(`${igId}/media`, { image_url: media[0].url, caption, access_token: token }, "Instagram image");
    container = String(r.id);
  }

  const done = await waitForContainer(conn, container, 45_000);
  if (!done) return { kind: "pending", state: { ...state, ig_container: container } };
  return igFinish(conn, igId, container);
}

// ───────────────────────────── YouTube ─────────────────────────────

async function publishYouTube(conn: Conn, job: JobRow, media: Media[]): Promise<Outcome> {
  const video = media.find((m) => m.kind === "video");
  if (!video) throw new PublishError("YouTube needs a rendered video. Render the video first.");
  const { bytes, mime } = await fetchBytes(video);
  const text = fullText(job);
  const title = (job.title?.trim() || text.split("\n")[0] || "New video").replace(/[<>]/g, "").slice(0, 100);
  const tags = (job.hashtags ?? "").split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean).slice(0, 15);
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mime.startsWith("video/") ? mime : "video/mp4",
      "X-Upload-Content-Length": String(bytes.byteLength),
    },
    body: JSON.stringify({
      snippet: { title, description: text.replace(/[<>]/g, "").slice(0, 5000), tags, categoryId: "22" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  if (!init.ok) await jsonOrThrow(init, "YouTube upload init");
  const location = init.headers.get("location");
  if (!location) throw new PublishError("YouTube didn't return an upload URL", true);
  const up = await fetch(location, { method: "PUT", headers: { "Content-Type": mime }, body: bytes });
  const j = await jsonOrThrow(up, "YouTube upload");
  const id = String(j.id ?? "");
  return { kind: "published", id, url: id ? `https://www.youtube.com/watch?v=${id}` : null };
}

// ───────────────────────────── runner ─────────────────────────────

async function publish(admin: Admin, job: JobRow): Promise<Outcome> {
  const platform = job.platform as PlatformId;
  if (!(platform in PLATFORM_TO_PROVIDER)) throw new PublishError(`Unsupported platform: ${job.platform}`);
  const conn = await loadConnection(admin, job.user_id, platform, job.connection_id);
  const urls = Array.isArray(job.media_urls) ? (job.media_urls as unknown[]).filter((u): u is string => typeof u === "string" && !!u) : [];
  const media = job.provider_state?.ig_container ? [] : await Promise.all(urls.map((u) => resolveMedia(admin, job.user_id, u)));
  switch (platform) {
    case "linkedin": return publishLinkedIn(conn, job, media);
    case "facebook": return publishFacebook(conn, job, media);
    case "instagram": return publishInstagram(conn, job, media);
    case "youtube": return publishYouTube(conn, job, media);
  }
}

const JOB_COLUMNS = "id, user_id, project_id, platform, connection_id, caption, hashtags, title, media_urls, attempts, status, provider_state";

/**
 * Claim and publish one job. Safe to call from the worker and from
 * "Publish now": the claim only succeeds for a job that isn't already running
 * (or that has been stuck in `publishing` for over 10 minutes).
 */
export async function runPublishJob(admin: Admin, id: string): Promise<{
  status: string; url: string | null; error: string | null;
}> {
  const { data: row } = await admin.from("scheduled_posts").select(JOB_COLUMNS).eq("id", id).maybeSingle();
  if (!row) return { status: "missing", url: null, error: "Post not found" };
  const job = row as unknown as JobRow;

  const resuming = job.status === "publishing" && typeof job.provider_state?.ig_container === "string";
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const claim = admin.from("scheduled_posts").update({ status: "publishing" } as never).eq("id", id);
  const { data: claimed } = await (resuming
    ? claim.eq("status", "publishing")
    : claim.or(`status.in.(scheduled,ready,failed,reconnect_required),and(status.eq.publishing,updated_at.lt.${stale})`)
  ).select("id");
  if (!claimed || claimed.length === 0) return { status: job.status, url: null, error: "Already publishing" };

  const attempts = (job.attempts ?? 0) + (resuming ? 0 : 1);
  let outcome: Outcome;
  try {
    outcome = await publish(admin, job);
  } catch (e) {
    const pe = e instanceof PublishError ? e : new PublishError(e instanceof Error ? e.message : String(e), true);
    outcome = { kind: "error", message: pe.message, retryable: pe.retryable, reconnect: pe.reconnect };
  }

  const now = new Date().toISOString();
  if (outcome.kind === "published") {
    await admin.from("scheduled_posts").update({
      status: "published", attempts, last_error: null, published_at: now,
      external_post_id: outcome.id || null, external_post_url: outcome.url, provider_state: {},
    } as never).eq("id", id);
    if (job.project_id) {
      const { data: proj } = await admin.from("projects").select("platform_urls").eq("id", job.project_id).maybeSingle();
      const urls = { ...((proj?.platform_urls as Record<string, string> | null) ?? {}) };
      if (outcome.url) urls[job.platform] = outcome.url;
      await admin.from("projects").update({ publish_status: "published", platform_urls: urls } as never).eq("id", job.project_id);
    }
    return { status: "published", url: outcome.url, error: null };
  }
  if (outcome.kind === "pending") {
    await admin.from("scheduled_posts").update({
      status: "publishing", attempts, provider_state: outcome.state, last_error: "Instagram is still processing the video",
    } as never).eq("id", id);
    return { status: "publishing", url: null, error: null };
  }
  const retry = outcome.retryable && attempts < MAX_ATTEMPTS;
  const status = outcome.reconnect ? "reconnect_required" : retry ? "scheduled" : "failed";
  await admin.from("scheduled_posts").update({
    status, attempts, last_error: outcome.message,
    ...(retry ? { scheduled_at: new Date(Date.now() + attempts * 5 * 60_000).toISOString() } : {}),
  } as never).eq("id", id);
  if (job.project_id && !retry) {
    await admin.from("projects").update({ publish_status: status } as never).eq("id", job.project_id);
  }
  return { status, url: null, error: outcome.message };
}

/** Worker entry: publish everything that is due (bounded per run). */
export async function runDuePublishJobs(admin: Admin, limit = 10): Promise<{ processed: number; results: Array<{ id: string; status: string }> }> {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data: due } = await admin.from("scheduled_posts").select("id")
    .or(`and(status.in.(scheduled,ready),or(scheduled_at.is.null,scheduled_at.lte.${now})),and(status.eq.publishing,updated_at.lt.${stale})`)
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  const results: Array<{ id: string; status: string }> = [];
  for (const r of due ?? []) {
    const out = await runPublishJob(admin, r.id as string);
    results.push({ id: r.id as string, status: out.status });
  }
  return { processed: results.length, results };
}
