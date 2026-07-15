import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StrategyBrief = {
  promoting: string;
  product: string;
  audience: string;
  goal: string;
  primaryPlatform: string;
  secondaryPlatforms: string[];
  tone: string;
  frequency: string;
};

export type StrategyPlan = {
  overview: string;
  contentPillars: { name: string; description: string }[];
  monthlyCalendar: { week: number; theme: string; posts: { day: string; platform: string; format: string; topic: string; hook: string }[] }[];
  weeklySchedule: { day: string; platform: string; time: string; format: string }[];
  campaigns: { name: string; goal: string; assets: string[] }[];
  viralAngles: string[];
  ctas: string[];
};

export const generateStrategyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: StrategyBrief & { projectId?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const plan = await gatewayChatJson<StrategyPlan>({
      messages: [
        { role: "system", content: "You are a senior content strategist. Return ONLY valid JSON matching the requested schema. No prose." },
        { role: "user", content: `Create a comprehensive content strategy.
Return JSON with keys: overview (string), contentPillars (array of {name, description}, max 5), monthlyCalendar (array of 4 items {week, theme, posts: array of max 5 {day, platform, format, topic, hook}}), weeklySchedule (array of max 7 {day, platform, time, format}), campaigns (array of max 3 {name, goal, assets: string[]}), viralAngles (array of max 8 strings), ctas (array of max 5 strings).

Brief:
- Promoting: ${data.promoting}
- Product/Brand: ${data.product}
- Audience: ${data.audience}
- Goal: ${data.goal}
- Primary platform: ${data.primaryPlatform}
- Secondary: ${data.secondaryPlatforms.join(", ")}
- Tone: ${data.tone}
- Frequency: ${data.frequency}` },
      ],
      temperature: 0.8,
      maxTokens: 6000,
    });

    const { data: row, error } = await context.supabase
      .from("strategies" as never)
      .insert({
        user_id: context.userId,
        project_id: data.projectId ?? null,
        promoting: data.promoting,
        product: data.product,
        audience: data.audience,
        goal: data.goal,
        primary_platform: data.primaryPlatform,
        secondary_platforms: data.secondaryPlatforms,
        tone: data.tone,
        frequency: data.frequency,
        plan,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as { id: string; plan: StrategyPlan };
  });

export const listStrategiesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("strategies" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Array<{
      id: string; promoting: string; product: string; goal: string;
      primary_platform: string; plan: StrategyPlan; created_at: string;
    }>;
  });

export const deleteStrategyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("strategies" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
