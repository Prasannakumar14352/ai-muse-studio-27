import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runAgentFn } from "@/lib/agents.functions";
import { AI_AGENTS, type AgentDef } from "@/lib/ai-agents";
import { Send, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function AgentRunner({ agent, onClose }: { agent: AgentDef; onClose?: () => void }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const run = useServerFn(runAgentFn);
  const m = useMutation({
    mutationFn: () => run({ data: { agentId: agent.id, input } }),
    onSuccess: (r) => setOutput(r.output),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="glass rounded-2xl p-6 border border-white/10 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agent.accent} flex items-center justify-center`}>
          <agent.icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">{agent.name}</div>
          <div className="text-xs text-muted-foreground">{agent.role}</div>
        </div>
        {onClose && <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button>}
      </div>

      <textarea
        rows={4}
        className="input-base w-full font-mono text-sm"
        placeholder={`Ask ${agent.name} anything...`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          disabled={m.isPending || !input.trim()}
          onClick={() => m.mutate()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-50">
          {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Run
        </button>
      </div>

      {output && (
        <div className="rounded-xl border border-white/10 bg-background/40 p-4 whitespace-pre-wrap text-sm">
          <div className="flex items-center gap-2 mb-2 text-xs text-primary">
            <Sparkles className="w-3 h-3" /> {agent.name}
          </div>
          {output}
        </div>
      )}
    </div>
  );
}

export { AI_AGENTS };
