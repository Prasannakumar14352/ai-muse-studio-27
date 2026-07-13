import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Wand2, Sparkles, Film, Download, Rocket } from "lucide-react";
import { PublicShell } from "@/components/public-shell";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it works — CreatorVault AI" },
      { name: "description", content: "From a single idea to a finished video, carousel, thumbnail or LinkedIn post in four steps." },
      { property: "og:title", content: "How CreatorVault AI works" },
      { property: "og:description", content: "From idea to finished asset in four steps." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "How CreatorVault AI works" },
      { name: "twitter:description", content: "From idea to finished asset in four steps." },
    ],
  }),
  component: HowItWorksPage,
});

const STEPS = [
  {
    icon: Wand2,
    n: "01",
    title: "Describe your idea",
    body: "Pick a content type (video, carousel, image, thumbnail, LinkedIn post), give a topic, pick a tone and style. That's it.",
  },
  {
    icon: Sparkles,
    n: "02",
    title: "Our AI directors compose your project",
    body: "The Creative Director sets intent. The Retention Engine plans hooks. The Character Bible locks the protagonist. The Layout Engine reserves negative space.",
  },
  {
    icon: Film,
    n: "03",
    title: "Cinematic visuals + narration + captions",
    body: "Every beat gets a cinematic image prompt, matching voiceover, captions and hashtags. Scenes render in parallel — no waiting on a slow single call.",
  },
  {
    icon: Download,
    n: "04",
    title: "Edit, export, publish",
    body: "Real-time editors for slides, thumbnails and posts. Export as MP4, PDF, ZIP or PNG. Publish directly to LinkedIn, IG, FB, YT (or schedule).",
  },
];

function HowItWorksPage() {
  return (
    <PublicShell>
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs text-muted-foreground mb-5">
          <Rocket className="w-3.5 h-3.5 text-[color:var(--neon-pink)]" /> From idea to asset — in minutes
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
          Four steps. <span className="gradient-text">Zero editing skills.</span>
        </h1>
        <p className="mt-5 max-w-2xl mx-auto text-lg text-muted-foreground">
          A single idea becomes a full creator project — script, scenes, images, captions, hashtags, voiceover — automatically.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.n} className="glass rounded-2xl p-6 md:p-8 border border-border/40 flex gap-5 md:gap-8">
              <div className="shrink-0">
                <div className="text-4xl md:text-5xl font-bold gradient-text leading-none">{s.n}</div>
                <div className="mt-3 w-11 h-11 rounded-xl bg-gradient-to-br from-[color:var(--neon-purple)]/20 to-[color:var(--neon-pink)]/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[color:var(--neon-pink)]" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.body}</p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl md:text-4xl font-bold">Try it — the free plan never expires.</h2>
        <p className="mt-3 text-muted-foreground">5 credits every month, all engines unlocked.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/auth" className="rounded-xl gradient-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]">
            Start Creating Free <ArrowRight className="inline w-4 h-4" />
          </Link>
          <Link to="/pricing" className="rounded-xl glass px-7 py-3.5 text-sm font-semibold hover:bg-white/5">
            See pricing
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
