import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AI_AGENTS } from "@/lib/ai-agents";
import { AgentCard } from "@/components/agent-card";
import { AgentRunner } from "@/components/agent-runner";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents")({ component: AgentsPage });

function AgentsPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = AI_AGENTS.find((a) => a.id === activeId);
  const campaigns = AI_AGENTS.filter((a) => a.kind === "campaign");
  const specialists = AI_AGENTS.filter((a) => a.kind === "specialist");

  return (
    <div className="max-w-6xl space-y-8">
      <header>
        <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-2"><Bot className="w-7 h-7 text-primary" /> AI Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">Specialists produce single assets. Campaign agents produce complete, publish-ready multi-asset campaigns.</p>
      </header>

      {active && <AgentRunner agent={active} onClose={() => setActiveId(null)} />}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Campaign Agents</h2>
          <span className="text-xs text-muted-foreground">Full campaigns · strategy + calendar + assets</span>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((a) => (
            <AgentCard key={a.id} agent={a} onClick={() => setActiveId(a.id)} active={a.id === activeId} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Specialists</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {specialists.map((a) => (
            <AgentCard key={a.id} agent={a} onClick={() => setActiveId(a.id)} active={a.id === activeId} />
          ))}
        </div>
      </section>
    </div>
  );
}
