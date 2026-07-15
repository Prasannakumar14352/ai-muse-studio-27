import type { MemoryEntry } from "@/lib/project-memory.functions";
import { Brain } from "lucide-react";

export function ProjectMemoryTimeline({ items }: { items: MemoryEntry[] }) {
  if (!items?.length) return <div className="text-sm text-muted-foreground p-4">No memory yet.</div>;
  return (
    <div className="space-y-2">
      {items.map((m) => (
        <div key={m.id} className="rounded-xl border border-white/10 bg-card/40 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Brain className="w-3.5 h-3.5 text-primary" />
            <span className="uppercase tracking-wider">{m.kind}</span>
            <span>•</span>
            <span>{new Date(m.created_at).toLocaleString()}</span>
          </div>
          <pre className="text-xs mt-2 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
            {JSON.stringify(m.payload, null, 2).slice(0, 2000)}
          </pre>
        </div>
      ))}
    </div>
  );
}
