// First-visit welcome: one question ("what do you want to make first?"), then
// straight into that tool. Shown once per browser, and only to people who have
// not made anything yet.

import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Clapperboard, Megaphone, Smartphone, Target } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAccess, getAvailableCredits } from "@/lib/access";

const SEEN_KEY = "cf:welcome-seen";

const CHOICES = [
  { id: "video", label: "YouTube video", icon: Clapperboard, to: "/videos", search: { new: "idea" } },
  { id: "reel", label: "Reels / Shorts", icon: Smartphone, to: "/videos", search: { new: "idea" } },
  { id: "promo", label: "Promote my business", icon: Megaphone, to: "/promo-videos" },
  { id: "ads", label: "Ad creatives", icon: Target, to: "/ad-creatives" },
] as const;

export function WelcomeDialog({ projectCount }: { projectCount: number | null }) {
  const { data: access } = useAccess();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<(typeof CHOICES)[number]["id"]>("reel");

  useEffect(() => {
    if (projectCount === null || projectCount > 0) return;
    try {
      if (window.localStorage.getItem(SEEN_KEY)) return;
    } catch { return; }
    setOpen(true);
  }, [projectCount]);

  function done() {
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* storage unavailable */ }
    setOpen(false);
  }

  const credits = access && !access.unlimited ? getAvailableCredits(access) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) done(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="h-28 gradient-primary" aria-hidden />
        <div className="p-6 pt-5 space-y-4">
          <div className="space-y-1.5">
            <DialogTitle className="text-2xl">Welcome to CreatorFlow AI 👋</DialogTitle>
            <DialogDescription>
              {credits !== null ? `You have ${credits.toLocaleString()} credits to start. ` : ""}What do you want to make first?
            </DialogDescription>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChoice(c.id)}
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium text-left transition ${
                  choice === c.id ? "border-primary bg-primary/12 text-foreground" : "border-border bg-secondary hover:border-primary/40"
                }`}
              >
                <c.icon className={`h-4 w-4 shrink-0 ${choice === c.id ? "text-primary" : "text-muted-foreground"}`} />
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={done}>Skip</Button>
            <Button
              onClick={() => {
                const c = CHOICES.find((x) => x.id === choice)!;
                done();
                navigate({ to: c.to, search: "search" in c ? c.search : undefined });
              }}
            >
              Continue →
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
