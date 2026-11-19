import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StrategyWizard } from "@/components/strategy-wizard";
import { StrategyPlanView } from "@/components/strategy-calendar";
import { listStrategiesFn, deleteStrategyFn, type StrategyPlan } from "@/lib/strategy.functions";
import { Trash2, Sparkles, Zap, Check } from "lucide-react";
import { toast } from "sonner";
import { getActiveStrategy, setActiveStrategy } from "@/lib/active-strategy";
import { consumeResearchPrefill, type ResearchPrefill } from "@/lib/research-prefill";
import { HandoffBanner } from "@/components/handoff-banner";

export const Route = createFileRoute("/_authenticated/strategy")({ component: StrategyPage });

type Row = {
  id: string; promoting: string; product: string; goal: string;
  primary_platform: string; plan: StrategyPlan; created_at: string;
  audience?: string; tone?: string;
};

function StrategyPage() {
  const qc = useQueryClient();
  const list = useServerFn(listStrategiesFn);
  const del = useServerFn(deleteStrategyFn);
  const { data: strategies } = useQuery({ queryKey: ["strategies"], queryFn: () => list() });
  const [current, setCurrent] = useState<Row | null>(null);
  const [tab, setTab] = useState<"new" | "history">("new");
  const [activeId, setActiveId] = useState<string | null>(() => getActiveStrategy()?.id ?? null);

  const [handoff, setHandoff] = useState<ResearchPrefill | null>(() => consumeResearchPrefill("strategy"));

  const activate = (row: Row) => {
    const label = row.promoting || row.product || "Strategy";
    setActiveStrategy(row.id, label, row.plan, {
      product: row.product,
      audience: row.audience,
      tone: row.tone,
    });
    setActiveId(row.id);
    toast.success(`"${label}" will now guide every AI generation module`);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="w-7 h-7 text-primary" /> AI Strategy</h1>
        <p className="text-sm text-muted-foreground mt-1">Business strategy, persona, funnel, offer, campaigns, and a 30-day plan — feeding every creation module.</p>
      </header>

      <HandoffBanner prefill={handoff} onDismiss={() => setHandoff(null)} />

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
          <StrategyWizard onCreated={(plan, id) => {
            const row = { id, plan } as Row;
            setCurrent(row);
            // Show it in History immediately, then refresh from the server.
            qc.setQueryData(["strategies"], (old: unknown) => {
              const list = Array.isArray(old) ? old : [];
              return list.some((x: { id: string }) => x.id === id) ? list : [{ id, plan, promoting: "", product: "", goal: "", primary_platform: "", created_at: new Date().toISOString() }, ...list];
            });
            void qc.refetchQueries({ queryKey: ["strategies"] });
          }} />
          {current && (
            <>
              <div className="flex justify-end">
                <button onClick={() => activate(current)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm ${
                    activeId === current.id
                      ? "border border-emerald-500/40 text-emerald-300"
                      : "gradient-primary text-white"
                  }`}>
                  {activeId === current.id ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                  {activeId === current.id ? "Active in all modules" : "Use in all creation modules"}
                </button>
              </div>
              <StrategyPlanView plan={current.plan} />
            </>
          )}
        </>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          {strategies?.map((s) => (
            <div key={s.id} className="glass rounded-2xl p-4 border border-white/10 flex items-center justify-between gap-3">
              <button className="text-left flex-1" onClick={() => { setCurrent(s as Row); setTab("new"); }}>
                <div className="font-medium flex items-center gap-2">
                  {s.promoting || s.product || "Untitled strategy"}
                  {activeId === s.id && <span className="text-[10px] uppercase tracking-wider text-emerald-400">Active</span>}
                </div>
                <div className="text-xs text-muted-foreground">{s.goal} · {s.primary_platform} · {new Date(s.created_at).toLocaleDateString()}</div>
              </button>
              <button onClick={() => activate(s as Row)}
                className="p-2 text-primary hover:bg-primary/10 rounded-lg" title="Use in creation modules">
                <Zap className="w-4 h-4" />
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
