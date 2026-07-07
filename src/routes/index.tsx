import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Wand2, Video, Image as ImageIcon, Type, Mic, Music2,
  Zap, Layers, Rocket, Check, Mail, ChevronRight, Star,
} from "lucide-react";
import { PLANS } from "@/lib/constants";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { BrandLogo } from "@/components/brand-logo";
const demoVideo = { url: "/creatorvault-demo.mp4", poster: "/brand/hero-poster.jpg" };


export const Route = createFileRoute("/")({ component: Landing });

const FEATURES = [
  { icon: Video, title: "Long & Short Videos", desc: "Full scripts, scene breakdowns, thumbnails — ready to shoot." },
  { icon: ImageIcon, title: "AI Image Generation", desc: "3D, Anime, Ghibli, Cinematic, Cyberpunk and more visual styles." },
  { icon: Type, title: "Captions & Hashtags", desc: "Platform-optimized captions, 30 trending hashtags, and CTAs." },
  { icon: Mic, title: "Voiceover Ready", desc: "Pick from cinematic, energetic, documentary or storyteller voices." },
  { icon: Music2, title: "Music Suggestions", desc: "Match the mood — cinematic, luxury, suspense, chill, motivational." },
  { icon: Layers, title: "Carousels & Reels", desc: "Structured formats for every platform, out of the box." },
];

const FAQ = [
  { q: "What is CreatorVault AI?", a: "A premium AI content platform that generates full creator-ready projects — scripts, scenes, images, captions, hashtags — in one flow." },
  { q: "Do I need any editing experience?", a: "No. You describe the topic and pick a style. We generate the entire project blueprint." },
  { q: "Which platforms are supported?", a: "YouTube, Instagram, TikTok, Facebook and LinkedIn — with platform-specific tone and formatting." },
  { q: "Can I use my own brand style?", a: "Yes. Save brand presets in Settings, and every generation adapts to your defaults." },
  { q: "Is there a free plan?", a: "Yes — 5 generations per month, forever free. Upgrade any time." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="CreatorVault AI home">
            <BrandLogo alt="CreatorVault AI" className="h-9 md:h-10 w-auto object-contain" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
            <Link to="/contact" className="hover:text-foreground">Contact Us</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link to="/auth" className="rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-white shadow-lg">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 pt-20 pb-32 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs text-muted-foreground mb-6">
            <Zap className="w-3.5 h-3.5 text-[color:var(--neon-pink)]" />
            Now with cinematic style presets & voice generation
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Create <span className="gradient-text">viral content</span><br />
            faster than you can scroll.
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            CreatorVault AI turns a single idea into a complete creator project — script, scenes, AI images,
            captions, hashtags and voiceover — in seconds.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/auth" className="rounded-xl gradient-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] hover:opacity-95 transition">
              Start Creating Free <ChevronRight className="inline w-4 h-4" />
            </Link>
            <a href="#features" className="rounded-xl glass px-7 py-3.5 text-sm font-semibold hover:bg-white/5 transition">
              See how it works
            </a>
          </div>
          <div className="mt-8 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-[color:var(--neon-pink)] text-[color:var(--neon-pink)]" />)}
            <span className="ml-2">Loved by 10,000+ creators</span>
          </div>

          {/* Live demo video — how the platform works */}
          <div className="mt-16 max-w-5xl mx-auto">
            <div className="glass rounded-2xl p-2 shadow-[var(--shadow-glow)]">
              <div className="rounded-xl overflow-hidden bg-black aspect-video relative group">
                <video
                  src={demoVideo.url}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  className="w-full h-full object-cover"
                  aria-label="How CreatorVault AI works — 20 second walkthrough">
                  Your browser does not support the video tag.
                </video>

                <div className="pointer-events-none absolute top-4 left-4 flex gap-2">
                  <span className="glass px-2.5 py-1 rounded text-[11px] font-medium tracking-wide uppercase text-white/90">Demo</span>
                  <span className="glass px-2.5 py-1 rounded text-[11px] font-medium tracking-wide uppercase text-white/90">20 sec</span>
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground text-center">
              Watch how a single idea becomes a full creator project — no sign-in needed.
            </p>
          </div>

        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold">Everything you need to <span className="gradient-text">ship content</span></h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              One platform. Every format. Every style. Every platform.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass rounded-2xl p-6 hover:border-white/20 transition group">
                <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center mb-4 group-hover:scale-110 transition">
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold">Simple, <span className="gradient-text">creator-first</span> pricing</h2>
            <p className="mt-4 text-muted-foreground">Start free. Upgrade when you're ready to scale.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-5">
            {PLANS.map((p) => (
              <div key={p.id} className={`glass rounded-2xl p-6 relative flex flex-col ${p.featured ? "border-[color:var(--neon-purple)]/60 shadow-[var(--shadow-glow)]" : ""} ${p.contactSales ? "border-[color:var(--brand-orange)]/60" : ""}`}>
                {p.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 gradient-primary text-white text-xs px-3 py-1 rounded-full font-medium">
                    Most popular
                  </div>
                )}
                {p.contactSales && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[color:var(--brand-orange)] text-black text-xs px-3 py-1 rounded-full font-medium">
                    For teams
                  </div>
                )}
                <h3 className="text-xl font-semibold">{p.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <ul className="mt-6 space-y-3 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className={`w-4 h-4 mt-0.5 shrink-0 ${p.contactSales ? "text-[color:var(--brand-orange)]" : "text-[color:var(--neon-purple)]"}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={p.contactSales ? "/contact" : "/auth"}
                  className={`mt-8 block text-center rounded-lg py-3 text-sm font-medium ${
                    p.contactSales
                      ? "bg-[color:var(--brand-orange)] text-black hover:opacity-90"
                      : p.featured
                        ? "gradient-primary text-white"
                        : "glass hover:bg-white/5"
                  }`}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold">Questions, <span className="gradient-text">answered</span></h2>
          </div>
          <Accordion type="single" collapsible className="glass rounded-2xl p-2">
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-b border-border/40 last:border-0 px-4">
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto glass rounded-3xl p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 gradient-primary opacity-20" />
          <div className="relative">
            <Rocket className="w-12 h-12 mx-auto text-white" />
            <h2 className="mt-4 text-3xl md:text-4xl font-bold">Ready to fill your content vault?</h2>
            <p className="mt-3 text-muted-foreground">Join thousands of creators shipping content 10x faster.</p>
            <Link to="/auth" className="mt-8 inline-flex rounded-xl gradient-primary px-8 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]">
              Start free <Wand2 className="w-4 h-4 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <img src={brandLogo.url} alt="CreatorVault AI" className="h-7 w-auto object-contain" />
            <span>© 2026 CreatorVault AI · Digital Products Marketplace</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="mailto:support@creatorvault.ai" className="hover:text-foreground inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> support@creatorvault.ai
            </a>
            <Link to="/contact" className="hover:text-foreground">Contact Us</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
