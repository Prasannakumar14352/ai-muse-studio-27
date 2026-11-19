// Keeps each user's saved work in their account, not just this browser.
//
// - Every localStorage entry under "cv:" (projects, scripts, carousels,
//   thumbnails, video jobs…) is mirrored to the user_kv table.
// - Every file in the IndexedDB blob store (images, rendered videos) is
//   mirrored to Storage: library/<uid>/blobs/<key>.
// - On a new device (or after clearing the browser) hydrateFromCloud() pulls
//   both back, so the app finds everything where it expects it.
import { supabase } from "@/integrations/supabase/client";

const PREFIX = "cv:";
const SKIP = /^cv:(collapse|ui):/; // pure UI state, not worth syncing
const MAX_VALUE_BYTES = 1_500_000;
const BLOB_SYNC_KEY = (uid: string) => `cvsync:blobs:${uid}`;
const HYDRATED_KEY = (uid: string) => `cvsync:hydrated:${uid}`;

let uid: string | null = null;
let installed = false;
const pending = new Map<string, string | null>(); // key → value (null = delete)
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let suppress = false; // true while hydrate writes into localStorage

function shouldSync(key: string) {
  return key.startsWith(PREFIX) && !SKIP.test(key);
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, 1200);
}

async function flush() {
  if (!uid || pending.size === 0) return;
  const batch = [...pending.entries()];
  pending.clear();
  const upserts = batch.filter(([, v]) => v !== null && v.length <= MAX_VALUE_BYTES)
    .map(([key, value]) => ({ user_id: uid!, key, value: value!, updated_at: new Date().toISOString() }));
  const deletes = batch.filter(([, v]) => v === null).map(([k]) => k);
  try {
    for (let i = 0; i < upserts.length; i += 50) {
      const { error } = await supabase.from("user_kv" as never).upsert(upserts.slice(i, i + 50) as never);
      if (error) throw error;
    }
    if (deletes.length) {
      await supabase.from("user_kv" as never).delete().eq("user_id", uid).in("key", deletes);
    }
  } catch (e) {
    console.warn("[cloud-sync] save failed; will retry", e);
    for (const [k, v] of batch) if (!pending.has(k)) pending.set(k, v);
    setTimeout(scheduleFlush, 5000);
  }
}

/** Patch localStorage once so every "cv:" write is mirrored to the account. */
export function installCloudSync(userId: string) {
  uid = userId;
  if (installed || typeof window === "undefined") return;
  installed = true;
  const ls = window.localStorage;
  const origSet = ls.setItem.bind(ls);
  const origRemove = ls.removeItem.bind(ls);
  ls.setItem = (key: string, value: string) => {
    origSet(key, value);
    if (!suppress && shouldSync(key)) { pending.set(key, value); scheduleFlush(); }
  };
  ls.removeItem = (key: string) => {
    origRemove(key);
    if (!suppress && shouldSync(key)) { pending.set(key, null); scheduleFlush(); }
  };
  window.addEventListener("pagehide", () => { void flush(); });
}

/**
 * Bring the account's saved work into this browser: entries missing locally
 * are written in; entries only present locally are uploaded (first-run
 * backfill). Then blobs are backfilled in the background.
 */
let hydrateOnce: { uid: string; p: Promise<{ restored: number; uploaded: number }> } | null = null;
export function hydrateFromCloud(userId: string): Promise<{ restored: number; uploaded: number }> {
  if (hydrateOnce?.uid === userId) return hydrateOnce.p;
  const p = doHydrate(userId);
  hydrateOnce = { uid: userId, p };
  p.catch(() => { if (hydrateOnce?.p === p) hydrateOnce = null; });
  return p;
}

async function doHydrate(userId: string): Promise<{ restored: number; uploaded: number }> {
  uid = userId;
  const remote = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("user_kv" as never)
      .select("key, value").eq("user_id", userId).range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as Array<{ key: string; value: string }>;
    rows.forEach((r) => remote.set(r.key, r.value));
    if (rows.length < 1000) break;
  }
  let restored = 0;
  suppress = true;
  try {
    for (const [k, v] of remote) {
      if (localStorage.getItem(k) === null) {
        try { localStorage.setItem(k, v); restored++; } catch { /* quota */ }
      }
    }
  } finally { suppress = false; }

  // Upload local-only entries (work made before cloud save existed).
  let uploaded = 0;
  const mine = `${PREFIX}${userId}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !shouldSync(k) || remote.has(k)) continue;
    if (k.startsWith(PREFIX) && k.split(":").length > 2 && !k.startsWith(mine) && /^cv:[0-9a-f-]{36}:/.test(k)) continue; // another user's data on a shared browser
    const v = localStorage.getItem(k);
    if (v !== null) { pending.set(k, v); uploaded++; }
  }
  if (uploaded) scheduleFlush();
  try { localStorage.setItem(HYDRATED_KEY(userId), new Date().toISOString()); } catch { /* ignore */ }
  void backfillBlobs(userId);
  return { restored, uploaded };
}

/** Run local-only changes (e.g. "clear this browser") without touching the account copy. */
export async function withoutCloudSync<T>(fn: () => Promise<T> | T): Promise<T> {
  suppress = true;
  try { return await fn(); } finally { suppress = false; }
}

export function hasHydrated(userId: string) {
  try { return Boolean(localStorage.getItem(HYDRATED_KEY(userId))); } catch { return true; }
}

// ---------- blobs ----------

/** Storage path for a blob-store key. Keys contain ":" — keep them readable but safe. */
export function blobStoragePath(userId: string, rawKey: string) {
  return `${userId}/blobs/${rawKey.replace(/[^\w.-]+/g, "_")}`;
}

function syncedSet(userId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BLOB_SYNC_KEY(userId)) ?? "[]") as string[]); }
  catch { return new Set(); }
}
function markSynced(userId: string, rawKey: string) {
  const s = syncedSet(userId); s.add(rawKey);
  try { localStorage.setItem(BLOB_SYNC_KEY(userId), JSON.stringify([...s].slice(-5000))); } catch { /* ignore */ }
}

const MAX_BLOB_BYTES = 45 * 1024 * 1024; // Storage's per-file limit is 50 MB

export async function uploadBlob(rawKey: string, blob: Blob): Promise<string | null> {
  if (blob.size > MAX_BLOB_BYTES) { console.warn("[cloud-sync] file too large to back up", rawKey, blob.size); return null; }
  const { data } = await supabase.auth.getUser();
  const u = data.user?.id;
  if (!u) return null;
  const path = blobStoragePath(u, rawKey);
  const { error } = await supabase.storage.from("library").upload(path, blob, {
    upsert: true, contentType: blob.type || "application/octet-stream",
  });
  if (error) { console.warn("[cloud-sync] blob upload failed", rawKey, error.message); return null; }
  markSynced(u, rawKey);
  return path;
}

export async function downloadBlob(rawKey: string): Promise<Blob | null> {
  const { data } = await supabase.auth.getUser();
  const u = data.user?.id;
  if (!u) return null;
  const { data: blob, error } = await supabase.storage.from("library").download(blobStoragePath(u, rawKey));
  if (error || !blob) return null;
  return blob;
}

async function backfillBlobs(userId: string) {
  try {
    const { listBlobKeys, getBlob } = await import("@/lib/blob-store");
    const done = syncedSet(userId);
    for (const k of await listBlobKeys()) {
      if (done.has(k)) continue;
      // Only this user's blobs (keys embed the uid) or generic project keys.
      if (/[0-9a-f]{8}-[0-9a-f]{4}-/.test(k) && !k.includes(userId) && /^(video|video-thumb|thumbnail|shot):/.test(k)) continue;
      const b = await getBlob(k, { localOnly: true });
      if (b) await uploadBlob(k, b);
    }
  } catch (e) { console.warn("[cloud-sync] blob backfill stopped", e); }
}

/** Record a blob-store file (already mirrored by putBlob) in the user's Media Library. */
export async function recordLibraryAsset(opts: {
  rawKey: string; blob: Blob; kind: "image" | "video";
  title: string; tags?: string[]; metadata?: Record<string, string | number | boolean | null>;
}) {
  // putBlob() already mirrors the file to this path; just point at it.
  const { data } = await supabase.auth.getUser();
  const u = data.user?.id;
  if (!u) return;
  const path = blobStoragePath(u, opts.rawKey);
  const { data: existing } = await supabase.from("asset_library").select("id").eq("user_id", u).eq("storage_path", path).maybeSingle();
  if (existing) return;
  await supabase.from("asset_library").insert({
    user_id: u,
    kind: opts.kind,
    title: (opts.title || "AI generation").slice(0, 200),
    url: path,
    storage_path: path,
    mime_type: opts.blob.type || null,
    size_bytes: opts.blob.size,
    tags: opts.tags ?? [],
    metadata: { source_key: opts.rawKey, ...(opts.metadata ?? {}) },
  } as never);
}
