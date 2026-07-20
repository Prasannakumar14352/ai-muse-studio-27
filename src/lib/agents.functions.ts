import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeMiddleware } from "@/lib/credits-guard.server";

export const runAgentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("agent_campaign", 2)])
  .inputValidator((i: { agentId: string; input: string; projectId?: string | null }) => {
    if (!i.input?.trim()) throw new Error("input required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { getAgent } = await import("@/lib/ai-agents");
    const { gatewayChatText } = await import("@/lib/ai-gateway.server");
    const agent = getAgent(data.agentId);
    if (!agent) throw new Error(`Unknown agent: ${data.agentId}`);

    const output = await gatewayChatText({
      messages: [
        { role: "system", content: agent.system },
        { role: "user", content: data.input },
      ],
      temperature: 0.75,
      maxTokens: agent.kind === "campaign" ? 8000 : 2500,
    });

    if (data.projectId) {
      await context.supabase.from("project_memory" as never).insert({
        user_id: context.userId,
        project_id: data.projectId,
        kind: `agent:${agent.id}`,
        payload: { input: data.input, output },
      } as never);
    }
    return { output, agent: { id: agent.id, name: agent.name, role: agent.role } };
  });
