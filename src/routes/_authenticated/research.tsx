import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runResearchFn, listResearchFn, deleteResearchFn, type ResearchFindings } from "@/lib/research.functions";
import { ResearchReportView } from "@/components/research-report-view";
import { Search, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/research")({ component: ResearchPage });

function ResearchPage() {
  const qc = useQueryClient();
  const list = useServerFn(listResearchFn);
  const run = useServerFn(runResearchFn);
  const del = useServerFn(deleteResearchFn);
  const { data: reports } = useQuery({ queryKey: ["research"], queryFn: () => list() });
  const [topic, setTopic] = useState(""); const [niche, setNiche] = useState(""); const [platform, setPlatform] = useState("");
  const [selected, setSelected] = useState<ResearchFindings | null>(null);

  const m = useMutation({
    mutationFn: () => run({ data: { topic, niche, platform } }),
    onSuccess: (r) => { setSelected(r.findings); qc.invalidateQueries({ queryKey: ["research"] }); toast.success("Research complete"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Search className="w-7 h-7 text-primary" /> Viral Research Engine</h1>
        <p className="text-sm text-muted-foreground mt-1">Trends, keywords, pain points and hooks — synthesized in seconds.</p>
      </header>

      <div className="glass rounded-2xl p-6 border border-white/10 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <input className="input-base md:col-span-1" placeholder="Topic (required)" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <input className="input-base" placeholder="Niche" value={niche} onChange={(e) => setNiche(e.target.value)} />
          <input className="input-base" placeholder="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <button disabled={!topic || m.isPending} onClick={() => m.mutate()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-50">
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Run research
          </button>
        </div>
      </div>

      {selected && <ResearchReportView findings={selected} />}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Past reports</h2>
        {reports?.map((r) => (
          <div key={r.id} className="glass rounded-2xl p-4 border border-white/10 flex items-center justify-between">
            <button onClick={() => setSelected(r.findings)} className="text-left flex-1">
              <div className="font-medium">{r.topic}</div>
              <div className="text-xs text-muted-foreground">{[r.niche, r.platform].filter(Boolean).join(" · ") || "—"} · {new Date(r.created_at).toLocaleDateString()}</div>
            </button>
            <button onClick={async () => { await del({ data: { id: r.id } }); qc.invalidateQueries({ queryKey: ["research"] }); }}
              className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {!reports?.length && <div className="text-sm text-muted-foreground text-center py-8">No research reports yet.</div>}
      </section>
    </div>
  );
}
