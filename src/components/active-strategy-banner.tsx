import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { clearActiveStrategy, getActiveStrategy, type ActiveStrategy } from "@/lib/active-strategy";

/** Small banner shown on generation module pages when an active strategy is set. */
export function ActiveStrategyBanner() {
  const [s, setS] = useState<ActiveStrategy | null>(null);

  useEffect(() => {
    setS(getActiveStrategy());
    const onChange = () => setS(getActiveStrategy());
    window.addEventListener("active-strategy:changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("active-strategy:changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  if (!s) return null;
  return (
    <div className="glass rounded-xl border border-primary/30 px-3 py-2 flex items-center gap-2 text-xs">
      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-muted-foreground shrink-0">Active strategy:</span>
      <span className="font-medium truncate">{s.label}</span>
      <span className="text-muted-foreground shrink-0 hidden sm:inline">— auto-injected into AI planning</span>
      <div className="ml-auto flex items-center gap-1 shrink-0">
        <Link to="/strategy" className="text-primary hover:underline">Change</Link>
        <button onClick={() => { clearActiveStrategy(); setS(null); }}
          className="p-1 rounded hover:bg-white/5 text-muted-foreground" aria-label="Clear active strategy">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
