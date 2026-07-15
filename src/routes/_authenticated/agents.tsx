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

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Bot className="w-7 h-7 text-primary" /> AI Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">Specialized AI experts, each tuned for one job.</p>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {AI_AGENTS.map((a) => (
          <AgentCard key={a.id} agent={a} onClick={() => setActiveId(a.id)} active={a.id === activeId} />
        ))}
      </div>

      {active && <AgentRunner agent={active} onClose={() => setActiveId(null)} />}
    </div>
  );
}
