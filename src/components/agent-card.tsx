import type { AgentDef } from "@/lib/ai-agents";

export function AgentCard({ agent, onClick, active }: { agent: AgentDef; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-left glass rounded-2xl p-5 border transition-all hover:scale-[1.02] hover:border-primary/50 ${active ? "border-primary" : "border-border"}`}>
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${agent.accent} flex items-center justify-center mb-3`}>
        <agent.icon className="w-6 h-6 text-white" />
      </div>
      <div className="font-semibold">{agent.name}</div>
      <div className="text-xs text-primary mb-2">{agent.role}</div>
      <div className="text-xs text-muted-foreground line-clamp-3">{agent.tagline ?? agent.system}</div>
      {agent.kind === "campaign" && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 uppercase tracking-wider">
          Full Campaign
        </div>
      )}
    </button>
  );
}
