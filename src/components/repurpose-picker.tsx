import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { repurposeFn, REPURPOSE_FORMATS, type RepurposeFormat } from "@/lib/repurpose.functions";
import { Loader2, Split, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { CreatorFlowSelect } from "@/components/ui/creator-flow-select";

export function RepurposePicker() {
  const [projectId, setProjectId] = useState<string>("");
  const [source, setSource] = useState("");
  const [formats, setFormats] = useState<RepurposeFormat[]>(["shorts", "linkedin", "x_thread"]);
  const [results, setResults] = useState<{ id: string; format: RepurposeFormat; content: string }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: projects } = useQuery({
    queryKey: ["all-projects-min"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, title, content_type").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const run = useServerFn(repurposeFn);
  const m = useMutation({
    mutationFn: () => run({ data: { sourceProjectId: projectId || null, source, formats } }),
    onSuccess: (r) => { setResults(r.results); toast.success(`Generated ${r.results.length} formats`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (f: RepurposeFormat) =>
    setFormats((cur) => cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]);

  const useProject = useMemo(() => (id: string) => {
    const p = projects?.find((x: { id: string }) => x.id === id);
    if (!p) return;
    setProjectId(id);
    supabase.from("projects").select("brief, metadata").eq("id", id).single().then(({ data }) => {
      const brief: unknown = (data as { brief?: unknown } | null)?.brief;
      if (typeof brief === "string") setSource(brief);
      else if (brief && typeof brief === "object") setSource(JSON.stringify(brief, null, 2));
    });
  }, [projects]);

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
        <label className="block space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Source project (optional)</div>
          <CreatorFlowSelect
            ariaLabel="Source project"
            value={projectId}
            onValueChange={(v) => useProject(v)}
            options={[
              { value: "", label: "— No project (paste content below) —" },
              ...(projects ?? []).map((p: { id: string; title: string | null }) => ({ value: p.id, label: p.title ?? "Untitled" })),
            ]}
          />
        </label>
        <label className="block space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Source content</div>
          <textarea rows={6} className="input-base w-full text-sm" value={source} onChange={(e) => setSource(e.target.value)}
            placeholder="Paste script, article, or brief..." />
        </label>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Formats to generate</div>
          <div className="flex flex-wrap gap-2">
            {REPURPOSE_FORMATS.map((f) => {
              const on = formats.includes(f.id);
              return (
                <button key={f.id} onClick={() => toggle(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "border-white/15 hover:border-white/30"}`}>
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end">
          <button disabled={m.isPending || !source.trim() || !formats.length} onClick={() => m.mutate()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary/70 text-primary-foreground disabled:opacity-50">
            {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Split className="w-4 h-4" />}
            Repurpose
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {results.map((r) => {
            const label = REPURPOSE_FORMATS.find((f) => f.id === r.format)?.label ?? r.format;
            return (
              <div key={r.id} className="glass rounded-2xl p-5 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-sm">{label}</div>
                  <button onClick={() => { navigator.clipboard.writeText(r.content); setCopied(r.id); setTimeout(() => setCopied(null), 1500); }}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    {copied === r.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === r.id ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">{r.content}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
