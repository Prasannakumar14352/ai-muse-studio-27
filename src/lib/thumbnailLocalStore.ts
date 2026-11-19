// Browser-local library of saved YouTube thumbnails.
// Metadata in localStorage, image blob in IndexedDB via blob-store.ts.
// Mirrors videoLocalStore.ts / local-store.ts patterns.

import { supabase } from "@/integrations/supabase/client";
import { putBlob, getBlob, deleteBlob, makeBlobKey } from "@/lib/blob-store";

export type LocalThumbnail = {
  id: string;
  title: string;
  concept: string;
  headline: string;
  niche: string | null;
  topic: string | null;
  styleId: string;
  styleLabel: string;
  mime: string;
  extension: "png" | "jpg" | "webp";
  created_at: string;
  image_blob_key: string;
};

export type SaveThumbnailInput = {
  title: string;
  concept: string;
  headline: string;
  niche: string | null;
  topic: string | null;
  styleId: string;
  styleLabel: string;
  /** Data URL, blob URL, or Blob. */
  image: Blob | string;
};

let cachedUserId: string | null = null;
async function currentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const { data } = await supabase.auth.getUser();
  cachedUserId = data.user?.id ?? null;
  return cachedUserId;
}
supabase.auth.onAuthStateChange(() => { cachedUserId = null; });

function base(uid: string) { return `cv:${uid}`; }
function indexKey(uid: string) { return `${base(uid)}:thumbnails-index`; }
function metaKey(uid: string, id: string) { return `${base(uid)}:thumbnail:${id}`; }

function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; }
  catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

async function toBlob(src: Blob | string): Promise<{ blob: Blob; mime: string }> {
  if (src instanceof Blob) return { blob: src, mime: src.type || "image/png" };
  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid data URL");
    const mime = match[1] || "image/png";
    const isB64 = Boolean(match[2]);
    const payload = match[3] ?? "";
    if (isB64) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { blob: new Blob([bytes], { type: mime }), mime };
    }
    return { blob: new Blob([decodeURIComponent(payload)], { type: mime }), mime };
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch thumbnail (${res.status})`);
  const b = await res.blob();
  return { blob: b, mime: b.type || "image/png" };
}

function extFromMime(mime: string): "png" | "jpg" | "webp" {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

export async function saveGeneratedThumbnail(input: SaveThumbnailInput): Promise<LocalThumbnail> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");

  const id = crypto.randomUUID();
  const key = `thumbnail:${uid}:${id}`;

  let mime = "image/png";
  const { blob: fileBlob, mime: m } = await toBlob(input.image);
  await putBlob(key, fileBlob);
  mime = m;
  void import("@/lib/cloud-sync").then(({ recordLibraryAsset }) => recordLibraryAsset({
    rawKey: key, blob: fileBlob, kind: "image", title: input.title || "Thumbnail", tags: ["thumbnail"],
  })).catch(() => {});

  const rec: LocalThumbnail = {
    id,
    title: input.title,
    concept: input.concept,
    headline: input.headline,
    niche: input.niche,
    topic: input.topic,
    styleId: input.styleId,
    styleLabel: input.styleLabel,
    mime,
    extension: extFromMime(mime),
    created_at: new Date().toISOString(),
    image_blob_key: makeBlobKey(key),
  };

  writeJson(metaKey(uid, id), rec);
  const idx = readJson<string[]>(indexKey(uid), []);
  writeJson(indexKey(uid), [id, ...idx.filter((x) => x !== id)]);
  return rec;
}

export async function getGeneratedThumbnails(): Promise<LocalThumbnail[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const idx = readJson<string[]>(indexKey(uid), []);
  const out: LocalThumbnail[] = [];
  for (const id of idx) {
    const rec = readJson<LocalThumbnail | null>(metaKey(uid, id), null);
    if (rec) out.push(rec);
  }
  return out;
}

export async function loadThumbnailImageURL(rec: LocalThumbnail): Promise<string | null> {
  const b = await getBlob(rec.image_blob_key);
  return b ? URL.createObjectURL(b) : null;
}

export async function deleteGeneratedThumbnail(id: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const rec = readJson<LocalThumbnail | null>(metaKey(uid, id), null);
  if (rec) await deleteBlob(rec.image_blob_key).catch(() => {});
  localStorage.removeItem(metaKey(uid, id));
  const idx = readJson<string[]>(indexKey(uid), []);
  writeJson(indexKey(uid), idx.filter((x) => x !== id));
}

export async function clearGeneratedThumbnails(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const idx = readJson<string[]>(indexKey(uid), []);
  for (const id of idx) await deleteGeneratedThumbnail(id).catch(() => {});
  localStorage.removeItem(indexKey(uid));
}
