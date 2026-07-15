import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResearchFindings = {
  // Original core signals
  trendingTopics: string[];
  keywords: { term: string; intent: string; volume?: string; difficulty?: string }[];
  faqs: string[];
  competitors: { name: string; angle: string; strength?: string; weakness?: string }[];
  contentGaps: string[];
  searchIntent: string;
  audiencePains: string[];
  suggestedHooks: string[];

  // New source-specific signals (AI-synthesized; can be replaced with live connectors later)
  googleTrends: {
    risingQueries: { term: string; growth: string }[];
    relatedTopics: string[];
    seasonality: string;
  };
  redditDiscussions: {
    subreddit: string;
    title: string;
    insight: string;
    sentiment: "positive" | "negative" | "mixed" | "curious";
  }[];
  youtubeSearches: {
    query: string;
    topVideoAngle: string;
    estViews: string;
    contentGap: string;
  }[];
};

export const runResearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { topic: string; niche?: string; platform?: string; projectId?: string | null }) => i)
  .handler(async ({ data, context }) => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const findings = await gatewayChatJson<ResearchFindings>({
      messages: [
        { role: "system", content: "You are a viral content research analyst with deep knowledge of Google Trends patterns, active Reddit communities, and YouTube search dynamics. Return ONLY a valid JSON object matching the requested schema. No prose, no markdown fences. Base your synthesis on well-known patterns in the topic space." },
        { role: "user", content: `Research this topic across multiple signal sources.

Return a JSON object with EXACTLY these keys:

trendingTopics: string[] (max 10)
keywords: array of max 15 { term, intent, volume ("Low"|"Medium"|"High"|"Very High"), difficulty ("Easy"|"Medium"|"Hard") }
faqs: string[] (max 10, phrased as real questions people ask)
competitors: array of max 6 { name, angle, strength, weakness }
contentGaps: string[] (max 8)
searchIntent: string (one paragraph describing dominant intent)
audiencePains: string[] (max 8)
suggestedHooks: string[] (max 10)

googleTrends: {
  risingQueries: array of 6-8 { term, growth ("+120%" style) },
  relatedTopics: string[] (6-8),
  seasonality: string (1-2 sentences on when interest peaks)
}

redditDiscussions: array of 6-8 { subreddit (e.g. "r/entrepreneur"), title (realistic thread title), insight (what the community actually wants), sentiment ("positive"|"negative"|"mixed"|"curious") }

youtubeSearches: array of 6-8 { query (what people type into YouTube search), topVideoAngle (angle winning videos take), estViews ("100K+"|"500K+"|"1M+" style), contentGap (what winners miss) }

Topic: ${data.topic}
Niche: ${data.niche ?? "general"}
Platform: ${data.platform ?? "any"}` },
      ],
      temperature: 0.6,
      maxTokens: 8000,
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
        sources: ["ai_synthesized:google_trends", "ai_synthesized:reddit", "ai_synthesized:youtube"],
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
