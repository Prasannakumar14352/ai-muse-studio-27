import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BrandDefaultStyles = {
  visualStyle?: string;
  imageStyle?: string;
  videoStyle?: string;
  aspectRatio?: string;
  captionTone?: string;
};

export type BrandKit = {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  font_primary: string | null;
  font_secondary: string | null;
  brand_voice: string | null;
  default_cta: string | null;
  watermark_url: string | null;
  intro_url: string | null;
  outro_url: string | null;
  keywords: string[] | null;
  default_styles: BrandDefaultStyles | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const listBrandKitsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("brand_kits")
      .select("*")
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BrandKit[];
  });

export const getDefaultBrandKitFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("brand_kits")
      .select("*")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    return (data ?? null) as unknown as BrandKit | null;
  });

export const upsertBrandKitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: Partial<BrandKit> & { name: string }) => i)
  .handler(async ({ data, context }) => {
    const payload = {
      user_id: context.userId,
      name: data.name,
      logo_url: data.logo_url ?? null,
      primary_color: data.primary_color ?? null,
      secondary_color: data.secondary_color ?? null,
      font_primary: data.font_primary ?? null,
      font_secondary: data.font_secondary ?? null,
      brand_voice: data.brand_voice ?? null,
      default_cta: data.default_cta ?? null,
      watermark_url: data.watermark_url ?? null,
      intro_url: data.intro_url ?? null,
      outro_url: data.outro_url ?? null,
      keywords: data.keywords ?? [],
      is_default: !!data.is_default,
    };
    if (data.is_default) {
      await context.supabase.from("brand_kits").update({ is_default: false } as never).eq("user_id", context.userId);
    }
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("brand_kits")
        .update(payload as never)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row as unknown as BrandKit;
    }
    const { data: row, error } = await context.supabase
      .from("brand_kits")
      .insert(payload as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as BrandKit;
  });

export const deleteBrandKitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("brand_kits").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
