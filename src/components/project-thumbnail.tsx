// Reusable thumbnail for a project card. Prefers a real thumbnail URL and
// gracefully falls back to a gradient poster with the project title when the
// URL is missing or fails to load.

import { useState } from "react";
import { Play, Film, Video as VideoIcon, Image as ImageIcon, Layers } from "lucide-react";

type Props = {
  title: string;
  contentType?: string | null;
  style?: string | null;
  platform?: string | null;
  thumbnailUrl?: string | null;
  status?: string | null;
  /** "portrait" for shorts/reels, "landscape" for long videos, "square" for carousels/images. */
  aspect?: "portrait" | "landscape" | "square";
};

// Deterministic gradient so the same title always renders the same fallback.
const GRADIENTS = [
  "from-fuchsia-600 via-purple-700 to-indigo-900",
  "from-cyan-500 via-blue-700 to-indigo-900",
  "from-amber-500 via-rose-600 to-purple-900",
  "from-emerald-500 via-teal-700 to-slate-900",
  "from-rose-500 via-pink-700 to-purple-900",
  "from-orange-500 via-red-600 to-slate-900",
  "from-sky-500 via-indigo-700 to-fuchsia-900",
  "from-lime-500 via-emerald-700 to-slate-900",
];
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function typeIcon(t?: string | null) {
  const v = (t ?? "").toLowerCase();
  if (v.includes("short") || v.includes("reel")) return VideoIcon;
  if (v.includes("long") || v.includes("video") || v.includes("ugc")) return Film;
  if (v.includes("carousel")) return Layers;
  return ImageIcon;
}

function typeLabel(t?: string | null): string {
  const v = (t ?? "").toLowerCase();
  if (v === "short_reel" || v.includes("short") || v.includes("reel")) return "SHORT REEL";
  if (v === "long_video" || v.includes("long")) return "LONG VIDEO";
  if (v === "ugc") return "UGC";
  if (v.includes("carousel")) return "CAROUSEL";
  if (v.includes("thumbnail")) return "THUMBNAIL";
  if (v.includes("image")) return "IMAGE";
  return (t ?? "PROJECT").toUpperCase();
}

export function ProjectThumbnail({
  title,
  contentType,
  style,
  platform,
  thumbnailUrl,
  status,
  aspect = "landscape",
}: Props) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(thumbnailUrl) && !broken;
  const gradient = GRADIENTS[hash(title || "x") % GRADIENTS.length];
  const Icon = typeIcon(contentType);
  const aspectClass =
    aspect === "portrait" ? "aspect-[9/16]" : aspect === "square" ? "aspect-square" : "aspect-video";
  const isDone = (status ?? "").toLowerCase() === "completed" || (status ?? "").toLowerCase() === "done";
  const isProcessing = ["generating", "rendering", "processing", "images_ready", "voice_ready"].includes(
    (status ?? "").toLowerCase(),
  );

  return (
    <div className={`relative w-full ${aspectClass} overflow-hidden rounded-lg bg-black/40`}>
      {showImage ? (
        <img
          src={thumbnailUrl!}
          alt={title}
          loading="lazy"
          onError={() => setBroken(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_left,white,transparent_60%)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
            <Icon className="w-8 h-8 text-white/80 mb-2 drop-shadow" />
            <div className="text-white font-bold text-sm leading-tight line-clamp-3 drop-shadow">
              {title}
            </div>
          </div>
        </div>
      )}

      {/* Bottom gradient + badges */}
      <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="absolute top-2 left-2 flex items-center gap-1">
        <span className="text-[10px] font-bold tracking-wider bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-white">
          {typeLabel(contentType)}
        </span>
      </div>
      {isDone && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="w-5 h-5 text-black ml-0.5" fill="currentColor" />
          </div>
        </div>
      )}
      {isProcessing && (
        <div className="absolute top-2 right-2 text-[10px] font-semibold bg-amber-500/90 text-black px-1.5 py-0.5 rounded">
          {(status ?? "").replace(/_/g, " ")}
        </div>
      )}
      <div className="absolute bottom-1.5 left-2 right-2 flex items-center gap-1.5 text-[10px] text-white/80">
        {style && <span className="truncate">{style}</span>}
        {platform && <span className="truncate">· {platform}</span>}
      </div>
    </div>
  );
}
