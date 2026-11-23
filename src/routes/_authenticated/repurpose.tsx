import { createFileRoute } from "@tanstack/react-router";
import { RepurposePicker } from "@/components/repurpose-picker";
import { Split } from "lucide-react";

export const Route = createFileRoute("/_authenticated/repurpose")({ component: RepurposePage });

function RepurposePage() {
  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2"><Split className="w-7 h-7 text-primary" /> Content Repurposing</h1>
        <p className="text-sm text-muted-foreground mt-1">Turn one asset into shorts, reels, threads, blogs, and more.</p>
      </header>
      <RepurposePicker />
    </div>
  );
}
