// Auto DM engine (server only): Meta webhook handling, rule matching, and the
// send queue. Instagram is reached through its linked Facebook Page (Messenger
// Platform), so both platforms use Page access tokens on graph.facebook.com.
//
// Meta rules enforced here:
//  • one private reply per comment, and only within 7 days of the comment
//  • free-form DMs only within 24 h of the person's last message to the account
//  • per-account hourly caps kept under Meta's limits (750 private replies/h,
//    200 general calls/h)
import { createHmac, timingSafeEqual } from "node:crypto";
import { GRAPH } from "./oauth-providers.server";

/* eslint-disable @typescript-eslint/no-explicit-any -- auto-DM tables are not in the generated types yet */
type Db = any;

const DAY = 24 * 3600 * 1000;
const PRIVATE_REPLY_WINDOW_MS = 7 * DAY;
const DM_WINDOW_MS = DAY;
const HOURLY_CAP: Record<string, number> = { private_reply: 700, dm: 180, public_reply: 180 };
const MAX_ATTEMPTS = 3;

/** Extra Meta scopes needed for Auto DM (requested only when connecting from the Auto DM page). */
export const DM_SCOPES: Record<"instagram" | "facebook", string[]> = {
  instagram: [
    "instagram_basic",
    "instagram_manage_messages",
    "instagram_manage_comments",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
    "business_management",
  ],
  facebook: [
    "pages_show_list",
    "pages_read_engagement",
    "pages_messaging",
    "pages_manage_metadata",
    "pages_manage_engagement",
    "pages_read_user_content",
  ],
};

export function hasDmScopes(platform: string, scopes: string[] | null | undefined): boolean {
  if (platform !== "instagram" && platform !== "facebook") return false;
  const have = new Set(scopes ?? []);
  return DM_SCOPES[platform].every((s) => have.has(s));
}

async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Db;
}

// ── Meta app secret + webhook signature ────────────────────────────────

let secretCache: { value: string | null; at: number } | null = null;

export async function getMetaAppSecret(): Promise<string | null> {
  if (secretCache && Date.now() - secretCache.at < 5 * 60_000) return secretCache.value;
  const value = await loadMetaAppSecret();
  secretCache = { value, at: Date.now() };
  return value;
}

async function loadMetaAppSecret(): Promise<string | null> {
  const db = await adminDb();
  const { data: cfg } = await db
    .from("oauth_provider_configs")
    .select("client_secret_encrypted, client_secret_iv, enabled")
    .eq("provider", "meta")
    .maybeSingle();
  if (!cfg?.client_secret_encrypted || !cfg?.client_secret_iv) return null;
  const { decryptSecret } = await import("./oauth-crypto.server");
  try {
    return await decryptSecret(cfg.client_secret_encrypted, cfg.client_secret_iv);
  } catch {
    return null;
  }
}

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(rawBody, appSecret). */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ── Tokens ─────────────────────────────────────────────────────────────

type Conn = {
  id: string;
  user_id: string;
  platform: string;
  account_id: string;
  account_label: string | null;
  status: string;
  dm_enabled: boolean;
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
  access_token_encrypted: string | null;
  token_iv: string | null;
};

const CONN_COLS =
  "id, user_id, platform, account_id, account_label, status, dm_enabled, scopes, metadata, access_token_encrypted, token_iv";

export async function loadConnection(id: string): Promise<Conn | null> {
  const db = await adminDb();
  const { data } = await db
    .from("platform_connections")
    .select(CONN_COLS)
    .eq("id", id)
    .maybeSingle();
  return (data as Conn | null) ?? null;
}

async function graphJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(6_000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.error) {
    const e = j?.error ?? {};
    const err = new Error(e.message ?? `Meta API error ${res.status}`) as Error & {
      code?: number;
      subcode?: number;
    };
    err.code = e.code;
    err.subcode = e.error_subcode;
    throw err;
  }
  return j;
}

/** Page id behind a connection (the Page itself, or the Page an Instagram account is linked to). */
async function resolvePage(
  conn: Conn,
  userToken: string,
): Promise<{ pageId: string; pageToken: string }> {
  const pageIdHint =
    conn.platform === "facebook"
      ? conn.account_id
      : typeof conn.metadata?.page_id === "string"
        ? conn.metadata.page_id
        : null;
  if (pageIdHint) {
    const j = await graphJson(`${GRAPH}/${encodeURIComponent(pageIdHint)}?fields=access_token`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    if (j.access_token) return { pageId: pageIdHint, pageToken: j.access_token };
  }
  const j = await graphJson(
    `${GRAPH}/me/accounts?fields=id,access_token,instagram_business_account{id}&limit=100`,
    {
      headers: { Authorization: `Bearer ${userToken}` },
    },
  );
  const pages = (j.data ?? []) as Array<{
    id: string;
    access_token?: string;
    instagram_business_account?: { id: string };
  }>;
  const page =
    conn.platform === "facebook"
      ? pages.find((p) => p.id === conn.account_id)
      : pages.find((p) => p.instagram_business_account?.id === conn.account_id);
  if (!page?.access_token)
    throw new Error("Couldn't find the Facebook Page for this account. Reconnect it from Auto DM.");
  if (conn.platform === "instagram" && conn.metadata?.page_id !== page.id) {
    const db = await adminDb();
    await db
      .from("platform_connections")
      .update({ metadata: { ...(conn.metadata ?? {}), page_id: page.id } })
      .eq("id", conn.id);
  }
  return { pageId: page.id, pageToken: page.access_token };
}

const pageCache = new Map<string, { pageId: string; pageToken: string; at: number }>();

export async function pageTokenFor(conn: Conn): Promise<{ pageId: string; pageToken: string }> {
  const hit = pageCache.get(conn.id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  if (!conn.access_token_encrypted || !conn.token_iv)
    throw new Error("Account token missing. Reconnect it from Auto DM.");
  const { decryptSecret } = await import("./oauth-crypto.server");
  const userToken = await decryptSecret(conn.access_token_encrypted, conn.token_iv);
  const r = await resolvePage(conn, userToken);
  pageCache.set(conn.id, { ...r, at: Date.now() });
  return r;
}

/** Subscribe (or unsubscribe) the Page to this app's webhooks. */
export async function setPageSubscription(conn: Conn, on: boolean): Promise<void> {
  const { pageId, pageToken } = await pageTokenFor(conn);
  if (on) {
    const q = new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks,feed" });
    await graphJson(`${GRAPH}/${pageId}/subscribed_apps?${q}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pageToken}` },
    });
  } else {
    // Keep the subscription if another Auto DM account (the IG account on this
    // Page, or another user's connection) still relies on it.
    const db = await adminDb();
    const { data: others } = await db
      .from("platform_connections")
      .select("id, platform, account_id, metadata")
      .eq("dm_enabled", true)
      .neq("id", conn.id);
    const stillUsed = ((others ?? []) as Conn[]).some((o) =>
      o.platform === "facebook" ? o.account_id === pageId : o.metadata?.page_id === pageId,
    );
    if (stillUsed) return;
    await graphJson(`${GRAPH}/${pageId}/subscribed_apps`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${pageToken}` },
    }).catch(() => undefined);
  }
}

/** Recent posts/reels so a rule can target one. */
export async function listRecentMedia(
  conn: Conn,
): Promise<Array<{ id: string; caption: string; thumb?: string; permalink?: string }>> {
  const { pageId, pageToken } = await pageTokenFor(conn);
  if (conn.platform === "instagram") {
    const j = await graphJson(
      `${GRAPH}/${conn.account_id}/media?fields=id,caption,media_type,thumbnail_url,media_url,permalink&limit=25`,
      {
        headers: { Authorization: `Bearer ${pageToken}` },
      },
    );
    return (j.data ?? []).map((m: any) => ({
      id: m.id,
      caption: String(m.caption ?? "").slice(0, 120),
      thumb: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url : undefined),
      permalink: m.permalink,
    }));
  }
  const j = await graphJson(
    `${GRAPH}/${pageId}/posts?fields=id,message,full_picture,permalink_url&limit=25`,
    {
      headers: { Authorization: `Bearer ${pageToken}` },
    },
  );
  return (j.data ?? []).map((p: any) => ({
    id: p.id,
    caption: String(p.message ?? "").slice(0, 120),
    thumb: p.full_picture,
    permalink: p.permalink_url,
  }));
}

// ── Rule matching ──────────────────────────────────────────────────────

type Rule = {
  id: string;
  user_id: string;
  connection_id: string;
  trigger: string;
  media_id: string | null;
  keywords: string[];
  match_mode: string;
  dm_text: string;
  link_url: string | null;
  public_replies: string[];
};

function norm(s: string): string {
  return s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
}

export function ruleMatches(
  rule: Pick<Rule, "trigger" | "keywords" | "match_mode" | "media_id">,
  text: string,
  mediaId?: string | null,
): boolean {
  if (rule.media_id && mediaId && rule.media_id !== mediaId) return false;
  if (rule.media_id && !mediaId) return false;
  if (rule.trigger === "any_comment") return true;
  const t = norm(text);
  if (!t) return false;
  const kws = (rule.keywords ?? []).map(norm).filter(Boolean);
  if (kws.length === 0) return false;
  if (rule.match_mode === "exact") return kws.some((k) => t === k);
  return kws.some((k) => {
    // whole-word match for Latin keywords; plain substring for other scripts (Telugu, Hindi…)
    if (/^[\p{Script=Latin}\d\s]+$/u.test(k)) {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\p{L}\\d])${esc}($|[^\\p{L}\\d])`, "u").test(t);
    }
    return t.includes(k);
  });
}

function composeDm(rule: Rule): string {
  return rule.link_url ? `${rule.dm_text}\n\n${rule.link_url}` : rule.dm_text;
}

// ── Webhook intake ─────────────────────────────────────────────────────

type Intake = {
  kind: "comment" | "message";
  platform: "instagram" | "facebook";
  accountId: string; // IG account id / Page id the event is for
  eventKey: string; // comment id / message mid
  fromId: string;
  fromName?: string;
  text: string;
  mediaId?: string | null;
  at: number;
  payload: unknown;
};

/** Turn a Meta webhook body into the events Auto DM cares about. */
export function parseWebhook(body: any): Intake[] {
  const out: Intake[] = [];
  const platform =
    body?.object === "instagram" ? "instagram" : body?.object === "page" ? "facebook" : null;
  if (!platform) return out;
  for (const entry of body.entry ?? []) {
    const accountId = String(entry.id ?? "");
    for (const m of entry.messaging ?? []) {
      const msg = m.message;
      if (!msg || msg.is_echo || !msg.mid) continue;
      const fromId = String(m.sender?.id ?? "");
      if (!fromId || fromId === accountId) continue;
      out.push({
        kind: "message",
        platform,
        accountId,
        eventKey: `msg:${msg.mid}`,
        fromId,
        text: String(msg.text ?? ""),
        at: Number(m.timestamp) || Date.now(),
        payload: m,
      });
    }
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      if (platform === "instagram" && ch.field === "comments" && v.id) {
        const fromId = String(v.from?.id ?? "");
        if (!fromId || fromId === accountId) continue;
        out.push({
          kind: "comment",
          platform,
          accountId,
          eventKey: `cmt:${v.id}`,
          fromId,
          fromName: v.from?.username,
          text: String(v.text ?? ""),
          mediaId: v.media?.id ?? null,
          at: Date.now(),
          payload: v,
        });
      }
      if (
        platform === "facebook" &&
        ch.field === "feed" &&
        v.item === "comment" &&
        v.verb === "add" &&
        v.comment_id
      ) {
        const fromId = String(v.from?.id ?? "");
        if (!fromId || fromId === accountId) continue;
        out.push({
          kind: "comment",
          platform,
          accountId,
          eventKey: `cmt:${v.comment_id}`,
          fromId,
          fromName: v.from?.name,
          text: String(v.message ?? ""),
          mediaId: v.post_id ?? null,
          at: v.created_time ? Number(v.created_time) * 1000 : Date.now(),
          payload: v,
        });
      }
    }
  }
  return out;
}

/**
 * Store events, match rules, queue sends. Returns queued send ids.
 * Throws on unexpected errors (after removing that event's dedupe row) so the
 * webhook can answer 5xx and Meta delivers the event again.
 */
export async function ingestEvents(events: Intake[]): Promise<string[]> {
  const db = await adminDb();
  const queued: string[] = [];
  for (const ev of events) {
    // Only rows the server subscribed (dm_subscribed_at is server-set). If two
    // users connect the same account, the first to switch Auto DM on owns it.
    const { data: conns, error: connErr } = await db
      .from("platform_connections")
      .select(CONN_COLS)
      .eq("platform", ev.platform)
      .eq("account_id", ev.accountId)
      .eq("dm_enabled", true)
      .not("dm_subscribed_at", "is", null)
      .order("dm_subscribed_at", { ascending: true })
      .limit(1);
    if (connErr) throw new Error(connErr.message);
    const conn = (conns?.[0] as Conn | undefined) ?? null;

    // Dedupe: Meta may deliver the same event more than once.
    const eventKey = `${ev.platform}:${ev.eventKey}`;
    const { error: dupErr } = await db.from("dm_events").insert({
      event_key: eventKey,
      user_id: conn?.user_id ?? null,
      connection_id: conn?.id ?? null,
      kind: ev.kind,
      payload: ev.payload,
    });
    if (dupErr) {
      if (dupErr.code === "23505") continue; // already handled
      throw new Error(dupErr.message);
    }
    if (!conn) continue;
    try {
      queued.push(...(await processEvent(db, ev, conn)));
    } catch (e) {
      // Let Meta's retry reprocess it instead of the dedupe row swallowing it.
      await db.from("dm_events").delete().eq("event_key", eventKey);
      throw e;
    }
  }
  return queued;
}

function must<T extends { error: { message: string; code?: string } | null }>(r: T): T {
  if (r.error) throw new Error(r.error.message);
  return r;
}

async function processEvent(db: Db, ev: Intake, conn: Conn): Promise<string[]> {
  const { data: contact } = must(
    await db
      .from("dm_contacts")
      .upsert(
        {
          user_id: conn.user_id,
          connection_id: conn.id,
          platform_user_id: ev.fromId,
          ...(ev.fromName ? { username: ev.fromName } : {}),
          ...(ev.kind === "message" ? { last_inbound_at: new Date(ev.at).toISOString() } : {}),
        },
        { onConflict: "connection_id,platform_user_id" },
      )
      .select("id, opted_out")
      .maybeSingle(),
  );

  if (ev.kind === "message" && /^\s*(stop|unsubscribe)\s*$/i.test(ev.text)) {
    must(
      await db
        .from("dm_contacts")
        .update({ opted_out: true })
        .eq("connection_id", conn.id)
        .eq("platform_user_id", ev.fromId),
    );
    return [];
  }
  if (contact?.opted_out) return [];

  const { data: rules } = must(
    await db
      .from("dm_rules")
      .select(
        "id, user_id, connection_id, trigger, media_id, keywords, match_mode, dm_text, link_url, public_replies",
      )
      .eq("connection_id", conn.id)
      .eq("active", true)
      .order("created_at", { ascending: true }),
  );
  const triggers = ev.kind === "comment" ? ["comment_keyword", "any_comment"] : ["dm_keyword"];
  const rule = ((rules ?? []) as Rule[]).find(
    (r) => triggers.includes(r.trigger) && ruleMatches(r, ev.text, ev.mediaId),
  );
  if (!rule) return [];

  // DM keyword replies: at most one per person per rule per hour (no reply loops / spam).
  if (ev.kind === "message") {
    const { count } = must(
      await db
        .from("dm_sends")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", conn.id)
        .eq("rule_id", rule.id)
        .eq("recipient_id", ev.fromId)
        .eq("kind", "dm")
        .gte("created_at", new Date(Date.now() - 3600_000).toISOString()),
    );
    if ((count ?? 0) > 0) return [];
  }

  const commentId = ev.kind === "comment" ? ev.eventKey.slice(4) : null;
  const base = {
    user_id: conn.user_id,
    connection_id: conn.id,
    rule_id: rule.id,
    recipient_id: ev.fromId,
    recipient_name: ev.fromName ?? null,
    source_at: new Date(ev.at).toISOString(),
  };
  const rows: any[] = [];
  if (ev.kind === "comment") {
    rows.push({ ...base, kind: "private_reply", comment_id: commentId, text: composeDm(rule) });
    const replies = (rule.public_replies ?? []).map((t) => t.trim()).filter(Boolean);
    if (replies.length > 0) {
      rows.push({
        ...base,
        kind: "public_reply",
        comment_id: commentId,
        text: replies[Math.floor(Math.random() * replies.length)],
      });
    }
  } else {
    rows.push({ ...base, kind: "dm", text: composeDm(rule) });
  }
  const ids: string[] = [];
  for (const row of rows) {
    const { data: ins, error } = await db.from("dm_sends").insert(row).select("id").maybeSingle();
    if (error) {
      if (error.code === "23505") continue; // already queued for this comment
      throw new Error(error.message);
    }
    if (ins?.id) ids.push(ins.id as string);
  }
  return ids;
}

// ── Sending ────────────────────────────────────────────────────────────

type Send = {
  id: string;
  user_id: string;
  connection_id: string;
  kind: string;
  comment_id: string | null;
  recipient_id: string | null;
  text: string;
  attempts: number;
  source_at: string;
};

const PERMANENT_CODES = new Set([10, 100, 190, 200, 230, 551, 2018, 2534022]);

async function planAllows(userId: string, cache: Map<string, boolean>): Promise<boolean> {
  if (cache.has(userId)) return cache.get(userId)!;
  const { assertFeature } = await import("./plan-access.server");
  let ok = true;
  try {
    await assertFeature(userId, "auto_dm");
  } catch {
    ok = false;
  }
  cache.set(userId, ok);
  return ok;
}

async function finish(db: Db, id: string, fields: Record<string, unknown>) {
  await db.from("dm_sends").update(fields).eq("id", id);
}

async function sendOne(db: Db, s: Send, planCache: Map<string, boolean>): Promise<string> {
  const conn = await loadConnection(s.connection_id);
  if (!conn || !conn.dm_enabled || conn.status !== "connected") {
    await finish(db, s.id, { status: "skipped", error: "Auto DM is off for this account." });
    return "skipped";
  }
  if (!(await planAllows(conn.user_id, planCache))) {
    await finish(db, s.id, {
      status: "skipped",
      error: "Auto DM needs the Creator plan or higher.",
    });
    return "skipped";
  }
  const age = Date.now() - new Date(s.source_at).getTime();
  if ((s.kind === "private_reply" || s.kind === "public_reply") && age > PRIVATE_REPLY_WINDOW_MS) {
    await finish(db, s.id, {
      status: "skipped",
      error: "Comment is older than 7 days; Meta no longer allows a reply.",
    });
    return "skipped";
  }
  if (s.kind === "dm") {
    const { data: c } = await db
      .from("dm_contacts")
      .select("last_inbound_at, opted_out")
      .eq("connection_id", s.connection_id)
      .eq("platform_user_id", s.recipient_id)
      .maybeSingle();
    if (c?.opted_out) {
      await finish(db, s.id, { status: "skipped", error: "Person opted out (sent STOP)." });
      return "skipped";
    }
    if (!c?.last_inbound_at || Date.now() - new Date(c.last_inbound_at).getTime() > DM_WINDOW_MS) {
      await finish(db, s.id, {
        status: "skipped",
        error: "Outside Meta's 24-hour messaging window.",
      });
      return "skipped";
    }
  }

  // Hourly cap per account and kind.
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from("dm_sends")
    .select("id", { count: "exact", head: true })
    .eq("connection_id", s.connection_id)
    .eq("kind", s.kind)
    .eq("status", "sent")
    .gte("sent_at", since);
  if ((count ?? 0) >= (HOURLY_CAP[s.kind] ?? 180)) {
    await finish(db, s.id, {
      status: "queued",
      attempts: s.attempts - 1, // a rate-cap deferral is not a failed attempt
      next_attempt_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    return "deferred";
  }

  try {
    const { pageId, pageToken } = await pageTokenFor(conn);
    const auth = { Authorization: `Bearer ${pageToken}`, "Content-Type": "application/json" };
    if (s.kind === "public_reply") {
      const edge = conn.platform === "instagram" ? "replies" : "comments";
      await graphJson(`${GRAPH}/${encodeURIComponent(s.comment_id!)}/${edge}`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ message: s.text }),
      });
    } else {
      const recipient =
        s.kind === "private_reply" ? { comment_id: s.comment_id } : { id: s.recipient_id };
      await graphJson(`${GRAPH}/${pageId}/messages`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ recipient, message: { text: s.text }, messaging_type: "RESPONSE" }),
      });
    }
    await finish(db, s.id, {
      status: "sent",
      sent_at: new Date().toISOString(),
      error: null,
    });
    return "sent";
  } catch (e) {
    const err = e as Error & { code?: number };
    const attempts = s.attempts; // already incremented when the row was claimed
    const permanent = err.code !== undefined && PERMANENT_CODES.has(err.code);
    if (err.code === 190) {
      pageCache.delete(conn.id);
      await db
        .from("platform_connections")
        .update({ last_error: "Login expired — reconnect this account." })
        .eq("id", conn.id);
    }
    if (permanent || attempts >= MAX_ATTEMPTS) {
      await finish(db, s.id, { status: "failed", error: err.message.slice(0, 500), attempts });
      return "failed";
    }
    await finish(db, s.id, {
      status: "queued",
      error: err.message.slice(0, 500),
      attempts,
      next_attempt_at: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
    });
    return "retry";
  }
}

/** Claim and send due messages. `ids` limits the run to just-queued rows (webhook fast path). */
export async function runDueSends(
  opts: { ids?: string[]; limit?: number; deadlineMs?: number } = {},
) {
  const db = await adminDb();
  const deadline = Date.now() + (opts.deadlineMs ?? 45_000);
  // Rows stuck in "sending" (a run crashed mid-send): Meta may already have
  // delivered them, so never resend — mark failed instead of risking a duplicate.
  await db
    .from("dm_sends")
    .update({
      status: "failed",
      error: "Interrupted while sending; not retried to avoid a duplicate.",
    })
    .eq("status", "sending")
    .lt("updated_at", new Date(Date.now() - 2 * 60_000).toISOString());

  let q = db
    .from("dm_sends")
    .select("id, user_id, connection_id, kind, comment_id, recipient_id, text, attempts, source_at")
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 100);
  if (opts.ids) {
    if (opts.ids.length === 0) return { sent: 0, failed: 0, skipped: 0, deferred: 0 };
    q = q.in("id", opts.ids);
  }
  const { data: due } = await q;
  const tally: Record<string, number> = { sent: 0, failed: 0, skipped: 0, deferred: 0, retry: 0 };
  const planCache = new Map<string, boolean>();
  // Private reply before public reply for the same comment.
  const ordered = ((due ?? []) as Send[]).sort(
    (a, b) => (a.kind === "public_reply" ? 1 : 0) - (b.kind === "public_reply" ? 1 : 0),
  );
  for (const s of ordered) {
    if (Date.now() > deadline) break;
    const { data: claimed } = await db
      .from("dm_sends")
      .update({ status: "sending", attempts: s.attempts + 1 })
      .eq("id", s.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed || claimed.length === 0) continue; // another run took it
    s.attempts += 1; // counted at claim time, so crash loops still hit MAX_ATTEMPTS
    const r = await sendOne(db, s, planCache);
    tally[r] = (tally[r] ?? 0) + 1;
  }
  return tally;
}

/** Drop raw webhook payloads (commenter data) after 30 days. */
export async function pruneOldEvents(): Promise<void> {
  const db = await adminDb();
  await db
    .from("dm_events")
    .delete()
    .lt("received_at", new Date(Date.now() - 30 * DAY).toISOString());
}
