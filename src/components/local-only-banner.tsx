import { Info } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function LocalOnlyBanner({ compact }: { compact?: boolean }) {
  return (
    <div className={`glass rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-100 ${compact ? "px-3 py-2 text-xs" : "p-4 text-sm"} flex items-start gap-3`}>
      <Info className={`${compact ? "w-3.5 h-3.5" : "w-4 h-4"} shrink-0 mt-0.5 text-amber-300`} />
      <div className="flex-1">
        <span className="font-medium">Local-only content:</span>{" "}
        Generations are stored in <span className="underline">this browser only</span> and won't sync across devices.
        Use <Link to="/settings" className="underline hover:text-white">Settings → Export</Link> before switching devices or clearing cache.
      </div>
    </div>
  );
}
