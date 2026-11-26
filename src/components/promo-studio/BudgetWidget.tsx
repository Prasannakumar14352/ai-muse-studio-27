// Small "AI spend this month" meter for the Promo Studio header.
import { useQuery } from "@tanstack/react-query";
import { getPromoStudio } from "@/lib/promo-studio.functions";

export function BudgetWidget() {
  const q = useQuery({
    queryKey: ["promo-studio"],
    queryFn: () => getPromoStudio(),
    refetchOnWindowFocus: false,
    staleTime: 30 * 60 * 1000,
  });
  if (!q.data) return null;
  const { monthSpend, monthlyCap, enabled } = q.data.budget;
  const cap = Number(monthlyCap) || 0;
  const pct = cap > 0 ? Math.min(100, (monthSpend / cap) * 100) : 100;
  return (
    <div className="w-56 space-y-1 text-right">
      <div className="text-xs text-muted-foreground">
        {enabled ? "AI spend this month" : "Promo Studio is off"}: ${monthSpend.toFixed(3)} / $
        {cap.toFixed(2)}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
