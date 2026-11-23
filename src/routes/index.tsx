import { Link, createFileRoute } from "@tanstack/react-router";
import { OfferBanner } from "@/components/offer-code";
import { SUPPORT_EMAIL } from "@/lib/constants";
import {
  Wand2, Video, Image as ImageIcon, Type, Mic, Music2,
  Zap, Layers, Rocket, Mail, ChevronRight, Sparkles,
} from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { BrandLogo } from "@/components/brand-logo";
import {
  DemoVideoSection, VideoTestimonialsSection, WrittenTestimonialsSection,
  GuaranteeSection, TrustBadgesSection, ProductWalkthroughsSection,
} from "@/components/landing-sections";
import { LandingPricingTabs } from "@/components/landing-pricing-tabs";
import { ComparisonSection } from "@/components/comparison/ComparisonSection";
import { EXTRA_FAQ } from "@/lib/landing-content";
import { ComingSoonToolsSection } from "@/components/coming-soon-tools-section";
import { BusinessPromoSection } from "@/components/business-promo-section";
import { ShowcaseSection } from "@/components/showcase-section";
import { SiteLanguageSwitcher } from "@/components/site-language-switcher";



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
  { q: "What is CreatorFlow AI?", a: "A premium AI content platform that generates full creator-ready projects — scripts, scenes, images, captions, hashtags — in one flow." },
  { q: "Do I need any editing experience?", a: "No. You describe the topic and pick a style. We generate the entire project blueprint." },
  { q: "Which platforms are supported?", a: "Content is written for YouTube, Instagram, TikTok, Facebook and LinkedIn, with platform-specific tone and formatting. Direct publishing is live for YouTube; Instagram, Facebook and LinkedIn publishing are coming soon." },
  { q: "Can I use my own brand style?", a: "Yes. Save brand presets in Settings, and every generation adapts to your defaults." },
  { q: "Is there a free plan?", a: "Yes — you get 50 free credits once when you sign up. When they run out, buy a credit pack or pick a plan." },
  { q: "Can I use CreatorFlow to promote my shop or business?", a: "Yes. Ad Creatives makes ready-to-post Facebook and Instagram ads from your product photos, offer and contact details, and Business Promo makes short promo videos that show your real product. Ad Creatives is on every plan; Business Promo videos are on the Creator plan and above." },
  ...EXTRA_FAQ,
];

function Landing() {
  return (
    <div className="min-h-screen">
      {/* Festival offer (only while one is live) */}
      <OfferBanner />
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/60 border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="CreatorFlow AI home">
            <BrandLogo alt="CreatorFlow AI" className="h-9 md:h-10 w-auto object-contain" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <Link to="/features" className="hover:text-foreground">Features</Link>
            <Link to="/how-it-works" className="hover:text-foreground">How it works</Link>
            <a href="#for-business" className="hover:text-foreground">For Business</a>
            <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
            <a href="#comparison" className="hover:text-foreground hidden xl:inline">Compare</a>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
          </nav>
          <div className="flex items-center gap-3">
            <SiteLanguageSwitcher />
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
            CreatorFlow AI turns a single idea into a complete creator project — script, scenes, AI images,
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
            <Sparkles className="w-3.5 h-3.5 text-[color:var(--neon-pink)]" />
            <span className="ml-1.5">Reels, carousels, thumbnails &amp; publishing in one studio</span>
          </div>
        </div>
      </section>

      {/* Demo Video */}
      <DemoVideoSection />

      {/* Real videos made in the app, with their prompts (Admin → Landing) */}
      <ShowcaseSection />



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

      {/* Small businesses: ads + promo videos */}
      <BusinessPromoSection />

      {/* Upcoming tools (clearly marked Coming soon) */}
      <ComingSoonToolsSection />

      {/* Product walkthroughs (not testimonials) */}
      <ProductWalkthroughsSection />

      {/* Video Testimonials (only real customers; hidden when empty) */}
      <VideoTestimonialsSection />

      {/* Written Testimonials Carousel */}
      <WrittenTestimonialsSection />

      {/* Honest tool comparison */}
      <ComparisonSection />

      {/* Pricing */}
      <LandingPricingTabs />


      {/* Guarantee */}
      <GuaranteeSection />

      {/* Trust Badges */}
      <TrustBadgesSection />

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
            <p className="mt-3 text-muted-foreground">Turn one idea into a finished, ready-to-post project in minutes.</p>
            <Link to="/auth" className="mt-8 inline-flex rounded-xl gradient-primary px-8 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]">
              Start free <Wand2 className="w-4 h-4 ml-2" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <BrandLogo alt="CreatorFlow AI" className="h-7 w-auto object-contain" />
            <span>© 2026 CreatorFlow AI · Digital Products Marketplace</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-foreground inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" /> {SUPPORT_EMAIL}
            </a>
            <Link to="/contact" className="hover:text-foreground">Contact Us</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
