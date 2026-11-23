// Landing / features section for small businesses: Ad Creatives + Business Promo.
import { Link } from "@tanstack/react-router";
import { Check, Megaphone, Store, Target } from "lucide-react";

const TOOLS = [
  {
    icon: Target,
    title: "Ad Creatives",
    text: "Ready-to-post Facebook & Instagram ads with your shop name, offer and WhatsApp number. AI writes the text and makes the picture — every word stays spelled right and editable.",
    points: ["Feed, square & story sizes", "Telugu, Hindi, English & more", "Add your real product photos"],
  },
  {
    icon: Megaphone,
    title: "Business Promo Videos",
    text: "Short promo videos for Reels and Shorts where every scene shows your actual product — not a made-up one.",
    points: ["Upload up to 8 product photos", "Voiceover, captions & music", "Your offer and call-to-action", "On Creator plan and above"],
  },
];

const WHO = ["Gift & printing shops", "Boutiques & clothing", "Restaurants & cafés", "Salons & studios", "Coaching & tuitions", "Online sellers"];

export function BusinessPromoSection({ id = "for-business" }: { id?: string }) {
  return (
    <section id={id} className="py-20 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-semibold rounded-full px-2.5 py-1 bg-orange-500/15 text-orange-200 border border-orange-400/20">
            <Store className="w-3.5 h-3.5" /> For businesses
          </span>
          <h2 className="mt-4 text-3xl md:text-4xl font-bold">Promote <span className="gradient-text">your business</span> in minutes</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Not just for creators. Run a shop or a service? Turn photos of your products into ads and promo videos — no designer needed.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {TOOLS.map((t) => (
            <div key={t.title} className="glass rounded-2xl p-6 border border-border flex flex-col gap-3">
              <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center">
                <t.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold">{t.title}</h3>
              <p className="text-sm text-muted-foreground">{t.text}</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {t.points.map((p) => (
                  <li key={p} className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-orange-300" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {WHO.map((w) => (
            <span key={w} className="text-xs rounded-full px-3 py-1.5 glass border border-border text-muted-foreground">{w}</span>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/auth" className="inline-flex rounded-xl gradient-primary px-7 py-3.5 text-sm font-semibold text-white shadow-[var(--shadow-glow)]">
            Promote my business free
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">50 free credits on sign-up</p>
        </div>
      </div>
    </section>
  );
}
