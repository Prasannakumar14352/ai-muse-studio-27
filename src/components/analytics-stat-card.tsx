import type { LucideIcon } from "lucide-react";

export function AnalyticsStatCard({
  icon: Icon, label, value, delta, hint,
}: { icon: LucideIcon; label: string; value: string | number; delta?: number; hint?: string }) {
  return (
    <div className="glass rounded-2xl p-5 border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {delta !== undefined && (
        <div className={`text-xs mt-1 ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs prev 30d
        </div>
      )}
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
