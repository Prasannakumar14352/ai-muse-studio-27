import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MarketplaceItem = {
  id: string;
  kind: "prompt_pack" | "template" | "thumbnail_pack" | "brand_kit" | "voice_pack" | "carousel_pack";
  title: string;
  slug: string;
  description: string | null;
  preview_url: string | null;
  payload: Record<string, unknown>;
  price_usd_cents: number | null;
  tier: string | null;
  active: boolean;
  sort: number;
  created_at: string;
};

export const listMarketplaceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("marketplace_items" as never)
      .select("*")
      .eq("active", true)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(96);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as MarketplaceItem[];
  });

export const listInstalledFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("marketplace_installs" as never)
      .select("item_id");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as { item_id: string }[];
  });

export const installItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { itemId: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("marketplace_installs" as never)
      .insert({ user_id: context.userId, item_id: data.itemId } as never);
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const uninstallItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { itemId: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("marketplace_installs" as never)
      .delete()
      .eq("item_id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin CRUD
export const upsertMarketplaceItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: Partial<MarketplaceItem> & { title: string; slug: string; kind: MarketplaceItem["kind"] }) => i)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const row = {
      title: data.title, slug: data.slug, kind: data.kind,
      description: data.description ?? null, preview_url: data.preview_url ?? null,
      payload: data.payload ?? {}, price_usd_cents: data.price_usd_cents ?? null,
      tier: data.tier ?? "free", active: data.active ?? true, sort: data.sort ?? 0,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: r, error } = await context.supabase.from("marketplace_items" as never).update(row as never).eq("id", data.id).select().single();
      if (error) throw new Error(error.message);
      return r as unknown as MarketplaceItem;
    }
    const { data: r, error } = await context.supabase.from("marketplace_items" as never).insert(row as never).select().single();
    if (error) throw new Error(error.message);
    return r as unknown as MarketplaceItem;
  });

export const deleteMarketplaceItemFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("marketplace_items" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
