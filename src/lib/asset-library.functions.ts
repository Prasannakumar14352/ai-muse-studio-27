import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const ASSET_KINDS = [
  "image", "video", "logo", "voiceover", "music",
  "character", "background", "document",
] as const;
export type AssetKind = typeof ASSET_KINDS[number];

export type LibraryAsset = {
  id: string;
  kind: AssetKind;
  title: string;
  description: string | null;
  url: string;
  storage_path: string | null;
  thumbnail_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  tags: string[];
  usage_count: number;
  favorite: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
};

async function signIfNeeded(
  supabase: { storage: { from: (b: string) => { createSignedUrl: (p: string, exp: number) => Promise<{ data: { signedUrl: string } | null }> } } },
  path: string | null,
  fallback: string,
): Promise<string> {
  if (!path) return fallback;
  const { data } = await supabase.storage.from("library").createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? fallback;
}

export const listLibraryAssetsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind?: AssetKind | "all"; search?: string; tag?: string; favoritesOnly?: boolean } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("asset_library").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(500);
    if (data.kind && data.kind !== "all") q = q.eq("kind", data.kind);
    if (data.favoritesOnly) q = q.eq("favorite", true);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const items = await Promise.all((rows ?? []).map(async (r) => ({
      ...r,
      url: await signIfNeeded(context.supabase, r.storage_path, r.url),
      thumbnail_url: r.thumbnail_url,
    })));
    const allTags = Array.from(new Set(((rows ?? []) as { tags: string[] }[]).flatMap((r) => r.tags ?? []))).slice(0, 40);
    return { items: items as unknown as LibraryAsset[], allTags };
  });

const createSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  url: z.string().min(1),
  storage_path: z.string().optional().nullable(),
  thumbnail_url: z.string().optional().nullable(),
  mime_type: z.string().optional().nullable(),
  size_bytes: z.number().optional().nullable(),
  duration_seconds: z.number().optional().nullable(),
  width: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
  tags: z.array(z.string()).max(20).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const createLibraryAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const insertPayload = { ...data, user_id: context.userId } as unknown as never;
    const { data: row, error } = await context.supabase.from("asset_library").insert(insertPayload).select().single();
    if (error) throw new Error(error.message);
    return row as { id: string };
  });

export const updateLibraryAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; title?: string; tags?: string[]; description?: string | null; favorite?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("asset_library").update(patch).eq("id", id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLibraryAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("asset_library").select("storage_path").eq("id", data.id).eq("user_id", context.userId).single();
    if (row?.storage_path) {
      await context.supabase.storage.from("library").remove([row.storage_path]);
    }
    const { error } = await context.supabase.from("asset_library").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markLibraryUsedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await context.supabase.rpc; // no-op placeholder
    const { data: row } = await context.supabase.from("asset_library").select("usage_count").eq("id", data.id).eq("user_id", context.userId).single();
    if (row) {
      await context.supabase.from("asset_library")
        .update({ usage_count: (row.usage_count ?? 0) + 1, last_used_at: new Date().toISOString() })
        .eq("id", data.id).eq("user_id", context.userId);
    }
    return { ok: true };
  });
