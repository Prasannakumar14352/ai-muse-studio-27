import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { runAgentFn } from "@/lib/agents.functions";
import { AI_AGENTS, type AgentDef } from "@/lib/ai-agents";
import { Send, Loader2, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";

const CAMPAIGN_PLACEHOLDER = `Example:\n• Brand: <your brand>\n• Product / topic: <what to promote>\n• Audience: <who>\n• Goal: <awareness / leads / sales / signups>\n• Tone: <your voice>\n• Any constraints, dates, or offers`;

export function AgentRunner({ agent, onClose }: { agent: AgentDef; onClose?: () => void }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const run = useServerFn(runAgentFn);
  const m = useMutation({
    mutationFn: () => run({ data: { agentId: agent.id, input } }),
    onSuccess: (r) => setOutput(r.output),
    onError: (e: Error) => toast.error(e.message),
  });

  const isCampaign = agent.kind === "campaign";

  async function copyAll() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    toast.success("Campaign copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="glass rounded-2xl p-6 border border-border space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${agent.accent} flex items-center justify-center`}>
          <agent.icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="font-semibold flex items-center gap-2">
            {agent.name}
            {isCampaign && (
              <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">Campaign</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{agent.role}{agent.tagline ? ` — ${agent.tagline}` : ""}</div>
        </div>
        {onClose && <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button>}
      </div>

      <textarea
        rows={isCampaign ? 6 : 4}
        className="input-base w-full text-sm"
        placeholder={isCampaign ? CAMPAIGN_PLACEHOLDER : `Ask ${agent.name} anything...`}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="flex justify-end">
        <button
          disabled={m.isPending || !input.trim()}
          onClick={() => m.mutate()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-50">
          {m.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isCampaign ? "Generate Full Campaign" : "Run"}
        </button>
      </div>

      {output && (
        <div className="rounded-xl border border-border bg-background/40 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs text-primary">
              <Sparkles className="w-3 h-3" /> {agent.name} — {isCampaign ? "Campaign Output" : "Output"}
            </div>
            <button onClick={copyAll} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Copy all
            </button>
          </div>
          <article className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-strong:text-primary prose-a:text-primary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}

export { AI_AGENTS };

