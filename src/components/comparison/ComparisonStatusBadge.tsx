import { Check, MessageSquare, Minus, X, Sparkles, Clock, CircleDot } from "lucide-react";
import type { ComparisonStatus } from "@/data/toolComparisonData";
import { cn } from "@/lib/utils";

const CONFIG: Record<
  ComparisonStatus,
  { label: string; short: string; icon: React.ComponentType<{ className?: string }>; classes: string; ariaLabel: string }
> = {
  available: {
    label: "Available",
    short: "Available",
    icon: Check,
    classes: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    ariaLabel: "Available",
  },
  through_chat: {
    label: "Through chat",
    short: "Through chat",
    icon: MessageSquare,
    classes: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    ariaLabel: "Available through chat",
  },
  limited: {
    label: "Limited",
    short: "Limited",
    icon: Minus,
    classes: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    ariaLabel: "Limited",
  },
  beta: {
    label: "Beta",
    short: "Beta",
    icon: Sparkles,
    classes: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    ariaLabel: "Beta",
  },
  coming_soon: {
    label: "Coming soon",
    short: "Coming soon",
    icon: Clock,
    classes: "bg-violet-500/10 text-violet-300 border-violet-500/30",
    ariaLabel: "Coming soon",
  },
  not_available: {
    label: "Not available",
    short: "Not available",
    icon: X,
    classes: "bg-red-500/10 text-red-300/90 border-red-500/25",
    ariaLabel: "Not available",
  },
  not_core: {
    label: "Not core",
    short: "Not core",
    icon: CircleDot,
    classes: "bg-white/5 text-muted-foreground border-white/10",
    ariaLabel: "Not a core feature",
  },
};

export function ComparisonStatusBadge({
  status,
  className,
  compact = false,
}: {
  status: ComparisonStatus;
  className?: string;
  compact?: boolean;
}) {
  const c = CONFIG[status];
  const Icon = c.icon;
  return (
    <span
      role="img"
      aria-label={c.ariaLabel}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        c.classes,
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span className={compact ? "sr-only sm:not-sr-only" : ""}>{c.short}</span>
    </span>
  );
}

export function statusLabel(status: ComparisonStatus) {
  return CONFIG[status].label;
}
