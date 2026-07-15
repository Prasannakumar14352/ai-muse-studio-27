import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResearchFindings = {
  trendingTopics: string[];
  keywords: { term: string; intent: string }[];
  faqs: string[];
  competitors: { name: string; angle: string }[];
  contentGaps: string[];
  searchIntent: string;
  audiencePains: string[];
  suggestedHooks: string[];
};

export const runResearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { topic: string; niche?: string; platform?: string; projectId?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const findings = await gatewayChatJson<ResearchFindings>({
      messages: [
        { role: "system", content: "You are a viral content research analyst. Return ONLY valid JSON with the requested keys." },
        { role: "user", content: `Research this topic for a content creator.
Return JSON: { trendingTopics: string[] (max 10), keywords: {term, intent}[] (max 15), faqs: string[] (max 10), competitors: {name, angle}[] (max 6), contentGaps: string[] (max 8), searchIntent: string, audiencePains: string[] (max 8), suggestedHooks: string[] (max 10) }.

Topic: ${data.topic}
Niche: ${data.niche ?? "general"}
Platform: ${data.platform ?? "any"}` },
      ],
      temperature: 0.6,
      maxTokens: 4000,
    });

    const { data: row, error } = await context.supabase
      .from("research_reports" as never)
      .insert({
        user_id: context.userId,
        project_id: data.projectId ?? null,
        topic: data.topic,
        niche: data.niche ?? null,
        platform: data.platform ?? null,
        findings,
        sources: [],
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (data.projectId) {
      await context.supabase.from("project_memory" as never).insert({
        user_id: context.userId,
        project_id: data.projectId,
        kind: "research",
        payload: findings,
      } as never);
    }
    return row as unknown as { id: string; findings: ResearchFindings };
  });

export const listResearchFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("research_reports" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{
      id: string; topic: string; niche: string | null; platform: string | null;
      findings: ResearchFindings; created_at: string;
    }>;
  });

export const deleteResearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("research_reports" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
