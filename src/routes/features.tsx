import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Video, Image as ImageIcon, Layers, Type, Mic, Music2, Sparkles,
  Film, Palette, Users, Wand2, Zap, ArrowRight, Camera, Target, LineChart,
} from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — CreatorVault AI" },
      { name: "description", content: "Every AI engine inside CreatorVault: cinematic videos, layered carousels, LinkedIn studio, character consistency, motion director, thumbnail studio and more." },
      { property: "og:title", content: "Features — CreatorVault AI" },
      { property: "og:description", content: "Every AI engine inside CreatorVault: videos, carousels, LinkedIn, thumbnails and more." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Features — CreatorVault AI" },
      { name: "twitter:description", content: "Every AI engine inside CreatorVault AI." },
    ],
  }),
  component: FeaturesPage,
});

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  bullets: string[];
};

const CORE: Feature[] = [
  {
    icon: Video, title: "Cinematic Videos",
    desc: "Long-form and short-form videos with locked characters, motion direction and retention-tuned pacing.",
    bullets: ["Retention Engine hooks & pattern-interrupts", "Motion Director eliminates slideshow feel", "Character Bible keeps the same face across every scene"],
  },
  {
    icon: Layers, title: "Layered Carousels",
    desc: "Layout-aware carousels with safe zones for text, brand logo and CTA. Edit any layer in real time.",
    bullets: ["4 professional templates (A/B/C/D)", "Auto-layout with collision detection", "Export as ZIP or PDF"],
  },
  {
    icon: ImageIcon, title: "AI Image Studio",
    desc: "Cinematic 11-part prompt engine for magazine-grade visuals — 12 style presets from 3D to Ghibli.",
    bullets: ["Streaming preview (no timeouts)", "Layer editor with text + logo overlays", "PNG export at any resolution"],
  },
  {
    icon: Target, title: "LinkedIn Posts + Studio",
    desc: "Post packages, document carousels, and layout-aware LinkedIn images (1200×627, 1080×1080, 1080×1350).",
    bullets: ["Hooks, body, hashtags, first comment", "Drag-drop carousel reorder", "Auto-save editor"],
  },
  {
    icon: Camera, title: "Thumbnail Studio",
    desc: "Professional layered thumbnails — background/subject separation, editable text, 4 psychological concepts.",
    bullets: ["Fear / Curiosity / Doc / Minimal", "Transparent subject cutouts", "Editable HTML/CSS layers"],
  },
  {
    icon: Palette, title: "Creative Director",
    desc: "16 Content Intents × Visual Styles marketing framework aligned across every module.",
    bullets: ["Brand-lock across a project", "Style presets locked by director", "Consistent voice across formats"],
  },
];

const ENGINES: Feature[] = [
  {
    icon: Users, title: "Character Consistency Engine",
    desc: "Immutable protagonist bible + Master Portrait prompt locks face, hair and wardrobe across every scene.",
    bullets: ["Same character across a 5-minute video", "Same character across all carousel slides", "No more identity drift"],
  },
  {
    icon: Wand2, title: "Layout-Aware Design Engine",
    desc: "Generates artwork with intentional negative space, then places typography using composition scoring.",
    bullets: ["Marketing hierarchy: headline → product → CTA", "Auto-layout button in editor", "Never covers the subject"],
  },
  {
    icon: LineChart, title: "Retention Engine",
    desc: "Timed hooks, curiosity loops and pattern-interrupts baked into the script before the first prompt.",
    bullets: ["3-second hook", "9s / 30s / 60s pattern breaks", "Chapter markers for YouTube"],
  },
];

const PLATFORM: Feature[] = [
  {
    icon: Mic, title: "Voiceover Ready",
    desc: "Cinematic, energetic, documentary and storyteller voices — matched to the intent.",
    bullets: ["Multiple voices per project", "Timing markers for editors", "Downloadable audio"],
  },
  {
    icon: Music2, title: "Music Direction",
    desc: "Mood-matched music suggestions — cinematic, luxury, suspense, chill, motivational.",
    bullets: ["Intent-aware music brief", "Timing-synced beats", "Free-use references"],
  },
  {
    icon: Type, title: "Captions & Hashtags",
    desc: "Platform-optimized captions with 30 hashtags for every platform.",
    bullets: ["YouTube, IG, TikTok, FB, LinkedIn", "Copy-ready or auto-published", "SEO-tuned"],
  },
];

function FeaturesPage() {
  return (
    <PublicShell>
      <section className="max-w-7xl mx-auto px-6 pt-16 pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs text-muted-foreground mb-5">
          <Sparkles className="w-3.5 h-3.5 text-[color:var(--neon-pink)]" /> Every engine, every format
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
          Ten AI engines. <span className="gradient-text">One creator studio.</span>
        </h1>
        <p className="mt-5 max-w-2xl mx-auto text-lg text-muted-foreground">
          CreatorVault composes cinematic videos, layered carousels, thumbnails and LinkedIn posts with the same
          character, brand and voice — end to end.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/auth" className="rounded-xl gradient-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]">
            Start Free <ArrowRight className="inline w-4 h-4" />
          </Link>
          <Link to="/pricing" className="rounded-xl glass px-7 py-3.5 text-sm font-semibold hover:bg-white/5">
            See pricing
          </Link>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-8 space-y-14">
        <FeatureGroup title="Core modules" items={CORE} />
        <FeatureGroup title="AI engines under the hood" items={ENGINES} />
        <FeatureGroup title="Platform delivery" items={PLATFORM} />
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-bold">Ready to see it in action?</h2>
        <p className="mt-3 text-muted-foreground">Free forever plan. 5 credits every month. No card required.</p>
        <Link to="/auth" className="mt-6 inline-flex rounded-xl gradient-primary px-8 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]">
          Start Creating Free <Zap className="inline w-4 h-4 ml-1" />
        </Link>
      </section>
    </PublicShell>
  );
}

function FeatureGroup({ title, items }: { title: string; items: Feature[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-[color:var(--neon-purple)] mb-4">{title}</div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {items.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="glass rounded-2xl p-6 border border-border/40 hover:border-white/20 transition">
              <div className="w-11 h-11 rounded-xl gradient-primary/20 bg-gradient-to-br from-[color:var(--neon-purple)]/20 to-[color:var(--neon-pink)]/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-[color:var(--neon-pink)]" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                {f.bullets.map((b) => (
                  <li key={b} className="flex gap-2"><Film className="w-3 h-3 mt-0.5 text-[color:var(--neon-purple)]" /> {b}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
