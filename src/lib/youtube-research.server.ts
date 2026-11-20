/**
 * Live YouTube evidence for Viral Research, via the YouTube Data API v3.
 * Enabled only when the YOUTUBE_API_KEY env var is set in Vercel (server-only).
 * Cost: search.list = 100 quota units + videos.list = 1 → ~100 units/run (10k/day free).
 */
import { detectVideoTitleLanguage } from "@/lib/content-language";

export interface LiveYouTubeVideo {
  title: string;
  creator: string;
  url: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt: string;
  durationSec: number;
  /** Display name, e.g. "Telugu" — from YouTube's language tags, else the title's script. */
  language: string;
}

const LANG_CODES: Record<string, string> = {
  en: "English", hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada", ml: "Malayalam",
  bn: "Bengali", gu: "Gujarati", mr: "Marathi", pa: "Punjabi", ur: "Urdu", es: "Spanish",
  pt: "Portuguese", fr: "French", de: "German", id: "Indonesian", ar: "Arabic", ja: "Japanese", ko: "Korean",
};

function videoLanguage(code: string | undefined, title: string): string {
  const base = (code ?? "").toLowerCase().split("-")[0];
  if (LANG_CODES[base]) return LANG_CODES[base];
  if (/[ఀ-౿]/.test(title)) return "Telugu";
  if (/[஀-௿]/.test(title)) return "Tamil";
  if (/[ಀ-೿]/.test(title)) return "Kannada";
  if (/[ഀ-ൿ]/.test(title)) return "Malayalam";
  if (/[ঀ-৿]/.test(title)) return "Bengali";
  if (/[઀-૿]/.test(title)) return "Gujarati";
  if (/[ऀ-ॿ]/.test(title)) return "Hindi";
  return /^[\x00-\x7F\u2000-\u2BFF\u{1F000}-\u{1FFFF}]*$/u.test(title) ? "English" : "Other";
}

function isoDurationToSec(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

const REGION: Record<string, string> = {
  india: "IN", "united states": "US", usa: "US", us: "US", "united kingdom": "GB", uk: "GB",
  canada: "CA", australia: "AU", germany: "DE", france: "FR", brazil: "BR", indonesia: "ID",
};

export async function fetchLiveYouTube(topic: string, country?: string | null): Promise<LiveYouTubeVideo[] | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !topic.trim()) return null;
  try {
    const since = new Date(Date.now() - 180 * 86400_000).toISOString();
    const q = new URLSearchParams({
      part: "snippet", type: "video", maxResults: "10", order: "viewCount",
      q: topic.slice(0, 200), publishedAfter: since, key,
    });
    const region = country ? REGION[country.trim().toLowerCase()] : undefined;
    if (region) q.set("regionCode", region);
    const sRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${q}`, { signal: AbortSignal.timeout(8000) });
    if (!sRes.ok) { console.warn("[youtube-research] search", sRes.status); return null; }
    const sJson = (await sRes.json()) as { items?: Array<{ id?: { videoId?: string } }> };
    const ids = (sJson.items ?? []).map((i) => i.id?.videoId).filter(Boolean) as string[];
    if (!ids.length) return [];
    const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({
      part: "snippet,statistics,contentDetails", id: ids.join(","), key,
    })}`, { signal: AbortSignal.timeout(8000) });
    if (!vRes.ok) { console.warn("[youtube-research] videos", vRes.status); return null; }
    const vJson = (await vRes.json()) as { items?: Array<{
      id: string;
      snippet?: { title?: string; channelTitle?: string; publishedAt?: string; defaultAudioLanguage?: string; defaultLanguage?: string };
      statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails?: { duration?: string };
    }> };
    return (vJson.items ?? []).map((v) => ({
      title: v.snippet?.title ?? "",
      creator: v.snippet?.channelTitle ?? "",
      url: `https://www.youtube.com/watch?v=${v.id}`,
      views: Number(v.statistics?.viewCount ?? 0),
      likes: Number(v.statistics?.likeCount ?? 0),
      comments: Number(v.statistics?.commentCount ?? 0),
      publishedAt: (v.snippet?.publishedAt ?? "").slice(0, 10),
      durationSec: isoDurationToSec(v.contentDetails?.duration ?? ""),
      // YouTube's tag is often the channel default ("en"); the title decides when it disagrees.
      language: detectVideoTitleLanguage(v.snippet?.title ?? "", videoLanguage(v.snippet?.defaultAudioLanguage ?? v.snippet?.defaultLanguage, v.snippet?.title ?? "")),
    })).sort((a, b) => b.views - a.views);
  } catch (e) {
    console.warn("[youtube-research] failed", e);
    return null;
  }
}

export function fmtViews(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M views`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K views`;
  return `${n} views`;
}

export function fmtDuration(s: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}
