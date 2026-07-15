import { createFileRoute } from "@tanstack/react-router";
import { BrandKitForm } from "@/components/brand-kit-form";
import { Palette } from "lucide-react";

export const Route = createFileRoute("/_authenticated/brand-kit")({ component: BrandKitPage });

function BrandKitPage() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Palette className="w-7 h-7 text-primary" /> Brand Kit</h1>
        <p className="text-sm text-muted-foreground mt-1">Store your logo, colors, voice, and CTAs. Your default kit is applied automatically to new generations.</p>
      </header>
      <BrandKitForm />
    </div>
  );
}
