import { createFileRoute } from "@tanstack/react-router";
import { BrandKitForm } from "@/components/brand-kit-form";
import { Palette, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/brand-kit")({
  head: () => ({ meta: [{ title: "Brand Kit — CreatorFlow AI" }, { name: "description", content: "Store your business identity, colors, voice, and assets. Every AI generation follows your brand automatically." }] }),
  component: BrandKitPage,
});

function BrandKitPage() {
  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Palette className="w-7 h-7 text-primary" /> Brand Kit 2.0
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            One source of truth for your brand identity. Every generator — captions, thumbnails, videos, carousels, LinkedIn posts — reads from this automatically.
          </p>
        </div>
        <div className="glass rounded-full px-4 py-2 border border-primary/30 text-xs flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span>Auto-applied to all AI generations</span>
        </div>
      </header>
      <BrandKitForm />
    </div>
  );
}
