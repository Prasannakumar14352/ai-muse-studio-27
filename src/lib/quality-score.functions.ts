import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QualityScores = {
  hook: number;
  retention: number;
  seo: number;
  thumbnail: number;
  script: number;
  cta: number;
  overall: number;
};

export const scoreAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { projectId?: string | null; assetType: string; payload: any }) => i)
  .handler(async ({ data, context }) => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const result = await gatewayChatJson<{ scores: QualityScores; recommendations: string[] }>({
      messages: [
        { role: "system", content: "You are a strict content quality auditor. Score each dimension 0-100. Return ONLY JSON." },
        { role: "user", content: `Rate this ${data.assetType}. Return JSON: { scores: { hook, retention, seo, thumbnail, script, cta, overall }, recommendations: string[] (max 8, actionable, one line each) }.

Asset payload:
${JSON.stringify(data.payload).slice(0, 6000)}` },
      ],
      temperature: 0.3,
      maxTokens: 1500,
    });

    if (data.projectId) {
      await context.supabase.from("quality_scores" as never).insert({
        user_id: context.userId,
        project_id: data.projectId,
        asset_type: data.assetType,
        scores: result.scores,
        recommendations: result.recommendations,
      } as never);
    }
    return result;
  });

export const listQualityScoresFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { projectId: string }) => i)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("quality_scores" as never)
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Array<{
      id: string; asset_type: string; scores: QualityScores; recommendations: string[]; created_at: string;
    }>;
  });
