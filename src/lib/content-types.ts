// Canonical catalog of content types the AI Creator Flow supports.
// Each entry maps to a `projects.content_type` value stored in the DB and
// tells the New Project hub, module tabs, and Projects filters how to route
// and label it. Adding a new type here surfaces it everywhere.

import type { LucideIcon } from "lucide-react";
import {
  Film, Zap, MessageCircleMore, Camera, Package, Layers,
  Image as ImageIcon, Sparkles, Type, Search, Linkedin,
} from "lucide-react";

export type ContentTypeId =
  | "long_video"
  | "short_reel"
  | "talking_object"
  | "documentary"
  | "product_promo"
  | "carousel"
  | "ai_image"
  | "thumbnail"
  | "caption_only"
  | "seo_pack"
  | "linkedin_post";

export type ModuleId = "videos" | "carousels" | "images" | "thumbnails" | "captions" | "linkedin";

export type ContentTypeMeta = {
  id: ContentTypeId;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
  module: ModuleId;
  /** Route path opened by the New Project hub for this type. */
  route: "/create" | "/create/carousel";
  /** Default aspect ratio hint for this content type. */
  aspect?: "9:16" | "1:1" | "4:5" | "16:9";
  badge?: string;
};

export const CONTENT_TYPES: ContentTypeMeta[] = [
  {
    id: "long_video", label: "Long Video", short: "Long",
    description: "Full-length YouTube-ready video with chapters, retention beats and SEO pack.",
    icon: Film, module: "videos", route: "/create", aspect: "16:9",
  },
  {
    id: "short_reel", label: "Short Video / Reel", short: "Reel",
    description: "Vertical hook-first reel for Instagram, TikTok and Shorts.",
    icon: Zap, module: "videos", route: "/create", aspect: "9:16",
  },
  {
    id: "talking_object", label: "AI Talking Object", short: "Talking",
    description: "Product, food or mascot becomes a lip-synced character with real motion.",
    icon: MessageCircleMore, module: "videos", route: "/create", aspect: "9:16",
    badge: "New",
  },
  {
    id: "documentary", label: "Documentary", short: "Docu",
    description: "Story-driven cinematic explainer with narration and B-roll.",
    icon: Camera, module: "videos", route: "/create", aspect: "16:9",
  },
  {
    id: "product_promo", label: "Product Promotion", short: "Promo",
    description: "Punchy product spot with hook, features, proof and CTA.",
    icon: Package, module: "videos", route: "/create", aspect: "9:16",
  },
  {
    id: "carousel", label: "Instagram Carousel", short: "Carousel",
    description: "Swipeable 4:5 slides with brand kit, editor and 1080×1350 export.",
    icon: Layers, module: "carousels", route: "/create/carousel", aspect: "4:5",
  },
  {
    id: "ai_image", label: "Single Image", short: "Image",
    description: "One-off social, product, character or scene image.",
    icon: ImageIcon, module: "images", route: "/create", aspect: "1:1",
  },
  {
    id: "thumbnail", label: "Thumbnail", short: "Thumb",
    description: "High-CTR YouTube / Reel / carousel cover with layered text.",
    icon: Sparkles, module: "thumbnails", route: "/create", aspect: "16:9",
  },
  {
    id: "caption_only", label: "Caption Package", short: "Captions",
    description: "IG / FB / TikTok captions, YouTube description, hashtags and pinned comment.",
    icon: Type, module: "captions", route: "/create",
  },
  {
    id: "seo_pack", label: "SEO Content Pack", short: "SEO",
    description: "Title, description, keywords, tags and metadata for search.",
    icon: Search, module: "captions", route: "/create",
  },
  {
    id: "linkedin_post", label: "LinkedIn Post", short: "LinkedIn",
    description: "Professional LinkedIn text post with headlines, hooks, hashtags and first comment.",
    icon: Linkedin, module: "linkedin", route: "/create",
  },
];

export const CONTENT_TYPES_BY_ID: Record<ContentTypeId, ContentTypeMeta> =
  Object.fromEntries(CONTENT_TYPES.map((c) => [c.id, c])) as Record<ContentTypeId, ContentTypeMeta>;

/** Content-type values that belong to each sidebar module tab. */
export const MODULE_CONTENT_TYPES: Record<ModuleId, ContentTypeId[]> = {
  videos: ["long_video", "short_reel", "talking_object", "documentary", "product_promo"],
  carousels: ["carousel"],
  images: ["ai_image"],
  thumbnails: ["thumbnail"],
  captions: ["caption_only", "seo_pack"],
  linkedin: ["linkedin_post"],
};

/** Canonical status values shown as filter chips across module pages. */
export const PROJECT_STATUSES = [
  { id: "draft", label: "Drafts" },
  { id: "generating", label: "Generating" },
  { id: "generated", label: "Ready" },
  { id: "rendering", label: "Rendering" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
  { id: "fallback_ready", label: "Fallback Ready" },
] as const;

export type ProjectStatusId = (typeof PROJECT_STATUSES)[number]["id"];
