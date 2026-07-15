import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StrategyWizard } from "@/components/strategy-wizard";
import { StrategyPlanView } from "@/components/strategy-calendar";
import { listStrategiesFn, deleteStrategyFn, type StrategyPlan } from "@/lib/strategy.functions";
import { Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/strategy")({ component: StrategyPage });

function StrategyPage() {
  const qc = useQueryClient();
  const list = useServerFn(listStrategiesFn);
  const del = useServerFn(deleteStrategyFn);
  const { data: strategies } = useQuery({ queryKey: ["strategies"], queryFn: () => list() });
  const [current, setCurrent] = useState<StrategyPlan | null>(null);
  const [tab, setTab] = useState<"new" | "history">("new");

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="w-7 h-7 text-primary" /> AI Strategy</h1>
        <p className="text-sm text-muted-foreground mt-1">Plan, calendar, and campaign ideas — from one brief.</p>
      </header>

      <div className="flex gap-2 border-b border-white/10">
        {(["new", "history"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
            {t === "new" ? "New strategy" : `History (${strategies?.length ?? 0})`}
          </button>
        ))}
      </div>

      {tab === "new" && (
        <>
          <StrategyWizard onCreated={(p) => { setCurrent(p); qc.invalidateQueries({ queryKey: ["strategies"] }); }} />
          {current && <StrategyPlanView plan={current} />}
        </>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {strategies?.map((s) => (
            <div key={s.id} className="glass rounded-2xl p-4 border border-white/10 flex items-center justify-between">
              <button className="text-left flex-1" onClick={() => { setCurrent(s.plan); setTab("new"); }}>
                <div className="font-medium">{s.promoting || s.product || "Untitled strategy"}</div>
                <div className="text-xs text-muted-foreground">{s.goal} · {s.primary_platform} · {new Date(s.created_at).toLocaleDateString()}</div>
              </button>
              <button onClick={async () => { await del({ data: { id: s.id } }); toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["strategies"] }); }}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {!strategies?.length && <div className="text-sm text-muted-foreground text-center py-12">No strategies yet.</div>}
        </div>
      )}
    </div>
  );
}
