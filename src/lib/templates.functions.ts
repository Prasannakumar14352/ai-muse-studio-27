// Templates system — server functions for listing, favoriting, and admin CRUD.
// Templates pre-fill the create-project brief with a curated topic + style +
// scene plan. Access tiers gate premium templates to paid plans.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TemplateAccessTier = "free" | "starter" | "creator" | "pro";

export type TemplatePreviewType = "image" | "video";

export type TemplateStatus = "draft" | "published";

export type TemplateRecord = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  preview_image_url: string | null;
  preview_video_url: string | null;
  poster_url: string | null;
  preview_type: TemplatePreviewType;
  alt_text: string | null;
  aspect_ratio: string | null;
  platform: string | null;
  style: string | null;
  default_prompt: string | null;
  negative_prompt: string | null;
  credits: number;
  status: TemplateStatus;
  default_brief: any;
  tags: string[] | null;
  access_tier: TemplateAccessTier;
  featured: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TemplateVersion = {
  id: string;
  template_id: string;
  version: number;
  snapshot: TemplateRecord;
  created_by: string | null;
  created_at: string;
};


/** Public read: everyone (including anon) can browse the catalog. */
export const listTemplatesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client
    .from("templates")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateRecord[];
});

export const getTemplateBySlugFn = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => input)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const client = createClient(process.env.SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: row, error } = await client
      .from("templates")
      .select("*")
      .eq("slug", data.slug)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as TemplateRecord | null;
  });

// -------------------- Admin CRUD --------------------

export const upsertTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Partial<TemplateRecord> & { slug: string; name: string; category: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      slug: data.slug,
      name: data.name,
      category: data.category,
      description: data.description ?? null,
      preview_image_url: data.preview_image_url ?? null,
      preview_video_url: data.preview_video_url ?? null,
      poster_url: data.poster_url ?? null,
      preview_type: (data.preview_type ?? "image") as TemplatePreviewType,
      alt_text: data.alt_text ?? null,
      aspect_ratio: data.aspect_ratio ?? null,
      platform: data.platform ?? null,
      style: data.style ?? null,
      default_prompt: data.default_prompt ?? null,
      default_brief: data.default_brief ?? {},
      tags: data.tags ?? [],
      access_tier: data.access_tier ?? "free",
      featured: data.featured ?? false,
      active: data.active ?? true,
      sort_order: data.sort_order ?? 0,
      created_by: context.userId,
    };
    const { data: row, error } = await (supabaseAdmin as any)
      .from("templates")
      .upsert(payload, { onConflict: "slug" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as TemplateRecord;
  });

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Access mapping --------------------

/** Ranked tiers so we can gate a template by the current plan. */
const TIER_RANK: Record<TemplateAccessTier, number> = { free: 0, starter: 1, creator: 2, pro: 3 };

export function planTier(planId?: string | null): TemplateAccessTier {
  if (!planId) return "free";
  if (planId.startsWith("pro")) return "pro";
  if (planId.startsWith("creator")) return "creator";
  if (planId.startsWith("starter")) return "starter";
  return "free";
}

export function canAccessTemplate(userTier: TemplateAccessTier, needed: TemplateAccessTier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[needed];
}

/** Maps template.category → the project content_type used by the create flow. */
export function categoryToContentType(category: string): string {
  switch (category) {
    case "short_video": return "short_reel";
    case "long_video": return "long_video";
    case "documentary": return "documentary";
    case "product_promo": return "product_promo";
    case "carousel": return "carousel";
    case "image": return "ai_image";
    case "thumbnail": return "thumbnail";
    case "linkedin_post": return "linkedin_post";
    case "seo_pack": return "seo_pack";
    default: return "short_reel";
  }
}
