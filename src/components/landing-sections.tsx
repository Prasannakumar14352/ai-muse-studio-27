import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Play, Star, Check, X, ShieldCheck, Sparkles, Briefcase, Download,
  Infinity as InfinityIcon, Calendar, Coins, Key, Cloud, HeadphonesIcon,
  Video as VideoIcon, Image as ImageIcon, Layers, Linkedin, Type as TypeIcon,
  Wand2, Send, AlertCircle,
} from "lucide-react";
import {
  VIDEO_TESTIMONIALS, WRITTEN_TESTIMONIALS,
  REFUND_ELIGIBLE, REFUND_INELIGIBLE, TRUST_BADGES,
  type Testimonial,
} from "@/lib/landing-content";

const DEMO_VIDEO_URL = "/creatorflow-demo.mp4";
const DEMO_POSTER = "/brand/hero-poster.jpg";

const HERO_FEATURES = [
  { icon: VideoIcon, label: "AI Video Generation" },
  { icon: ImageIcon, label: "AI Images" },
  { icon: Layers, label: "Carousels" },
  { icon: Linkedin, label: "LinkedIn Posts" },
  { icon: Wand2, label: "Thumbnails" },
  { icon: TypeIcon, label: "Captions" },
  { icon: Send, label: "Direct Publishing" },
];

/* ---------------------- 1. DEMO VIDEO ---------------------- */

export function DemoVideoSection() {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handlePlay = () => {
    setError(false);
    setPlaying(true);
  };

  // Once mounted, kick off playback within the same user-gesture window.
  useEffect(() => {
    if (!playing) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    if (p && typeof p.catch === "function") {
      // If the browser blocks programmatic play we still show controls so
      // the user can hit the native play button.
      p.catch(() => {});
    }
  }, [playing]);

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-bold">
          See CreatorFlow AI <span className="gradient-text">in Action</span>
        </h2>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          Watch how a single idea becomes a structured Video Blueprint — script, scenes, voiceover
          and visuals — with a Review &amp; Edit gate before any credits are spent. Then generate
          reels, carousels, LinkedIn posts, thumbnails, captions and images in minutes.
        </p>

        <div className="mt-10 glass rounded-3xl p-2 shadow-[var(--shadow-glow)]">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black group">
            {playing && !error ? (
              <video
                ref={videoRef}
                poster={DEMO_POSTER}
                controls
                controlsList="nodownload"
                playsInline
                preload="metadata"
                onError={() => setError(true)}
                className="w-full h-full object-contain bg-black"
                aria-label="CreatorFlow AI product demo"
              >
                <source src={DEMO_VIDEO_URL} type="video/mp4" />
                Sorry, your browser can't play this video. You can{" "}
                <a href={DEMO_VIDEO_URL} download>download it here</a>.
              </video>
            ) : (
              <button
                type="button"
                onClick={handlePlay}
                className="absolute inset-0 w-full h-full flex items-center justify-center"
                aria-label="Play CreatorFlow AI demo video"
              >
                <img
                  src={DEMO_POSTER}
                  alt="CreatorFlow AI demo preview"
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition"
                />
                <div className="relative z-10 w-20 h-20 rounded-full gradient-primary flex items-center justify-center shadow-[var(--shadow-glow)] group-hover:scale-110 transition">
                  <Play className="w-8 h-8 text-white fill-white ml-1" />
                </div>
                <span className="absolute bottom-6 left-6 glass px-3 py-1.5 rounded-full text-xs font-medium uppercase tracking-wide text-white/90">
                  Blueprint · Review &amp; Edit · Render
                </span>
                {error && (
                  <span className="absolute top-4 right-4 flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs text-rose-300">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Video failed to load. Please try again.
                  </span>
                )}
              </button>
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // Pause on close so audio stops even if the element hasn't unmounted yet.
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
        {video.type === "mp4" ? (
          <video
            ref={videoRef}
            key={video.url}
            src={video.url}
            controls
            autoPlay
            playsInline
            preload="metadata"
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
            className="w-full h-full"
          />
        )}
      </div>
    </div>
  );
}

function VideoTestimonialCard({
  t, onPlay,
}: { t: Testimonial; onPlay: (v: PlayingVideo) => void }) {
  const hasVideo = Boolean(t.videoUrl && t.videoType);
  return (
    <div className="glass rounded-2xl p-4 flex flex-col">
      <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-black">
        <img
          src={t.photo}
          alt={t.name}
          loading="lazy"
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {hasVideo ? (
          <button
            type="button"
            onClick={() =>
              onPlay({ name: t.name, url: t.videoUrl!, type: t.videoType! })
            }
            className="absolute inset-0 w-full h-full group flex items-center justify-center"
            aria-label={`Play testimonial from ${t.name}`}
          >
            <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center shadow-[var(--shadow-glow)] group-hover:scale-110 transition">
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </div>
          </button>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-4 pointer-events-none">
            <span className="glass px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-wide text-white/90">
              Sample testimonial
            </span>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <img src={t.photo} alt={t.name} loading="lazy" className="w-10 h-10 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{t.name}</div>
          <div className="text-xs text-muted-foreground truncate">{t.role} · {t.country}</div>
        </div>
        <StarRow n={t.rating} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{t.review}</p>
    </div>
  );
}

export function VideoTestimonialsSection() {
  const [playing, setPlaying] = useState<PlayingVideo | null>(null);
  return (
    <section className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-4xl md:text-5xl font-bold">Loved by <span className="gradient-text">creators worldwide</span></h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Real creators, real results. Instagram creators, YouTubers, course creators, agencies, freelancers, teachers and business owners ship faster with CreatorFlow AI.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {VIDEO_TESTIMONIALS.map((t) => (
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

/* ---------------------- 3. WRITTEN TESTIMONIAL CAROUSEL ---------------------- */

function WrittenCard({ t }: { t: Testimonial }) {
  return (
    <div className="glass rounded-2xl p-6 w-[340px] shrink-0 flex flex-col">
      <StarRow n={t.rating} />
      <p className="mt-3 text-sm leading-relaxed text-foreground/90">"{t.review}"</p>
      <div className="mt-5 flex items-center gap-3">
        <img src={t.photo} alt={t.name} loading="lazy" className="w-10 h-10 rounded-full object-cover" />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{t.name}</div>
          <div className="text-xs text-muted-foreground truncate">{t.role} · {t.country}</div>
        </div>
      </div>
    </div>
  );
}

export function WrittenTestimonialsSection() {
  // Duplicate for seamless marquee loop
  const loop = [...WRITTEN_TESTIMONIALS, ...WRITTEN_TESTIMONIALS];
  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-6 text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold">Trusted by <span className="gradient-text">thousands of creators</span></h2>
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
