import type { VideoExportSettings } from "./video-export";
import { authFetch } from "@/lib/auth-fetch";
import { supabase } from "@/integrations/supabase/client";

export type Mp4Result = { path: string; url: string | null; blob?: Blob };

/**
 * Convert a file in the "renders" bucket to a 1080p H.264 MP4 on the server.
 * Returns null if conversion isn't available, so callers can keep the original.
 */
export async function convertRenderToMp4(
  path: string,
  shape: "vertical" | "landscape" | "square",
  opts?: { deleteSource?: boolean; settings?: VideoExportSettings },
): Promise<Mp4Result | null> {
  try {
    const res = await authFetch("/api/transcode-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        shape,
        deleteSource: opts?.deleteSource ?? false,
        settings: opts?.settings,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; url?: string | null; error?: string };
    if (!res.ok || !j.ok || !j.path) {
      console.warn("[mp4] conversion failed", j.error ?? res.status);
      return null;
    }
    return { path: j.path, url: j.url ?? null };
  } catch (e) {
    console.warn("[mp4] conversion unavailable", e);
    return null;
  }
}

/** Upload a local render, convert it, and return the MP4 as a Blob (for on-device libraries). */
export async function convertBlobToMp4(
  blob: Blob,
  shape: "vertical" | "landscape" | "square",
  settings?: VideoExportSettings,
): Promise<Blob | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const tmpPath = `${u.user.id}/tmp/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("renders").upload(tmpPath, blob, { contentType: blob.type || undefined });
  if (error) return null;
  const out = await convertRenderToMp4(tmpPath, shape, { deleteSource: true, settings });
  if (!out?.url) return null;
  const r = await fetch(out.url);
  if (!r.ok) return null;
  return await r.blob();
}
