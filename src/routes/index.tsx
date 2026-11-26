import { Link, createFileRoute } from "@tanstack/react-router";
import { OfferBanner } from "@/components/offer-code";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { useState } from "react";
import {
  Wand2, Layers, Rocket, Mail, ChevronRight, Sparkles, FileText, Lightbulb, Megaphone, Target, CalendarDays, Menu, X,
} from "lucide-react";
import stylePixar from "@/assets/style-pixar.jpg";
import styleCinematic from "@/assets/style-cinematic.jpg";
import styleFuturistic from "@/assets/style-futuristic.jpg";
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
import { ShowcaseSection, useShowcaseItems } from "@/components/showcase-section";
import { SiteLanguageSwitcher } from "@/components/site-language-switcher";



export const Route = createFileRoute("/")({ component: Landing });

const FEATURES = [
  { icon: FileText, title: "Script → Video", desc: "Paste your script — every word is kept, line by line. AI adds the visuals and voice.", tone: "bg-orange-500/15 text-orange-400" },
  { icon: Lightbulb, title: "Idea → Video", desc: "Type one idea. Agents research, write and storyboard a full video.", tone: "bg-orange-500/15 text-orange-400" },
  { icon: Megaphone, title: "Business Promo", desc: "Promo videos that show your real product photos in every scene.", tone: "bg-pink-500/15 text-pink-400" },
  { icon: Target, title: "Ad Creatives", desc: "Ready-to-post Facebook & Instagram ads with crisp, exact text.", tone: "bg-pink-500/15 text-pink-400" },
  { icon: Layers, title: "Carousels & Thumbnails", desc: "Brand-styled slides and high-CTR covers for every platform.", tone: "bg-sky-500/15 text-sky-400" },
  { icon: CalendarDays, title: "Planner & publishing", desc: "Schedule posts on a calendar. Publishing to YouTube is live; more platforms are coming.", tone: "bg-emerald-500/15 text-emerald-400" },
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
  const [menuOpen, setMenuOpen] = useState(false);
  // The examples section only exists once the admin has published showcase videos.
  const hasExamples = useShowcaseItems().length > 0;
  return (
    <div className="min-h-screen">
      {/* Festival offer (only while one is live) */}
      <OfferBanner />
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/75 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="CreatorFlow AI home">
            <BrandLogo alt="CreatorFlow AI" className="h-8 md:h-10 w-auto object-contain" />
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
            <Link to="/features" className="hover:text-foreground">Features</Link>
            <Link to="/how-it-works" className="hover:text-foreground">How it works</Link>
            <a href="#for-business" className="hover:text-foreground">For Business</a>
            <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
            <a href="#comparison" className="hover:text-foreground hidden xl:inline">Compare</a>
            <Link to="/contact" className="hover:text-foreground">Contact</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <SiteLanguageSwitcher />
            <Link to="/auth" className="hidden sm:inline text-sm font-medium text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link to="/auth" className="rounded-xl gradient-primary px-4 py-2 text-sm font-semibold text-white shadow-[var(--shadow-glow)] hover:brightness-110 transition whitespace-nowrap">
              Start free
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="md:hidden rounded-lg p-2 hover:bg-white/5"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="md:hidden border-t border-border px-4 py-3 grid gap-1 text-sm font-medium" onClick={() => setMenuOpen(false)}>
            <Link to="/features" className="rounded-lg px-3 py-2.5 hover:bg-white/5">Features</Link>
            <Link to="/how-it-works" className="rounded-lg px-3 py-2.5 hover:bg-white/5">How it works</Link>
            <a href="#for-business" className="rounded-lg px-3 py-2.5 hover:bg-white/5">For Business</a>
            <Link to="/pricing" className="rounded-lg px-3 py-2.5 hover:bg-white/5">Pricing</Link>
            <Link to="/contact" className="rounded-lg px-3 py-2.5 hover:bg-white/5">Contact</Link>
            <Link to="/auth" className="rounded-lg px-3 py-2.5 hover:bg-white/5">Sign in</Link>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_60%_50%_at_50%_0%,rgb(249_115_22/0.20),transparent_70%),radial-gradient(ellipse_40%_40%_at_85%_20%,rgb(236_72_153/0.16),transparent_70%)]" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-xs font-semibold text-primary mb-6">
            <Sparkles className="w-3.5 h-3.5" /> Faceless videos · Telugu, Hindi, English + 100 more
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight leading-[1.04] max-w-5xl mx-auto">
            Make <span className="gradient-text">faceless YouTube videos</span> in your language — no camera, no editing.
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg text-muted-foreground">
            Type one idea. CreatorFlow writes the script, records the voice, adds visuals and captions,
            and schedules it to YouTube — you review every scene before a single media credit is spent.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/auth" className="rounded-xl gradient-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)] hover:brightness-110 transition inline-flex items-center justify-center gap-1">
              Start free · 50 credits <ChevronRight className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => document.getElementById(hasExamples ? "made-with" : "steps")?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="rounded-xl border border-border bg-secondary px-7 py-3.5 text-sm font-semibold hover:bg-accent transition"
            >
              {hasExamples ? "▶ See real examples" : "See how it works ↓"}
            </button>
          </div>
          <div className="mt-5 text-xs text-muted-foreground">
            No card needed · Telugu, Hindi, Tamil, English and 100+ more languages
          </div>

          {/* Style samples */}
          <div className="mt-14 flex items-end justify-center gap-3 sm:gap-6">
            {[
              { img: stylePixar, label: "3D animation", tilt: "-rotate-6 translate-y-4" },
              { img: styleCinematic, label: "Cinematic", tilt: "" },
              { img: styleFuturistic, label: "Futuristic", tilt: "rotate-6 translate-y-4" },
            ].map((x) => (
              <div key={x.label} className={`relative w-28 sm:w-44 md:w-52 aspect-[9/16] rounded-2xl overflow-hidden border border-border shadow-[0_24px_60px_rgba(0,0,0,0.55)] ${x.tilt}`}>
                <img src={x.img} alt="" className="absolute inset-0 w-full h-full object-cover" loading="eager" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                <span className="absolute left-3 bottom-3 text-[11px] sm:text-xs font-semibold text-white">{x.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 text-[11px] text-muted-foreground">A few of the visual styles you can pick</div>
        </div>
      </section>

      {/* How it works */}
      <section id="steps" className="px-4 sm:px-6 py-16 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-5xl font-bold">From idea to posted <span className="gradient-text">in 4 steps</span></h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ["1", "Tell us", "Paste a script, type one idea, or upload your product photos."],
              ["2", "Review", "Check the script and every scene. Media credits are only spent after you approve."],
              ["3", "Generate", "Images, voice in your language, captions and music — failures are refunded."],
              ["4", "Publish", "Download, or schedule straight to YouTube from the Planner."],
            ].map(([n, t, d]) => (
              <div key={n} className="glass rounded-2xl p-6">
                <div className="grid h-10 w-10 place-items-center rounded-full gradient-primary text-white font-bold shadow-[var(--shadow-glow)]">{n}</div>
                <h3 className="mt-4 text-lg font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Video */}
      <DemoVideoSection />

      {/* Real videos made in the app, with their prompts (Admin → Landing) */}
      <ShowcaseSection />

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold">Everything a creator needs</h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
              From the first idea to the published post — in one studio.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass rounded-2xl p-6 hover:border-primary/50 hover:-translate-y-0.5 transition">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.tone}`}>
                  <f.icon className="w-5 h-5" />
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
      <section id="faq" className="py-20 px-4 sm:px-6">

        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold">Questions, <span className="gradient-text">answered</span></h2>
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
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto glass rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 gradient-primary opacity-20" />
          <div className="relative">
            <Rocket className="w-12 h-12 mx-auto text-white" />
            <h2 className="mt-4 text-3xl md:text-4xl font-bold">Start free with 50 credits</h2>
            <p className="mt-3 text-muted-foreground">That's enough to try a full video. Upgrade only when you love it.</p>
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
