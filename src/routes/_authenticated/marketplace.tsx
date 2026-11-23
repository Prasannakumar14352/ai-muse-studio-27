import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMarketplaceFn, listInstalledFn, type MarketplaceItem } from "@/lib/marketplace.functions";
import { MarketplaceCard } from "@/components/marketplace-card";
import { Store } from "lucide-react";

const KINDS: { id: MarketplaceItem["kind"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "prompt_pack", label: "Prompt Packs" },
  { id: "template", label: "Templates" },
  { id: "thumbnail_pack", label: "Thumbnails" },
  { id: "brand_kit", label: "Brand Kits" },
  { id: "voice_pack", label: "Voice Packs" },
  { id: "carousel_pack", label: "Carousels" },
];

export const Route = createFileRoute("/_authenticated/marketplace")({ component: MarketplacePage });

function MarketplacePage() {
  const list = useServerFn(listMarketplaceFn);
  const installed = useServerFn(listInstalledFn);
  const { data: items } = useQuery({ queryKey: ["marketplace"], queryFn: () => list() });
  const { data: mine } = useQuery({ queryKey: ["marketplace-installs"], queryFn: () => installed() });
  const installedIds = useMemo(() => new Set(mine?.map((x) => x.item_id) ?? []), [mine]);
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");

  const filtered = items?.filter((i) => kind === "all" || i.kind === kind) ?? [];

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2"><Store className="w-7 h-7 text-primary" /> Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-1">Prompt packs, templates, brand kits and more. Install once, use anywhere.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)}
            className={`px-3 py-1.5 rounded-full text-sm border ${kind === k.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((it) => (
          <MarketplaceCard key={it.id} item={it} installed={installedIds.has(it.id)} />
        ))}
      </div>
      {!filtered.length && (
        <div className="text-center py-16 text-muted-foreground">
          <Store className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <div className="text-sm">No items yet — check back soon.</div>
        </div>
      )}
    </div>
  );
}
