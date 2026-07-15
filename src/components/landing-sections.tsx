import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Play, Pause, Star, Check, X, ShieldCheck, Sparkles, Briefcase, Download,
  Infinity as InfinityIcon, Calendar, Coins, Key, Cloud, HeadphonesIcon,
  Video as VideoIcon, Image as ImageIcon, Layers, Linkedin, Type as TypeIcon,
  Wand2, Send, AlertCircle, Clock, Loader2, Maximize2, Volume2, VolumeX,
} from "lucide-react";
import {
  PRODUCT_WALKTHROUGHS, WRITTEN_TESTIMONIALS,
  REFUND_ELIGIBLE, REFUND_INELIGIBLE, TRUST_BADGES,
  type Testimonial, type ProductWalkthrough,
} from "@/lib/landing-content";
import { listPublishedLandingMedia, type LandingMediaRow } from "@/lib/landing-media.functions";
import demoAsset from "@/assets/demo/creatorflow-demo.mp4.asset.json";
import demoPosterAsset from "@/assets/demo/creatorflow-demo-poster.jpg.asset.json";

const BUILTIN_DEMO_VIDEO = demoAsset.url;
const BUILTIN_DEMO_POSTER = demoPosterAsset.url;

function landingRowToTestimonial(r: LandingMediaRow): Testimonial {
  return {
    id: r.id,
    name: r.title ?? "Customer",
    country: r.country ?? "",
    role: (r.subtitle as Testimonial["role"]) ?? "Instagram Creator",
    company: r.company ?? undefined,
    photo: r.photo_url ?? r.poster_url ?? "https://i.pravatar.cc/400",
    rating: (r.rating ?? 5) as Testimonial["rating"],
    review: r.review ?? "",
    quote: r.quote ?? undefined,
    source: (r.source ?? "customer") as Testimonial["source"],
    videoUrl: r.video_url ?? undefined,
    videoType: (r.video_type === "webm" ? "mp4" : (r.video_type ?? undefined)) as Testimonial["videoType"],
    duration: r.duration ?? undefined,
  };
}


const HERO_FEATURES = [
  { icon: VideoIcon, label: "AI Video Studio" },
  { icon: ImageIcon, label: "AI Images" },
  { icon: Layers, label: "Carousels" },
  { icon: Linkedin, label: "LinkedIn Posts" },
  { icon: Wand2, label: "Thumbnails" },
  { icon: TypeIcon, label: "Captions" },
  { icon: Send, label: "Direct Publishing" },
];

/* ---------------------- 1. DEMO — real screen recording of the app ---------------------- */

/**
 * Plays the built-in CreatorFlow AI screen recording captured directly from
 * the live app. Admins can override the source by publishing a `demo` row
 * in /admin/landing (MP4 URL). Autoplay is muted+inline to comply with
 * every browser's autoplay policy; a fullscreen modal offers unmuted play.
 */
export function DemoVideoSection() {
  // Admin override: first published landing_media row of kind 'demo'
  const { data: dbRows } = useQuery({
    queryKey: ["landing-media-public"],
    queryFn: () => listPublishedLandingMedia(),
    staleTime: 60_000,
  });
  const demoOverride = (dbRows ?? []).find(
    (r) => r.kind === "demo" && r.video_url && (r.video_type === "mp4" || r.video_type === "webm"),
  );
  const videoUrl = demoOverride?.video_url ?? BUILTIN_DEMO_VIDEO;
  const posterUrl = demoOverride?.poster_url ?? BUILTIN_DEMO_POSTER;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errored, setErrored] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = useCallback(() => {
    setErrored(false);
    setRetryKey((k) => k + 1);
  }, []);


  // Pause when scrolled out of view; resume when visible (saves bandwidth,
  // matches Notion/Vercel demo behavior).
  useEffect(() => {
    const el = containerRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          v.pause();
        } else if (playing) {
          v.play().catch(() => { /* autoplay blocked */ });
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [playing]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }, []);

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold">
          See CreatorFlow AI <span className="gradient-text">in Action</span>
        </h2>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          A real screen recording of the live product — Dashboard, Research, Strategy, Video Studio,
          Thumbnails, Carousels, LinkedIn, Publishing and Analytics.
        </p>

        <div ref={containerRef} className="mt-10 glass rounded-3xl p-2 shadow-[var(--shadow-glow)]">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-[#0a0714] group">
            {/* Branded gradient underlay — visible if the <video> element ever
                fails to paint (network hiccup, decode error, poster missing).
                Guarantees the card never shows a plain black rectangle. */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(1200px 800px at 20% 10%, rgba(120,40,180,0.35) 0%, transparent 60%), radial-gradient(1000px 700px at 80% 90%, rgba(255,60,140,0.25) 0%, transparent 60%), #0a0714",
              }}
            />
            {!errored && (
              <video
                key={retryKey}
                ref={videoRef}
                src={videoUrl}
                poster={posterUrl}
                autoPlay
                muted={muted}
                loop
                playsInline
                preload="metadata"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => setErrored(true)}
                onTimeUpdate={(e) => {
                  const t = e.currentTarget;
                  setProgress(t.duration > 0 ? (t.currentTime / t.duration) * 100 : 0);
                }}
                className="relative w-full h-full object-cover"
              />
            )}
            {errored && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 text-white z-10">
                <div className="glass rounded-2xl px-6 py-5 max-w-sm">
                  <AlertCircle className="w-8 h-8 text-[color:var(--neon-pink)] mx-auto mb-3" />
                  <div className="font-semibold">Video failed to load</div>
                  <p className="text-sm text-white/70 mt-1">
                    Check your connection and try again.
                  </p>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg gradient-primary text-white text-sm px-4 py-2"
                  >
                    <Play className="w-4 h-4" /> Retry
                  </button>
                </div>
              </div>
            )}
            <span className="absolute top-3 left-3 glass px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider text-white/85 z-10">
              Live product recording
            </span>

            {/* Controls overlay */}
            {!errored && (
            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition z-10">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? "Pause demo" : "Play demo"}
                  className="w-9 h-9 rounded-full glass flex items-center justify-center text-white hover:scale-105 transition"
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
                <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-[width] duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => { setMuted((m) => !m); if (videoRef.current) videoRef.current.muted = !muted ? false : true; }}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className="w-9 h-9 rounded-full glass flex items-center justify-center text-white hover:scale-105 transition"
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreen(true)}
                  aria-label="Open fullscreen"
                  className="w-9 h-9 rounded-full glass flex items-center justify-center text-white hover:scale-105 transition"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            )}
          </div>

        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {HERO_FEATURES.map((f) => (
            <div key={f.label} className="glass rounded-full px-4 py-2 text-sm flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-[color:var(--neon-purple)]" />
              <f.icon className="w-3.5 h-3.5 text-muted-foreground" />
              {f.label}
            </div>
          ))}
        </div>

        <Link
          to="/auth"
          className="mt-10 inline-flex rounded-xl gradient-primary px-8 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]"
        >
          Start Creating Today
        </Link>
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="CreatorFlow AI product demo"
          onClick={() => setFullscreen(false)}
        >
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Close demo"
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:scale-105 transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="relative w-full max-w-7xl aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={videoUrl}
              poster={posterUrl}
              controls
              autoPlay
              playsInline
              controlsList="nodownload"
              className="w-full h-full object-contain bg-black"
            />
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------------- 2. VIDEO TESTIMONIALS ---------------------- */

function StarRow({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} className="w-3.5 h-3.5 fill-[color:var(--neon-pink)] text-[color:var(--neon-pink)]" />
      ))}
    </div>
  );
}

type PlayingVideo = {
  name: string;
  url: string;
  type: "mp4" | "youtube" | "vimeo";
};

function TestimonialVideoModal({ video, onClose }: { video: PlayingVideo; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loading, setLoading] = useState(video.type === "mp4");
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      try { videoRef.current?.pause(); } catch { /* noop */ }
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Testimonial from ${video.name}`}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close video"
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:scale-105 transition"
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="relative w-full max-w-5xl aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && !errored && (
          <div className="absolute inset-0 flex items-center justify-center text-white/70 gap-2 text-sm z-10 pointer-events-none">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        )}
        {errored ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 text-white">
            <AlertCircle className="w-8 h-8 text-rose-400 mb-3" />
            <div className="font-semibold">This video can't be played right now.</div>
            <a href={video.url} target="_blank" rel="noreferrer" className="mt-3 text-sm underline text-white/80">
              Open in a new tab
            </a>
          </div>
        ) : video.type === "mp4" ? (
          <video
            ref={videoRef}
            key={video.url}
            src={video.url}
            controls
            autoPlay
            playsInline
            preload="metadata"
            controlsList="nodownload"
            onLoadedData={() => setLoading(false)}
            onError={() => { setLoading(false); setErrored(true); }}
            className="w-full h-full object-contain bg-black"
          >
            Your browser can't play this video.
          </video>
        ) : (
          <iframe
            key={video.url}
            src={video.url}
            title={`Testimonial from ${video.name}`}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            onLoad={() => setLoading(false)}
            className="w-full h-full"
          />
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source?: Testimonial["source"] }) {
  if (source === "customer" || !source) return null;
  const label = source === "demo" ? "Product walkthrough" : "Sample testimonial";
  return (
    <span className="absolute top-3 left-3 z-10 glass px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider text-white/90">
      {label}
    </span>
  );
}

function VideoTestimonialCard({
  t, onPlay,
}: { t: Testimonial; onPlay: (v: PlayingVideo) => void }) {
  const hasVideo = Boolean(t.videoUrl && t.videoType);
  const isMp4 = hasVideo && t.videoType === "mp4";
  const cardRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);

  // Inline autoplay-muted-loop preview when the card is on screen.
  useEffect(() => {
    if (!isMp4) return;
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        const v = previewRef.current;
        if (!v) return;
        if (entry.isIntersecting) v.play().catch(() => { /* autoplay may be blocked */ });
        else v.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isMp4]);

  return (
    <div ref={cardRef} className="glass rounded-2xl p-4 flex flex-col">
      <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-black">
        {/* Inline muted-loop preview for MP4 sources; falls back to portrait */}
        {isMp4 ? (
          <video
            ref={previewRef}
            src={t.videoUrl}
            poster={t.photo}
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <img
            src={t.photo}
            alt={`Portrait of ${t.name}, ${t.role}${t.company ? " at " + t.company : ""}`}
            loading="lazy"
            className="w-full h-full object-cover opacity-85"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
        <SourceBadge source={t.source} />
        {t.quote && (
          <div className="absolute left-4 right-4 bottom-16 text-white font-semibold text-sm md:text-base leading-snug drop-shadow pointer-events-none">
            "{t.quote}"
          </div>
        )}
        {hasVideo ? (
          <button
            type="button"
            onClick={() =>
              onPlay({ name: t.name, url: t.videoUrl!, type: t.videoType! })
            }
            className="absolute inset-0 w-full h-full group flex items-center justify-center"
            aria-label={`Play ${t.name}`}
          >
            <div className={`w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-[var(--shadow-glow)] group-hover:scale-110 transition ${visible && isMp4 ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </div>
            {t.duration && (
              <span className="absolute bottom-3 right-3 flex items-center gap-1 glass px-2 py-1 rounded-full text-[11px] text-white/90">
                <Clock className="w-3 h-3" /> {t.duration}
              </span>
            )}
          </button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 pointer-events-none">
            <span className="glass px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-wide text-white/80">
              Video coming soon
            </span>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <img src={t.photo} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{t.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {t.role}{t.company ? ` · ${t.company}` : ""} · {t.country}
          </div>
        </div>
        <StarRow n={t.rating} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{t.review}</p>
    </div>
  );
}

export function VideoTestimonialsSection() {
  const [playing, setPlaying] = useState<PlayingVideo | null>(null);
  const { data: dbRows } = useQuery({
    queryKey: ["landing-media-public"],
    queryFn: () => listPublishedLandingMedia(),
    staleTime: 60_000,
  });
  // Genuine customer reviews only. Product walkthroughs and sample rows are
  // never rendered here — they live in the walkthrough section below.
  const testimonials = (dbRows ?? [])
    .filter((r) => r.kind === "testimonial" && r.source === "customer" && r.video_url)
    .map(landingRowToTestimonial);

  // Hide the section entirely until at least one real customer testimonial
  // has been published from /admin/landing.
  if (testimonials.length === 0) return null;

  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold">Loved by <span className="gradient-text">real creators</span></h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Verified customer reviews recorded by CreatorFlow AI users.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t: Testimonial) => (
            <VideoTestimonialCard key={t.id} t={t} onPlay={setPlaying} />
          ))}
        </div>
      </div>
      {playing && (
        <TestimonialVideoModal video={playing} onClose={() => setPlaying(null)} />
      )}
    </section>
  );
}

/* ---------- 2b. PRODUCT WALKTHROUGHS — "See CreatorFlow AI in Action" ---------- */

function ProductWalkthroughCard({
  w, onPlay,
}: { w: ProductWalkthrough; onPlay: (v: PlayingVideo) => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        const v = previewRef.current;
        if (!v) return;
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={cardRef} className="glass rounded-2xl p-4 flex flex-col">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
        <video
          ref={previewRef}
          src={w.videoUrl}
          poster={w.poster}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        <span className="absolute top-3 left-3 z-10 glass px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider text-white/90">
          Product walkthrough
        </span>
        <button
          type="button"
          onClick={() => onPlay({ name: w.title, url: w.videoUrl, type: "mp4" })}
          aria-label={`Play ${w.title}`}
          className="absolute inset-0 w-full h-full group flex items-center justify-center"
        >
          <div className={`w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-[var(--shadow-glow)] group-hover:scale-110 transition ${visible ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
            <Play className="w-6 h-6 text-white fill-white ml-0.5" />
          </div>
          <span className="absolute bottom-3 right-3 flex items-center gap-1 glass px-2 py-1 rounded-full text-[11px] text-white/90">
            <Clock className="w-3 h-3" /> {w.duration}
          </span>
        </button>
      </div>
      <div className="mt-4">
        <div className="text-sm font-semibold">{w.title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{w.caption}</p>
      </div>
    </div>
  );
}

export function ProductWalkthroughsSection() {
  const [playing, setPlaying] = useState<PlayingVideo | null>(null);
  if (PRODUCT_WALKTHROUGHS.length === 0) return null;
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold">See CreatorFlow AI <span className="gradient-text">in Action</span></h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Short screen recordings of the real product — not customer testimonials.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCT_WALKTHROUGHS.map((w) => (
            <ProductWalkthroughCard key={w.id} w={w} onPlay={setPlaying} />
          ))}
        </div>
      </div>
      {playing && (
        <TestimonialVideoModal video={playing} onClose={() => setPlaying(null)} />
      )}
    </section>
  );
}




/* ---------------------- 3. WRITTEN TESTIMONIAL CAROUSEL ---------------------- */

function WrittenCard({ t }: { t: Testimonial }) {
  const isSample = (t.source ?? "sample") !== "customer";
  return (
    <div className="glass rounded-2xl p-6 w-[340px] shrink-0 flex flex-col relative">
      {isSample && (
        <span
          className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 border border-amber-400/30 text-amber-200"
          title="Illustrative sample copy — not a real customer review"
        >
          Sample Review
        </span>
      )}
      <StarRow n={t.rating} />
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">"{t.review}"</p>
      <div className="mt-5 flex items-center gap-3">
        <img
          src={t.photo}
          alt={t.name}
          loading="lazy"
          className="w-11 h-11 rounded-full object-cover ring-1 ring-white/10"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://ui-avatars.com/api/?background=1f2937&color=fff&name=${encodeURIComponent(t.name)}`; }}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{t.name}</div>
          <div className="text-xs text-muted-foreground truncate">{t.role} · {t.country}</div>
        </div>
      </div>
    </div>
  );
}

export function WrittenTestimonialsSection() {
  // Merge admin-published written reviews (testimonials with no video) with the
  // built-in Indian sample reviews. Verified customer reviews (`source === "customer"`)
  // hide the "Sample Review" badge automatically via WrittenCard.
  const { data: dbRows } = useQuery({
    queryKey: ["landing-media-public"],
    queryFn: () => listPublishedLandingMedia(),
    staleTime: 60_000,
  });
  const dbWritten = (dbRows ?? [])
    .filter((r) => r.kind === "testimonial" && !r.video_url && (r.review ?? "").trim().length > 0)
    .map(landingRowToTestimonial);

  // Prefer admin-published rows first; fall back to built-in Indian samples.
  const combined = dbWritten.length > 0 ? [...dbWritten, ...WRITTEN_TESTIMONIALS] : WRITTEN_TESTIMONIALS;
  const hasRealCustomers = combined.some((t) => (t.source ?? "sample") === "customer");
  const loop = [...combined, ...combined];

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-6 text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold">
          {hasRealCustomers ? "Loved by creators" : "Sample Creator Reviews"}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
          {hasRealCustomers
            ? "Real reviews from creators using CreatorFlow AI, alongside illustrative samples clearly marked as such."
            : "Illustrative sample reviews from Indian creators showing how CreatorFlow AI fits different workflows. Real customer reviews will replace these as they come in."}
        </p>
      </div>
      <div className="relative overflow-hidden group">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10" />
        <div className="flex gap-5 animate-marquee group-hover:[animation-play-state:paused]" style={{ width: "max-content" }}>
          {loop.map((t, i) => <WrittenCard key={`${t.id}-${i}`} t={t} />)}
        </div>
      </div>
    </section>
  );
}

/* ---------------------- 4. GUARANTEE ---------------------- */

export function GuaranteeSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="glass rounded-3xl p-10 md:p-14 relative overflow-hidden">
          <div className="absolute inset-0 gradient-primary opacity-10 pointer-events-none" />
          <div className="relative grid md:grid-cols-[auto_1fr] gap-8 items-start">
            <div className="w-24 h-24 rounded-3xl gradient-primary flex items-center justify-center shadow-[var(--shadow-glow)] mx-auto md:mx-0">
              <ShieldCheck className="w-12 h-12 text-white" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-[color:var(--neon-purple)] font-semibold mb-2">
                CreatorFlow AI Satisfaction Guarantee
              </div>
              <h2 className="text-3xl md:text-4xl font-bold">We stand behind CreatorFlow AI.</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                If you experience technical issues that prevent you from accessing or using the platform, our support
                team will work with you to resolve them quickly. If we are unable to resolve an eligible platform issue
                within the guarantee period, we will review your case for a refund or account credit.
              </p>
            </div>
          </div>

          <div className="relative mt-10 grid md:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-6">
              <h3 className="font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" /> Eligible refund cases
              </h3>
              <ul className="mt-4 space-y-2.5">
                {REFUND_ELIGIBLE.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                    <span className="text-muted-foreground">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass rounded-2xl p-6">
              <h3 className="font-semibold flex items-center gap-2">
                <X className="w-4 h-4 text-rose-400" /> Not eligible
              </h3>
              <ul className="mt-4 space-y-2.5">
                {REFUND_INELIGIBLE.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-sm">
                    <X className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                    <span className="text-muted-foreground">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative mt-6 glass rounded-2xl p-6 flex flex-col md:flex-row gap-5 items-start">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shrink-0">
              <HeadphonesIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">Real Human Support</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                We aim to respond within one business day. Most technical issues are resolved within 24–48 hours.
                If an issue cannot be resolved, we will provide an appropriate solution, including refunds or account
                credits when applicable.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------- 5. TRUST BADGES ---------------------- */

const BADGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  shield: ShieldCheck, briefcase: Briefcase, download: Download,
  infinity: InfinityIcon, calendar: Calendar, coins: Coins,
  key: Key, cloud: Cloud, sparkles: Sparkles,
};

export function TrustBadgesSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold">Why creators <span className="gradient-text">trust CreatorFlow AI</span></h2>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
          {TRUST_BADGES.map((b) => {
            const Icon = BADGE_ICONS[b.icon] ?? Sparkles;
            return (
              <div key={b.title} className="glass rounded-2xl p-6 hover:border-white/20 transition group">
                <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center mb-4 group-hover:scale-110 transition">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{b.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
