import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { editTextFn } from "@/lib/ai-editor.functions";
import { Wand2, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";

const QUICK: string[] = ["Make it funnier", "Make it shorter", "Rewrite for beginners", "Add suspense", "More emotional", "Professional tone"];

export function AiEditorInline({ text, onAccept, targetType }: {
  text: string;
  onAccept: (next: string) => void;
  targetType?: string;
}) {
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const edit = useServerFn(editTextFn);
  const m = useMutation({
    mutationFn: (ins: string) => edit({ data: { text, instruction: ins, targetType } }),
    onSuccess: (r) => setPreview(r.after),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} onClick={() => m.mutate(q)} disabled={m.isPending}
            className="px-2.5 py-1 rounded-full text-xs border border-white/15 hover:border-primary/50 disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input-base flex-1 text-sm" placeholder="Or describe an edit…"
          value={instruction} onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && instruction) m.mutate(instruction); }} />
        <button disabled={m.isPending || !instruction} onClick={() => m.mutate(instruction)}
          className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-50">
          {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        </button>
      </div>
      {preview && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="text-xs text-muted-foreground mb-1">Preview</div>
          <div className="text-sm whitespace-pre-wrap">{preview}</div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onAccept(preview); setPreview(null); toast.success("Applied"); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs">
              <Check className="w-3 h-3" /> Accept
            </button>
            <button onClick={() => setPreview(null)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-xs">
              <X className="w-3 h-3" /> Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
