import { supabase } from "@/integrations/supabase/client";
import { createLibraryAssetFn, type AssetKind } from "@/lib/asset-library.functions";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a",
};

/** Copy a generated file (URL, data: or blob:) into the user's Media Library. */
export async function saveUrlToLibrary(opts: {
  url: string;
  kind: AssetKind;
  title: string;
  tags?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const res = await fetch(opts.url);
  if (!res.ok) throw new Error(`Couldn't download the file (${res.status})`);
  const blob = await res.blob();
  const ext = EXT[blob.type] ?? (opts.kind === "voiceover" ? "mp3" : opts.kind === "video" ? "mp4" : "jpg");
  const path = `${userData.user.id}/${opts.kind}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("library").upload(path, blob, {
    contentType: blob.type || undefined, upsert: false,
  });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage.from("library").createSignedUrl(path, 60 * 60 * 24 * 7);
  await createLibraryAssetFn({
    data: {
      kind: opts.kind,
      title: opts.title.slice(0, 200) || "AI generation",
      url: signed?.signedUrl ?? path,
      storage_path: path,
      mime_type: blob.type || null,
      size_bytes: blob.size,
      tags: opts.tags ?? [],
      metadata: opts.metadata ?? {},
    },
  });
}
