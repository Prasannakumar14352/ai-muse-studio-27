import { showcaseMetadata, publicShowcaseMetadata, validateShowcasePublication, type ShowcaseMetadata } from "./showcase-template";
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
  showcase_metadata?: (Omit<ShowcaseMetadata, "rights" | "reviewed"> & Partial<Pick<ShowcaseMetadata, "rights" | "reviewed">>) | null;
  showcase_video_path?: string | null;
  showcase_poster_path?: string | null;
  managed_showcase?: boolean;
  created_at: string;
  updated_at: string;
}

async function landingAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const privateBucket = "showcase-private";
const publicColumns = "id,kind,title,subtitle,country,company,quote,review,poster_url,video_url,video_type,duration,source,rating,status,display_order,photo_url,consent_confirmed,prompt,tool,created_at,updated_at";
const uuidInput = (raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw);

export const listPublishedLandingMedia = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await landingAdmin();
  const { data, error } = await supabase.from("landing_media")
    .select(`${publicColumns},showcase_metadata,showcase_video_path,showcase_poster_path`)
    .eq("status", "published").order("display_order");
  if (error) throw new Error("Could not load published media");
  const rows = (data ?? []) as unknown as LandingMediaRow[];
  const paths = rows.flatMap((row) => row.showcase_poster_path ? [row.showcase_poster_path] : []);
  const posters = paths.length ? await supabase.storage.from(privateBucket).createSignedUrls(paths, 1800) : null;
  const signed = new Map(posters?.data?.map((entry) => [entry.path, entry.signedUrl]));
  return rows.map(({ showcase_video_path, showcase_poster_path, showcase_metadata, ...row }) => ({
    ...row,
    video_url: showcase_video_path ? null : row.video_url,
    poster_url: showcase_poster_path ? signed.get(showcase_poster_path) ?? null : row.poster_url,
    managed_showcase: Boolean(showcase_video_path),
    showcase_metadata: publicShowcaseMetadata(showcase_metadata),
  }));
});

export const getPublishedShowcaseVideo = createServerFn({ method: "GET" })
  .inputValidator(uuidInput)
  .handler(async ({ data }) => {
    const supabase = await landingAdmin();
    const { data: row } = await supabase.from("landing_media")
      .select("showcase_video_path,video_url").eq("kind", "showcase").eq("status", "published").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("This video is no longer available");
    if (!row.showcase_video_path) return { url: row.video_url };
    const { data: signed } = await supabase.storage.from(privateBucket).createSignedUrl(row.showcase_video_path, 300);
    if (!signed) throw new Error("This video could not be loaded");
    return { url: signed.signedUrl };
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
    const { data, error } = await (await landingAdmin())
      .from("landing_media")
      .select("*")
      .order("kind", { ascending: true })
      .order("display_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LandingMediaRow[];
  });

const objectPath = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|jpg|png|webp)$/i);

export const previewPrivateShowcase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ path: objectPath }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data: signed } = await (await landingAdmin()).storage.from(privateBucket).createSignedUrl(data.path, 300);
    if (!signed) throw new Error("Preview unavailable");
    return signed.signedUrl;
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
  showcase_metadata: showcaseMetadata.nullable().optional(),
  showcase_video_path: objectPath.nullable().optional(),
  showcase_poster_path: objectPath.nullable().optional(),
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
    const admin = await landingAdmin();
    if (data.kind === "showcase" && data.status === "published") {
      if (!validateShowcasePublication(data)) throw new Error("Upload a private video and poster, provide a prompt and title, and confirm playback and publication rights.");
      if (data.showcase_metadata?.provenance === "creatorflow" && !/^(video|project):/.test(data.source_ref ?? "")) {
        throw new Error("CreatorFlow provenance requires an imported Studio asset.");
      }
      const bucket = admin.storage.from(privateBucket);
      const [video, poster] = await Promise.all([bucket.info(data.showcase_video_path!), bucket.info(data.showcase_poster_path!)]);
      const videoMime = video.data?.contentType ?? video.data?.metadata?.mimetype;
      const posterMime = poster.data?.contentType ?? poster.data?.metadata?.mimetype;
      if (video.error || poster.error || !["video/mp4", "video/webm"].includes(videoMime ?? "") ||
          !["image/jpeg", "image/png", "image/webp"].includes(posterMime ?? "") ||
          !/\.(mp4|webm)$/i.test(data.showcase_video_path!) || !/\.(jpg|png|webp)$/i.test(data.showcase_poster_path!)) {
        throw new Error("Video or poster is missing from the approved showcase bucket.");
      }
    }
    if (data.kind === "showcase") {
      // Preserve untouched legacy references. Managed assets use private storage exclusively.
      if (data.showcase_video_path) clean.video_url = null;
      if (data.showcase_poster_path) clean.poster_url = null;
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
      const { data: row, error } = await admin
        .from("landing_media").update(rest).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return row as LandingMediaRow;
    }
    const { id: _drop, ...insert } = clean as any;
    const { data: row, error } = await admin
      .from("landing_media").insert(insert).select("*").single();
    if (error) throw new Error(error.message);
    return row as LandingMediaRow;
  });

export const deleteLandingMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (await landingAdmin()).from("landing_media").delete().eq("id", data.id);
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
    const admin = await landingAdmin();
    for (const it of data.items) {
      const { error } = await admin
        .from("landing_media").update({ display_order: it.display_order }).eq("id", it.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getPublishedShowcaseTemplate = createServerFn({ method: "GET" })
  .inputValidator(uuidInput)
  .handler(async ({ data }) => {
    const { data: row } = await (await landingAdmin()).from("landing_media")
      .select("showcase_metadata").eq("id", data.id).eq("kind", "showcase").eq("status", "published").maybeSingle();
    return publicShowcaseMetadata(row?.showcase_metadata)?.template ?? null;
  });
