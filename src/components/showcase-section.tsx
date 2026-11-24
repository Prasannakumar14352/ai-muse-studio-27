// Landing: "Made with CreatorFlow AI" — real videos generated in the app,
// each with the exact prompt that made it. Managed in Admin → Landing.
// Hidden until at least one item is published.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { listPublishedLandingMedia, type LandingMediaRow } from "@/lib/landing-media.functions";

function ShowcaseCard({ r }: { r: LandingMediaRow }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Play muted while on screen, pause when scrolled away (saves data on phones).
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    }, { threshold: 0.6 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <div className="snap-start shrink-0 w-[85vw] sm:w-[420px] flex flex-col">
      <div className="relative rounded-2xl overflow-hidden bg-black border border-border aspect-video">
        <video ref={ref} src={r.video_url ?? undefined} poster={r.poster_url ?? undefined}
          muted loop playsInline controls preload="metadata" className="w-full h-full object-cover" />
        {r.tool && (
          <span className="absolute top-3 left-3 text-[10px] uppercase tracking-wider font-semibold rounded-full px-2.5 py-1 bg-black/60 text-white backdrop-blur">
            {r.tool}
          </span>
        )}
      </div>
      <div className="relative mt-6 rounded-2xl border-2 border-dashed border-violet-400/40 bg-violet-950/40 px-5 pt-7 pb-5 text-center flex-1">
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 gradient-primary text-white font-bold text-sm px-5 py-1.5 rounded-full shadow-lg">
          Prompt
        </span>
        <p className="text-sm md:text-base leading-relaxed text-white/90">{r.prompt}</p>
      </div>
    </div>
  );
}

/** Published showcase videos (Admin → Landing). Empty until the admin adds some. */
export function useShowcaseItems() {
  const { data } = useQuery({
    queryKey: ["landing-media-public"],
    queryFn: () => listPublishedLandingMedia(),
    staleTime: 60_000,
  });
  return (data ?? []).filter((r) => r.kind === "showcase" && r.video_url && (r.prompt ?? "").trim());
}

export function ShowcaseSection() {
  const items = useShowcaseItems();
  const rail = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = () => {
    const el = rail.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(update, [items.length]);

  if (!items.length) return null;
  const scroll = (dir: -1 | 1) => {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.9, 460), behavior: "smooth" });
  };

  return (
    <section id="made-with" className="py-20 scroll-mt-24">
      <div className="max-w-7xl mx-auto px-6 text-center mb-10">
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold rounded-full px-2.5 py-1 bg-orange-500/15 text-orange-200 border border-orange-400/20">
          <Sparkles className="w-3.5 h-3.5" /> Made with CreatorFlow AI
        </span>
        <h2 className="mt-4 text-3xl md:text-5xl font-bold">One prompt. <span className="gradient-text">One video.</span></h2>
        <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
          Real videos generated in CreatorFlow, with the exact prompt that made each one. Tap a video to hear it.
        </p>
      </div>
      <div className="relative max-w-7xl mx-auto">
        {!edge.start && (
          <button aria-label="Previous videos" onClick={() => scroll(-1)}
            className="hidden sm:flex absolute left-2 top-[22%] z-10 w-11 h-11 rounded-full gradient-primary text-white items-center justify-center shadow-lg">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {!edge.end && (
          <button aria-label="Next videos" onClick={() => scroll(1)}
            className="hidden sm:flex absolute right-2 top-[22%] z-10 w-11 h-11 rounded-full gradient-primary text-white items-center justify-center shadow-lg">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
        <div ref={rail} onScroll={update}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((r) => <ShowcaseCard key={r.id} r={r} />)}
        </div>
      </div>
    </section>
  );
}
