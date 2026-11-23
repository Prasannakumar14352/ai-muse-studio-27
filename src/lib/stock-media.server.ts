// Free stock media from Pixabay (https://pixabay.com/api/docs/).
//
// Rules we follow from Pixabay's API terms:
//  - The API key never leaves the server.
//  - Every search response is cached for 24 hours (stock_media_cache).
//  - Pixabay URLs are only shown temporarily in search results. When a user
//    picks an item we download it into our own Storage ("library" bucket) and
//    keep only our copy — no permanent hotlinking.
//  - No systematic mass downloads: per-user rate limits on search + import.
//  - The picker UI shows "from Pixabay" attribution next to results.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StockType = "photo" | "illustration" | "vector" | "video";
export type StockOrientation = "all" | "horizontal" | "vertical";

export type StockItem = {
  id: number;
  type: StockType;
  /** Small preview for the results grid (temporary Pixabay URL). */
  preview: string;
  width: number;
  height: number;
  tags: string;
  author: string;
  pageUrl: string;
  /** Video duration in seconds (videos only). */
  duration?: number;
};

export type StockSearchResult = { items: StockItem[]; total: number; page: number; hasMore: boolean };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PER_PAGE = 30;
const SEARCH_LIMIT_PER_MIN = 30;
const IMPORT_LIMIT_PER_HOUR = 60;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(["pixabay.com", "cdn.pixabay.com"]);

export class StockMediaError extends Error {}

export function isStockConfigured(): boolean {
  return Boolean(process.env.PIXABAY_API_KEY);
}

function apiKey(): string {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) throw new StockMediaError("Free stock library isn't set up yet. Add PIXABAY_API_KEY to the server environment.");
  return key;
}

type PixabayImageHit = {
  id: number; pageURL: string; type: string; tags: string;
  previewURL: string; webformatURL: string; largeImageURL: string;
  imageWidth: number; imageHeight: number; user: string;
};
type PixabayVideoFile = { url: string; width: number; height: number; size: number; thumbnail?: string };
type PixabayVideoHit = {
  id: number; pageURL: string; type: string; tags: string; duration: number; user: string;
  videos: { large?: PixabayVideoFile; medium?: PixabayVideoFile; small?: PixabayVideoFile; tiny?: PixabayVideoFile };
};
type PixabayResponse<T> = { total: number; totalHits: number; hits: T[] };

/** Fetch a Pixabay API URL, using the 24h cache. `params` must not include the key. */
async function cachedPixabay<T>(endpoint: "" | "videos/", params: URLSearchParams): Promise<PixabayResponse<T>> {
  params.sort();
  const cacheKey = `${endpoint || "images/"}?${params.toString()}`;
  const db = supabaseAdmin.from("stock_media_cache" as never);

  const { data: cached } = await db.select("response, created_at").eq("cache_key", cacheKey).maybeSingle();
  const row = cached as { response: PixabayResponse<T>; created_at: string } | null;
  if (row && Date.now() - new Date(row.created_at).getTime() < CACHE_TTL_MS) return row.response;

  const url = `https://pixabay.com/api/${endpoint}?key=${encodeURIComponent(apiKey())}&${params.toString()}`;
  const res = await fetch(url);
  if (res.status === 429) throw new StockMediaError("Stock search is busy right now — try again in a minute.");
  if (!res.ok) throw new StockMediaError(`Stock search failed (${res.status}).`);
  const json = (await res.json()) as PixabayResponse<T>;

  await supabaseAdmin.from("stock_media_cache" as never)
    .upsert({ cache_key: cacheKey, response: json, created_at: new Date().toISOString() } as never);
  // Opportunistic cleanup of expired entries (~1 in 20 misses).
  if (Math.random() < 0.05) {
    await supabaseAdmin.from("stock_media_cache" as never).delete()
      .lt("created_at", new Date(Date.now() - CACHE_TTL_MS).toISOString());
  }
  return json;
}

async function enforceRateLimit(userId: string, action: "search" | "import") {
  const windowMs = action === "search" ? 60_000 : 60 * 60_000;
  const limit = action === "search" ? SEARCH_LIMIT_PER_MIN : IMPORT_LIMIT_PER_HOUR;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count } = await supabaseAdmin.from("stock_media_requests" as never)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("action", action).gte("created_at", since);
  if ((count ?? 0) >= limit) {
    throw new StockMediaError(action === "search"
      ? "You're searching very fast — wait a minute and try again."
      : "You've added a lot of stock files this hour — try again later.");
  }
  await supabaseAdmin.from("stock_media_requests" as never).insert({ user_id: userId, action } as never);
}

function videoThumb(v: PixabayVideoHit): string {
  return v.videos.tiny?.thumbnail || v.videos.small?.thumbnail || v.videos.medium?.thumbnail || "";
}

export async function searchStock(userId: string, opts: {
  query: string; type: StockType; page: number; orientation: StockOrientation;
}): Promise<StockSearchResult> {
  await enforceRateLimit(userId, "search");
  const params = new URLSearchParams({
    q: opts.query.trim().slice(0, 100),
    page: String(opts.page),
    per_page: String(PER_PAGE),
    safesearch: "true",
  });
  if (opts.type === "video") {
    params.set("video_type", "all");
    const r = await cachedPixabay<PixabayVideoHit>("videos/", params);
    const items: StockItem[] = r.hits.map((v): StockItem => {
      const best = v.videos.medium ?? v.videos.small ?? v.videos.large;
      return {
        id: v.id, type: "video", preview: videoThumb(v),
        width: best?.width ?? 0, height: best?.height ?? 0,
        tags: v.tags, author: v.user, pageUrl: v.pageURL, duration: v.duration,
      };
    }).filter((i) => i.preview);
    return { items, total: r.totalHits, page: opts.page, hasMore: opts.page * PER_PAGE < r.totalHits };
  }
  params.set("image_type", opts.type);
  if (opts.orientation !== "all") params.set("orientation", opts.orientation);
  const r = await cachedPixabay<PixabayImageHit>("", params);
  const items: StockItem[] = r.hits.map((h) => ({
    id: h.id, type: opts.type, preview: h.webformatURL || h.previewURL,
    width: h.imageWidth, height: h.imageHeight, tags: h.tags, author: h.user, pageUrl: h.pageURL,
  }));
  return { items, total: r.totalHits, page: opts.page, hasMore: opts.page * PER_PAGE < r.totalHits };
}

function assertPixabayUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname)) {
    throw new StockMediaError("Unexpected stock file location.");
  }
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4" };

/**
 * Copy one Pixabay item into the user's Asset Library. The file URL is
 * re-resolved from Pixabay by id on the server, so the browser can't make us
 * download arbitrary URLs.
 */
export async function importStock(userId: string, opts: { id: number; type: StockType }) {
  await enforceRateLimit(userId, "import");
  const params = new URLSearchParams({ id: String(opts.id) });

  let fileUrl: string; let width = 0; let height = 0; let tags = ""; let author = ""; let pageUrl = "";
  let duration: number | null = null; let thumb: string | null = null;
  if (opts.type === "video") {
    const r = await cachedPixabay<PixabayVideoHit>("videos/", params);
    const v = r.hits[0];
    if (!v) throw new StockMediaError("That video is no longer available.");
    // Prefer 1080p-ish "medium", fall back to smaller renditions.
    const f = v.videos.medium?.url ? v.videos.medium : v.videos.small?.url ? v.videos.small : v.videos.large;
    if (!f?.url) throw new StockMediaError("That video has no downloadable file.");
    fileUrl = f.url; width = f.width; height = f.height; duration = v.duration;
    tags = v.tags; author = v.user; pageUrl = v.pageURL; thumb = videoThumb(v) || null;
  } else {
    const r = await cachedPixabay<PixabayImageHit>("", params);
    const h = r.hits[0];
    if (!h) throw new StockMediaError("That image is no longer available.");
    fileUrl = h.largeImageURL || h.webformatURL;
    width = h.imageWidth; height = h.imageHeight; tags = h.tags; author = h.user; pageUrl = h.pageURL;
  }
  assertPixabayUrl(fileUrl);

  const res = await fetch(fileUrl);
  if (!res.ok) throw new StockMediaError(`Couldn't download the stock file (${res.status}).`);
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim() || (opts.type === "video" ? "video/mp4" : "image/jpeg");
  const isVideo = opts.type === "video";
  if (isVideo ? !contentType.startsWith("video/") : !contentType.startsWith("image/")) {
    throw new StockMediaError("Unexpected stock file type.");
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
    throw new StockMediaError("That stock file is too large to import.");
  }

  const kind = isVideo ? "video" : "image";
  const path = `${userId}/${kind}/pixabay-${opts.id}-${crypto.randomUUID().slice(0, 8)}.${EXT[contentType] ?? (isVideo ? "mp4" : "jpg")}`;
  const { error: upErr } = await supabaseAdmin.storage.from("library").upload(path, buf, { contentType, upsert: false });
  if (upErr) throw new StockMediaError(`Couldn't save the file: ${upErr.message}`);

  const { data: signed } = await supabaseAdmin.storage.from("library").createSignedUrl(path, 60 * 60 * 24 * 7);
  const title = (tags.split(",")[0]?.trim() || `Stock ${kind}`).replace(/^\w/, (c) => c.toUpperCase());
  const tagList = ["stock", "pixabay", ...tags.split(",").map((t) => t.trim()).filter(Boolean)].slice(0, 20);

  const { data: row, error } = await supabaseAdmin.from("asset_library").insert({
    user_id: userId,
    kind,
    title: title.slice(0, 200),
    url: signed?.signedUrl ?? path,
    storage_path: path,
    thumbnail_url: null,
    mime_type: contentType,
    size_bytes: buf.byteLength,
    duration_seconds: duration,
    width, height,
    tags: tagList,
    metadata: { source: "pixabay", pixabay_id: opts.id, pixabay_type: opts.type, author, page_url: pageUrl, preview: thumb },
  } as never).select("id").single();
  if (error) {
    await supabaseAdmin.storage.from("library").remove([path]);
    throw new StockMediaError(`Couldn't add to your library: ${error.message}`);
  }

  return {
    assetId: (row as { id: string }).id,
    url: signed?.signedUrl ?? "",
    storagePath: path,
    kind: kind as "image" | "video",
    mimeType: contentType,
    width, height, title, author,
  };
}
