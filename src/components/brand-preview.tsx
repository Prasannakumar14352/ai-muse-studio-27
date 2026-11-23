// Live Brand Preview — renders a mock UI (button, card, social post, carousel
// slide, thumbnail, landing hero) that reacts instantly to Brand Kit edits.
// Pure presentation, no data fetching.
import type { BrandKit, BrandKitMeta } from "@/lib/brand-kit.functions";
import { Heart, MessageCircle, Send, Bookmark, Play, ArrowRight } from "lucide-react";

type Props = { kit: Partial<BrandKit> };

export function BrandPreview({ kit }: Props) {
  const meta: BrandKitMeta = kit.metadata ?? {};
  const primary = kit.primary_color || "#8b5cf6";
  const secondary = kit.secondary_color || "#ec4899";
  const accent = meta.accentColor || "#f59e0b";
  const headingFont = kit.font_primary || "Inter";
  const bodyFont = kit.font_secondary || "Inter";
  const brand = meta.businessName || kit.name || "Your Brand";
  const cta = kit.default_cta || "Get started";
  const tagline = meta.tagline || meta.usp || "Craft content that converts.";

  const gradient = `linear-gradient(135deg, ${primary}, ${secondary})`;

  return (
    <div className="space-y-4" style={{ fontFamily: bodyFont }}>
      <SectionLabel>Landing hero</SectionLabel>
      <div
        className="rounded-2xl p-6 md:p-8 overflow-hidden relative border border-border"
        style={{ background: `${gradient}` }}
      >
        <div className="flex items-center gap-3 mb-4">
          <LogoMark kit={kit} />
          <span className="text-white font-semibold" style={{ fontFamily: headingFont }}>{brand}</span>
        </div>
        <h1 className="text-white text-2xl md:text-3xl font-black leading-tight mb-2" style={{ fontFamily: headingFont }}>
          {tagline}
        </h1>
        <p className="text-white/80 text-sm max-w-md mb-5">
          {meta.description || "AI-powered content built for the way you already work — from idea to publish in minutes."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg"
            style={{ background: "white", color: primary, fontFamily: headingFont }}
          >
            {cta} <ArrowRight className="inline w-3.5 h-3.5 ml-1" />
          </button>
          <button className="px-5 py-2.5 rounded-full font-semibold text-sm border border-white/40 text-white">
            Learn more
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <SectionLabel>Palette & typography</SectionLabel>
          <div className="glass rounded-xl p-4 border border-border space-y-3">
            <div className="flex gap-2">
              <Swatch color={primary} label="Primary" />
              <Swatch color={secondary} label="Secondary" />
              <Swatch color={accent} label="Accent" />
            </div>
            <div>
              <div className="text-2xl font-black" style={{ fontFamily: headingFont, color: primary }}>Heading — {headingFont}</div>
              <div className="text-sm text-muted-foreground" style={{ fontFamily: bodyFont }}>Body copy — {bodyFont}. The quick brown fox jumps over the lazy dog.</div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: primary, fontFamily: headingFont }}>Primary</button>
              <button className="px-4 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: secondary, fontFamily: headingFont }}>Secondary</button>
              <button className="px-4 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: primary, color: primary, fontFamily: headingFont }}>Outline</button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Social post</SectionLabel>
          <div className="glass rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-2 p-3">
              <LogoMark kit={kit} size={32} />
              <div>
                <div className="text-sm font-semibold" style={{ fontFamily: headingFont }}>{brand}</div>
                <div className="text-[10px] text-muted-foreground">Sponsored</div>
              </div>
            </div>
            <div className="aspect-square relative overflow-hidden" style={{ background: gradient }}>
              <div className="absolute inset-0 p-5 flex flex-col justify-end">
                <div className="text-white font-black text-xl leading-tight" style={{ fontFamily: headingFont }}>
                  {tagline}
                </div>
                <div className="text-white/80 text-xs mt-1">{brand}</div>
              </div>
            </div>
            <div className="p-3 flex items-center gap-4 text-muted-foreground">
              <Heart className="w-5 h-5" /><MessageCircle className="w-5 h-5" /><Send className="w-5 h-5" />
              <Bookmark className="w-5 h-5 ml-auto" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Carousel slide</SectionLabel>
          <div className="glass rounded-xl border border-border overflow-hidden aspect-[4/5] relative" style={{ background: `linear-gradient(160deg, ${secondary}, ${primary})` }}>
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <LogoMark kit={kit} size={28} />
              <span className="text-white text-xs font-semibold" style={{ fontFamily: headingFont }}>{brand}</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="text-center">
                <div className="text-white/70 text-[10px] uppercase tracking-widest mb-2" style={{ fontFamily: headingFont }}>Slide 1 / 5</div>
                <div className="text-white font-black text-2xl leading-tight" style={{ fontFamily: headingFont }}>
                  {meta.usp || tagline}
                </div>
              </div>
            </div>
            <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full text-[10px] font-semibold" style={{ background: "white", color: primary, fontFamily: headingFont }}>
              Swipe →
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <SectionLabel>Video thumbnail</SectionLabel>
          <div className="glass rounded-xl border border-border overflow-hidden aspect-video relative" style={{ background: `radial-gradient(circle at 30% 30%, ${accent}, ${primary} 60%, #0b0b13)` }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-2xl">
                <Play className="w-6 h-6 text-black fill-black ml-0.5" />
              </div>
            </div>
            <div className="absolute top-3 left-3 flex items-center gap-2">
              <LogoMark kit={kit} size={24} />
            </div>
            <div className="absolute bottom-3 left-3 right-3">
              <div className="text-white font-black text-lg leading-tight drop-shadow-lg" style={{ fontFamily: headingFont }}>
                {tagline}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <SectionLabel>Sample ad</SectionLabel>
        <div className="glass rounded-xl border border-border p-5 flex items-center gap-4" style={{ background: `linear-gradient(90deg, ${primary}22, transparent)` }}>
          <LogoMark kit={kit} size={56} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black truncate" style={{ fontFamily: headingFont }}>{brand}</div>
            <div className="text-xs text-muted-foreground truncate">{meta.description || tagline}</div>
          </div>
          <button className="shrink-0 px-4 py-2 rounded-lg text-white text-xs font-semibold" style={{ background: primary }}>
            {cta}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogoMark({ kit, size = 40 }: { kit: Partial<BrandKit>; size?: number }) {
  const primary = kit.primary_color || "#8b5cf6";
  const secondary = kit.secondary_color || "#ec4899";
  const meta = kit.metadata ?? {};
  const brand = meta.businessName || kit.name || "B";
  const initials = brand
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (kit.logo_url) {
    return (
      <img
        src={kit.logo_url}
        alt={brand}
        className="rounded-lg object-cover shrink-0 bg-white"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-lg flex items-center justify-center text-white font-black shrink-0"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${primary}, ${secondary})`, fontSize: size * 0.42 }}
    >
      {initials || "B"}
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex-1">
      <div className="h-10 rounded-lg border border-border" style={{ background: color }} />
      <div className="text-[10px] mt-1 flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono uppercase">{color}</span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{children}</div>;
}
