import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LandingMediaKind = "testimonial" | "demo" | "walkthrough" | "showcase";
export type LandingMediaStatus = "draft" | "published";
export type LandingVideoType = "mp4" | "webm" | "youtube" | "vimeo";
export type LandingSource = "customer" | "sample" | "demo";

export interface LandingMediaRow {
  id: string;
  kind: LandingMediaKind;
  title: string | null;
  subtitle: string | null;
  country: string | null;
  company: string | null;
  quote: string | null;
  review: string | null;
  poster_url: string | null;
  video_url: string | null;
  video_type: LandingVideoType | null;
  duration: string | null;
  source: LandingSource | null;
  rating: number | null;
  status: LandingMediaStatus;
  display_order: number;
  photo_url: string | null;
  consent_confirmed: boolean;
  /** Showcase: the exact prompt / idea that produced the video. */
  prompt?: string | null;
  /** Showcase: which CreatorFlow tool made it. */
  tool?: string | null;
  /** Showcase: where it came from in the app (video or project id). */
  source_ref?: string | null;
  created_at: string;
  updated_at: string;
}

/** Public — returns only published items. Safe for SSR/anon. */
export const listPublishedLandingMedia = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const supabase = createClient(process.env.SUPABASE_URL!, key, {
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
  const { data, error } = await supabase
    .from("landing_media")
    .select("*")
    .eq("status", "published")
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LandingMediaRow[];
});

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

/** Admin — returns everything (draft + published). */
export const listAllLandingMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("landing_media")
      .select("*")
      .order("kind", { ascending: true })
      .order("display_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LandingMediaRow[];
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["testimonial", "demo", "walkthrough", "showcase"]),
  title: z.string().max(200).nullable().optional(),
  subtitle: z.string().max(300).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  quote: z.string().max(400).nullable().optional(),
  review: z.string().max(2000).nullable().optional(),
  poster_url: z.string().url().max(1000).nullable().optional().or(z.literal("")),
  video_url: z.string().url().max(1000).nullable().optional().or(z.literal("")),
  video_type: z.enum(["mp4", "webm", "youtube", "vimeo"]).nullable().optional(),
  duration: z.string().max(20).nullable().optional(),
  source: z.enum(["customer", "sample", "demo"]).nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  status: z.enum(["draft", "published"]),
  display_order: z.number().int().min(0).max(999).default(0),
  photo_url: z.string().url().max(1000).nullable().optional().or(z.literal("")),
  consent_confirmed: z.boolean().optional().default(false),
  prompt: z.string().max(1500).nullable().optional(),
  tool: z.string().max(60).nullable().optional(),
  source_ref: z.string().max(120).nullable().optional(),
});

export const upsertLandingMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpsertSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const clean: Record<string, unknown> = { ...data };
    if (clean.poster_url === "") clean.poster_url = null;
    if (clean.video_url === "") clean.video_url = null;
    if (clean.photo_url === "") clean.photo_url = null;
    if (data.kind === "showcase" && data.status === "published" && (!data.video_url || !data.prompt?.trim())) {
      throw new Error("A showcase video needs a video and its prompt before it can be published.");
    }
    // Enforce: real customer testimonials can only be published with consent confirmed.
    if (
      data.kind === "testimonial" &&
      data.status === "published" &&
      data.source === "customer" &&
      !data.consent_confirmed
    ) {
      throw new Error("Customer consent must be confirmed before publishing a real customer testimonial.");
    }
    if (data.id) {
      const { id, ...rest } = clean as any;
      const { data: row, error } = await context.supabase
        .from("landing_media").update(rest).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return row as LandingMediaRow;
    }
    const { id: _drop, ...insert } = clean as any;
    const { data: row, error } = await context.supabase
      .from("landing_media").insert(insert).select("*").single();
    if (error) throw new Error(error.message);
    return row as LandingMediaRow;
  });

export const deleteLandingMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("landing_media").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setLandingMediaOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ items: z.array(z.object({ id: z.string().uuid(), display_order: z.number().int() })).max(100) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    for (const it of data.items) {
      const { error } = await context.supabase
        .from("landing_media").update({ display_order: it.display_order }).eq("id", it.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
