// Per-user browser-local library of generated videos.
// Nothing here touches the database. Metadata lives in localStorage; the
// large MP4/WebM blob and thumbnail image are stored in IndexedDB via
// blob-store.ts. Mirrors the pattern used by `local-store.ts` for carousels.

import { supabase } from "@/integrations/supabase/client";
import { putBlob, getBlob, deleteBlob, makeBlobKey, putDataURL } from "@/lib/blob-store";

export type LocalVideo = {
  id: string;
  title: string;
  niche: string | null;
  topic: string | null;
  styleId: string;
  styleLabel: string;
  videoType: string;
  aspectRatio: string;
  duration_sec: number;
  extension: "mp4" | "webm";
  mime: string;
  youtube_title: string;
  youtube_description: string;
  hashtags: string[];
  tags: string[];
  pinned_comment: string;
  chapters: Array<{ time: string; label: string }>;
  subtitles_vtt: string;
  created_at: string;
  video_blob_key: string;
  thumbnail_blob_key: string | null;
};

export type SaveVideoInput = Omit<
  LocalVideo,
  "id" | "created_at" | "video_blob_key" | "thumbnail_blob_key"
> & {
  video_blob: Blob;
  /** Data URL, blob URL, or blob for the thumbnail image. */
  thumbnail?: Blob | string | null;
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
function indexKey(uid: string) { return `${base(uid)}:videos-index`; }
function metaKey(uid: string, id: string) { return `${base(uid)}:video:${id}`; }

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

async function toBlob(src: Blob | string): Promise<Blob> {
  if (src instanceof Blob) return src;
  if (src.startsWith("data:")) {
    // reuse putDataURL parsing via a temp key path
    // (we can't easily reuse without writing; inline the decode)
    const match = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!match) throw new Error("Invalid data URL");
    const mime = match[1] || "application/octet-stream";
    const isB64 = Boolean(match[2]);
    const payload = match[3] ?? "";
    if (isB64) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  // blob:/http(s): URL — fetch it
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Failed to fetch asset (${res.status})`);
  return await res.blob();
}

export async function saveGeneratedVideo(input: SaveVideoInput): Promise<LocalVideo> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");

  const id = crypto.randomUUID();
  const videoKey = `video:${uid}:${id}`;
  await putBlob(videoKey, input.video_blob);
  void import("@/lib/cloud-sync").then(({ recordLibraryAsset }) => recordLibraryAsset({
    rawKey: videoKey, blob: input.video_blob, kind: "video", title: input.title || "AI video", tags: ["video"],
  })).catch(() => {});

  let thumbKey: string | null = null;
  if (input.thumbnail) {
    thumbKey = `video-thumb:${uid}:${id}`;
    if (typeof input.thumbnail === "string" && input.thumbnail.startsWith("data:")) {
      await putDataURL(thumbKey, input.thumbnail);
    } else {
      const b = await toBlob(input.thumbnail);
      await putBlob(thumbKey, b);
    }
  }

  const record: LocalVideo = {
    id,
    title: input.title,
    niche: input.niche,
    topic: input.topic,
    styleId: input.styleId,
    styleLabel: input.styleLabel,
    videoType: input.videoType,
    aspectRatio: input.aspectRatio,
    duration_sec: input.duration_sec,
    extension: input.extension,
    mime: input.mime,
    youtube_title: input.youtube_title,
    youtube_description: input.youtube_description,
    hashtags: input.hashtags,
    tags: input.tags,
    pinned_comment: input.pinned_comment,
    chapters: input.chapters,
    subtitles_vtt: input.subtitles_vtt,
    created_at: new Date().toISOString(),
    video_blob_key: makeBlobKey(videoKey),
    thumbnail_blob_key: thumbKey ? makeBlobKey(thumbKey) : null,
  };

  writeJson(metaKey(uid, id), record);
  const idx = readJson<string[]>(indexKey(uid), []);
  writeJson(indexKey(uid), [id, ...idx.filter((x) => x !== id)]);

  return record;
}

export async function getGeneratedVideos(): Promise<LocalVideo[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const idx = readJson<string[]>(indexKey(uid), []);
  const out: LocalVideo[] = [];
  for (const id of idx) {
    const rec = readJson<LocalVideo | null>(metaKey(uid, id), null);
    if (rec) out.push(rec);
  }
  return out;
}

export async function getGeneratedVideoById(id: string): Promise<LocalVideo | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  return readJson<LocalVideo | null>(metaKey(uid, id), null);
}

/** Reads the stored blob and returns a fresh object URL. Caller owns revoke. */
export async function loadVideoObjectURL(rec: LocalVideo): Promise<string | null> {
  const b = await getBlob(rec.video_blob_key);
  return b ? URL.createObjectURL(b) : null;
}

export async function loadThumbnailObjectURL(rec: LocalVideo): Promise<string | null> {
  if (!rec.thumbnail_blob_key) return null;
  const b = await getBlob(rec.thumbnail_blob_key);
  return b ? URL.createObjectURL(b) : null;
}

export async function deleteGeneratedVideo(id: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const rec = readJson<LocalVideo | null>(metaKey(uid, id), null);
  if (rec) {
    await deleteBlob(rec.video_blob_key).catch(() => {});
    if (rec.thumbnail_blob_key) await deleteBlob(rec.thumbnail_blob_key).catch(() => {});
  }
  localStorage.removeItem(metaKey(uid, id));
  const idx = readJson<string[]>(indexKey(uid), []);
  writeJson(indexKey(uid), idx.filter((x) => x !== id));
}

export async function clearGeneratedVideos(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const idx = readJson<string[]>(indexKey(uid), []);
  for (const id of idx) {
    await deleteGeneratedVideo(id).catch(() => {});
  }
  localStorage.removeItem(indexKey(uid));
}
