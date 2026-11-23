// One "What do you want to create?" menu, opened from the top-bar Create button
// and the phone tab bar's ＋ button.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bot, Clapperboard, FileText, Image as ImageIcon, Layers, Lightbulb, Linkedin, Lock, Megaphone, Sparkles, Target, Type,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isHiddenPath } from "@/lib/hidden-features";
import { usePlanAccess, useUpgradeDialog } from "@/lib/use-plan-access";
import { TIER_LABEL } from "@/lib/plan-access";

const EVENT = "cf:open-create-menu";

export function openCreateMenu() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

type Item = {
  to: string;
  search?: Record<string, string>;
  /** Path used for the plan / hidden-feature checks. */
  gate: string;
  label: string;
  desc: string;
  icon: typeof Bot;
  tone: string;
};

const ITEMS: Item[] = [
  { to: "/videos", search: { new: "script" }, gate: "/videos", label: "Script → Video", desc: "Your script, word for word", icon: FileText, tone: "bg-orange-500/15 text-orange-400" },
  { to: "/videos", search: { new: "idea" }, gate: "/videos", label: "Idea → Video", desc: "One idea in, full video out", icon: Lightbulb, tone: "bg-orange-500/15 text-orange-400" },
  { to: "/promo-videos", gate: "/promo-videos", label: "Business Promo", desc: "Promo with your product photos", icon: Megaphone, tone: "bg-pink-500/15 text-pink-400" },
  { to: "/ad-creatives", gate: "/ad-creatives", label: "Ad Creative", desc: "Ready-to-post Meta ads", icon: Target, tone: "bg-pink-500/15 text-pink-400" },
  { to: "/carousels", gate: "/carousels", label: "Carousel", desc: "Swipeable slides", icon: Layers, tone: "bg-sky-500/15 text-sky-400" },
  { to: "/thumbnails", gate: "/thumbnails", label: "Thumbnail", desc: "High-CTR covers", icon: Sparkles, tone: "bg-sky-500/15 text-sky-400" },
  { to: "/images", gate: "/images", label: "AI Images", desc: "Any style, any ratio", icon: ImageIcon, tone: "bg-sky-500/15 text-sky-400" },
  { to: "/linkedin-posts/new", gate: "/linkedin-posts", label: "LinkedIn post", desc: "Posts that sound like you", icon: Linkedin, tone: "bg-emerald-500/15 text-emerald-400" },
  { to: "/captions", gate: "/captions", label: "Captions", desc: "Hooks & hashtags", icon: Type, tone: "bg-emerald-500/15 text-emerald-400" },
  { to: "/model-studio", gate: "/model-studio", label: "Model shots", desc: "Your product on AI models", icon: Clapperboard, tone: "bg-amber-500/15 text-amber-400" },
  { to: "/create", gate: "/create", label: "AI Studio", desc: "Brief the agent team", icon: Bot, tone: "bg-amber-500/15 text-amber-400" },
];

export function CreateMenuHost() {
  const [open, setOpen] = useState(false);
  const { canPath } = usePlanAccess();
  const openUpgrade = useUpgradeDialog();

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const items = ITEMS.filter((i) => !isHiddenPath(i.gate));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl p-6 max-h-[88vh] overflow-y-auto">
        <div className="space-y-1">
          <DialogTitle className="text-2xl">What do you want to create?</DialogTitle>
          <DialogDescription>You'll see the cost before anything is charged.</DialogDescription>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((i) => {
            const lock = canPath(i.gate);
            return (
              <Link
                key={i.label}
                to={i.to}
                search={i.search}
                onClick={(e) => {
                  if (!lock.allowed) {
                    e.preventDefault();
                    setOpen(false);
                    openUpgrade({ label: i.label, required: lock.required });
                    return;
                  }
                  setOpen(false);
                }}
                className="group relative flex flex-col gap-2 rounded-2xl border border-border bg-secondary/60 p-4 transition hover:border-primary/60 hover:-translate-y-0.5"
              >
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${i.tone}`}>
                  <i.icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-semibold">{i.label}</span>
                <span className="text-xs text-muted-foreground leading-snug">{i.desc}</span>
                {!lock.allowed && (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    <Lock className="h-3 w-3" /> {TIER_LABEL[lock.required]}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
