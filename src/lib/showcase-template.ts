import { z } from "zod";

export const showcaseCategories = [
  "Indian Mythology",
  "3D Animation",
  "Telugu Stories",
  "Epic Fantasy",
  "Photorealistic Cinema",
  "Future Documentary",
  "Historical Documentary",
  "Horror and Mystery",
  "Motivational Stories",
  "Product Advertisements",
  "Business Promotion",
  "Educational Videos",
  "Science Fiction",
  "YouTube Shorts",
  "Instagram Reels",
] as const;
export const showcaseStyles = [
  "cinematic",
  "documentary",
  "realistic",
  "ghibli",
  "anime",
  "pixar",
  "3d",
  "dark_mystery",
  "luxury",
  "cyberpunk",
  "minimal_product",
  "futuristic",
  "indian_mythology",
  "epic_fantasy",
  "photorealistic_cinema",
] as const;

export const showcaseTemplate = z.object({
  version: z.literal(1),
  topic: z.string().trim().min(1).max(100),
  style: z.enum(showcaseStyles).default("cinematic"),
  duration: z
    .union([
      z.literal(30),
      z.literal(60),
      z.literal(180),
      z.literal(300),
      z.literal(540),
      z.literal(720),
    ])
    .default(30),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  language: z
    .enum(["auto", "English", "Telugu", "Hindi", "Tamil", "Kannada", "Malayalam"])
    .default("English"),
  voice: z.enum(["George", "male", "female", "documentary_narrator"]).default("George"),
  motionMode: z.enum(["off", "key", "full"]).default("off"),
  motionModel: z.enum(["standard", "premium", "veo-fast", "veo-standard"]).default("standard"),
  sameCharacter: z.boolean().default(false),
  visualInstructions: z.string().trim().max(1000).default(""),
  musicMood: z
    .enum([
      "Auto",
      "Epic cinematic",
      "Divine orchestral",
      "Indian devotional instrumental",
      "Adventure",
      "Emotional piano",
      "Suspense",
      "Dark cinematic",
      "Peaceful",
      "Corporate",
      "Futuristic",
      "Upbeat",
    ])
    .default("Auto"),
  backgroundMusicEnabled: z.boolean().default(false),
  soundEffectsEnabled: z.boolean().default(false),
  ambienceEnabled: z.boolean().default(false),
  audioSource: z.enum(["separate", "native", "hybrid"]).default("separate"),
  resolution: z.enum(["720p", "1080p"]).default("720p"),
  fps: z.union([z.literal(24), z.literal(30)]).default(30),
});
export type ShowcaseTemplate = z.infer<typeof showcaseTemplate>;
export const showcaseMetadata = z.object({
  categories: z.array(z.enum(showcaseCategories)).max(15).default([]),
  language: z.string().trim().max(40).default(""),
  description: z.string().trim().max(1200).default(""),
  attribution: z.string().trim().max(120).default(""),
  featured: z.boolean().default(false),
  provenance: z.enum(["creatorflow", "external", "demo", "customer"]).default("external"),
  promptKind: z.enum(["original", "example"]).default("example"),
  durationSeconds: z.number().finite().positive().max(1800).optional(),
  width: z.number().int().positive().max(8192).optional(),
  height: z.number().int().positive().max(8192).optional(),
  rights: z.boolean().default(false),
  reviewed: z.boolean().default(false),
  template: showcaseTemplate.optional(),
});

export type ShowcaseMetadata = z.infer<typeof showcaseMetadata>;
export function publicShowcaseMetadata(raw: unknown) {
  const parsed = showcaseMetadata.safeParse(raw ?? {});
  if (!parsed.success) return undefined;
  const { rights: _rights, reviewed: _reviewed, ...metadata } = parsed.data;
  return metadata;
}

export function validateShowcasePublication(row: {
  title?: string | null;
  prompt?: string | null;
  showcase_video_path?: string | null;
  showcase_poster_path?: string | null;
  showcase_metadata?: ShowcaseMetadata | null;
}) {
  const metadata = row.showcase_metadata;
  return Boolean(
    row.title?.trim() &&
    row.prompt?.trim() &&
    row.showcase_video_path &&
    row.showcase_poster_path &&
    metadata?.rights &&
    metadata.reviewed &&
    metadata.width &&
    metadata.height &&
    metadata.durationSeconds,
  );
}

export function selectShowcaseItems<
  T extends {
    title: string | null;
    prompt?: string | null;
    display_order: number;
    showcase_metadata?: Pick<
      ShowcaseMetadata,
      "featured" | "categories" | "language" | "description"
    > | null;
  },
>(items: T[], category: string, language: string, search: string) {
  const term = search.trim().toLocaleLowerCase();
  return items
    .filter((item) => {
      const meta = item.showcase_metadata;
      return (
        (!category || meta?.categories.includes(category as (typeof showcaseCategories)[number])) &&
        (!language || meta?.language === language) &&
        (!term ||
          [item.title, item.prompt, meta?.description].some((text) =>
            text?.toLocaleLowerCase().includes(term),
          ))
      );
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.showcase_metadata?.featured)) -
          Number(Boolean(a.showcase_metadata?.featured)) || a.display_order - b.display_order,
    );
}
