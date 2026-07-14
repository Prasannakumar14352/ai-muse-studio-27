import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Sparkles, Lock, Star, Search as SearchIcon, Wand2 } from "lucide-react";
import { listTemplatesFn, planTier, canAccessTemplate, categoryToContentType, type TemplateRecord } from "@/lib/templates.functions";
import { useAccess } from "@/lib/access";
import { TemplatePreview } from "@/components/template-preview";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Premium Templates — CreatorFlow AI" },
      { name: "description", content: "Ready-to-generate templates for reels, videos, carousels, thumbnails and more — one click pre-fills the brief." },
    ],
  }),
  component: TemplatesPage,
});

const CATEGORY_LABELS: Record<string, string> = {
  short_video: "Short Videos",
  long_video: "Long Videos",
  documentary: "Documentary",
  product_promo: "Product Promos",
  carousel: "Carousels",
  image: "Images",
  thumbnail: "Thumbnails",
  linkedin_post: "LinkedIn Posts",
  seo_pack: "SEO Packs",
};

function TemplatesPage() {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => listTemplatesFn(),
  });
  const { data: access } = useAccess();
  const [category, setCategory] = useState<string>("all");
  const [q, setQ] = useState("");

  const userTier = planTier(access?.plan);

  const categories = useMemo(() => {
    const set = new Set<string>();
    (templates ?? []).forEach((t) => set.add(t.category));
    return Array.from(set);
  }, [templates]);

  const filtered = useMemo(() => {
    let list = templates ?? [];
    if (category !== "all") list = list.filter((t) => t.category === category);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter((t) =>
        t.name.toLowerCase().includes(needle) ||
        (t.description ?? "").toLowerCase().includes(needle) ||
        (t.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))
      );
    }
    return list;
  }, [templates, category, q]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs">
          <Sparkles className="w-3 h-3 text-[color:var(--brand-orange)]" /> Premium Templates
        </div>
        <h1 className="text-3xl md:text-4xl font-bold">
          Start faster with <span className="gradient-text">battle-tested templates</span>
        </h1>
        <p className="text-muted-foreground">
          One click pre-fills the brief — topic, style, tone and scene plan — so you skip straight to generating.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search templates…"
            className="w-full glass border border-border/60 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-[color:var(--brand-orange)]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>All</Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c] ?? c}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-64 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-muted-foreground">
          No templates match your filters.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => (
            <TemplateCard key={t.id} t={t} userTier={userTier} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition ${
        active ? "gradient-primary text-white border-transparent" : "border-border/60 hover:border-white/20 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function TemplateCard({ t, userTier }: { t: TemplateRecord; userTier: ReturnType<typeof planTier> }) {
  const allowed = canAccessTemplate(userTier, t.access_tier);
  const contentType = categoryToContentType(t.category);

  return (
    <div className={`glass rounded-2xl overflow-hidden flex flex-col group ${t.featured ? "border-[color:var(--brand-orange)]/40" : ""}`}>
      <div className="relative aspect-video overflow-hidden">
        <TemplatePreview
          previewType={t.preview_type}
          imageUrl={t.preview_image_url}
          videoUrl={t.preview_video_url}
          posterUrl={t.poster_url}
          alt={t.alt_text}
          name={t.name}
          category={t.category}
        />
        {t.featured && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-[color:var(--brand-orange)]">
            <Star className="w-2.5 h-2.5 fill-current" /> Featured
          </span>
        )}
        <span className={`absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur ${
          t.access_tier === "free"
            ? "bg-emerald-500/25 text-emerald-200"
            : t.access_tier === "starter"
              ? "bg-sky-500/25 text-sky-200"
              : t.access_tier === "creator"
                ? "bg-[color:var(--brand-orange)]/25 text-[color:var(--brand-orange)]"
                : "bg-purple-500/25 text-purple-200"
        }`}>
          {t.access_tier}
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{CATEGORY_LABELS[t.category] ?? t.category}</div>
        <h3 className="font-semibold mt-0.5 line-clamp-1">{t.name}</h3>
        {t.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2 flex-1">{t.description}</p>}
        <div className="mt-4 flex items-center gap-2">
          {allowed ? (
            <Link
              to="/create"
              search={{ type: contentType as any, template: t.slug } as any}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg gradient-primary text-white py-2 text-sm font-medium hover:opacity-95 transition"
            >
              <Wand2 className="w-3.5 h-3.5" /> Use template
            </Link>
          ) : (
            <Link
              to="/pricing"
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[color:var(--brand-orange)]/60 text-[color:var(--brand-orange)] py-2 text-sm font-medium hover:bg-[color:var(--brand-orange)]/10 transition"
            >
              <Lock className="w-3.5 h-3.5" /> Upgrade to unlock
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
