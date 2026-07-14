// Branded, dependency-free preview for Premium Templates.
// - If the row has preview_video_url + preview_type=video, render a muted looping <video>.
// - Else if preview_image_url is set, render a lazy <img>.
// - Else render a category-specific SVG placeholder in the CreatorFlow AI
//   dark / orange-pink brand.
// - Any load failure falls back to the branded placeholder rather than blank.

import { useState } from "react";
import { Sparkles, Film, Layers, Image as ImageIcon, Type, PlayCircle, Video, Linkedin } from "lucide-react";

type Props = {
  previewType?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  posterUrl?: string | null;
  alt?: string | null;
  name: string;
  category: string;
  className?: string;
};

const CATEGORY_ICON: Record<string, typeof Sparkles> = {
  short_video: Film,
  long_video: Video,
  documentary: Video,
  product_promo: Film,
  carousel: Layers,
  image: ImageIcon,
  thumbnail: Sparkles,
  linkedin_post: Linkedin,
  seo_pack: Type,
};

const CATEGORY_LABEL: Record<string, string> = {
  short_video: "Short Video",
  long_video: "Long Video",
  documentary: "Documentary",
  product_promo: "Product Promo",
  carousel: "Carousel",
  image: "Image",
  thumbnail: "Thumbnail",
  linkedin_post: "LinkedIn",
  seo_pack: "SEO Pack",
};

export function TemplatePreview({
  previewType, imageUrl, videoUrl, posterUrl, alt, name, category, className,
}: Props) {
  const [failed, setFailed] = useState(false);
  const isVideo = previewType === "video" && !!videoUrl && !failed;
  const hasImage = !isVideo && !!imageUrl && !failed;

  if (isVideo) {
    return (
      <div className={`relative w-full h-full ${className ?? ""}`}>
        <video
          src={videoUrl!}
          poster={posterUrl ?? undefined}
          muted
          playsInline
          loop
          autoPlay
          preload="metadata"
          onError={() => setFailed(true)}
          aria-label={alt ?? name}
          className="w-full h-full object-cover"
        />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-0.5 text-[10px] text-white/90">
          <PlayCircle className="w-3 h-3" /> preview
        </span>
      </div>
    );
  }

  if (hasImage) {
    return (
      <img
        src={imageUrl!}
        alt={alt ?? name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover ${className ?? ""}`}
      />
    );
  }

  // Branded fallback
  const Icon = CATEGORY_ICON[category] ?? Sparkles;
  const label = CATEGORY_LABEL[category] ?? category;
  return (
    <div
      role="img"
      aria-label={alt ?? `${label} template: ${name}`}
      className={`relative w-full h-full overflow-hidden bg-gradient-to-br from-[#1a0f2e] via-[#2b1447] to-[#3b1220] flex flex-col items-center justify-center ${className ?? ""}`}
    >
      {/* Glow accents */}
      <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-[color:var(--neon-pink)]/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-[color:var(--brand-orange)]/25 blur-3xl" />
      <div className="relative flex flex-col items-center text-center px-4">
        <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lg">
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-white/60">{label}</div>
        <div className="mt-1 text-sm font-semibold text-white/90 line-clamp-2 max-w-[220px]">{name}</div>
      </div>
    </div>
  );
}
