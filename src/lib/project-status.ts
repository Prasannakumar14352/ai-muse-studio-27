/** How each project status reads to the user, with its badge colours. */
export const PROJECT_STATUS_BADGE: Record<string, { label: string; short: string; cls: string }> = {
  draft: { label: "Draft — waiting for you", short: "Draft", cls: "bg-amber-500/15 text-amber-400" },
  generating: { label: "Generating…", short: "Generating", cls: "bg-orange-500/15 text-orange-400" },
  rendering: { label: "Rendering…", short: "Rendering", cls: "bg-orange-500/15 text-orange-400" },
  generated: { label: "Ready", short: "Ready", cls: "bg-emerald-500/15 text-emerald-400" },
  completed: { label: "Ready", short: "Ready", cls: "bg-emerald-500/15 text-emerald-400" },
  fallback_ready: { label: "Ready", short: "Ready", cls: "bg-emerald-500/15 text-emerald-400" },
  failed: { label: "Failed — credits refunded", short: "Failed", cls: "bg-rose-500/15 text-rose-400" },
};

/** Plain names for project content types. */
export const PROJECT_TYPE_LABEL: Record<string, string> = {
  long_video: "Video", short_reel: "Short / Reel", documentary: "Documentary", talking_object: "Video",
  product_promo: "Product promo", promo_video: "Business promo", ugc: "UGC video", ai_image: "Image",
  carousel: "Carousel", thumbnail: "Thumbnail", caption_only: "Captions", seo_pack: "SEO package", linkedin_post: "LinkedIn post",
};
