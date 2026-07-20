import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeMiddleware } from "@/lib/credits-guard.server";

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
  // High-level overview
  overview: string;

  // 1. Business Strategy
  businessStrategy: {
    positioning: string;
    valueProposition: string;
    differentiators: string[];
    growthLevers: string[];
  };

  // 2. Customer Persona
  customerPersona: {
    name: string;
    demographics: string;
    psychographics: string;
    pains: string[];
    desires: string[];
    objections: string[];
    triggers: string[];
  };

  // 3. Content Pillars
  contentPillars: { name: string; description: string; percentage: number; sampleTopics: string[] }[];

  // 4. Marketing Funnel
  marketingFunnel: {
    awareness: { goal: string; contentTypes: string[]; example: string };
    interest: { goal: string; contentTypes: string[]; example: string };
    consideration: { goal: string; contentTypes: string[]; example: string };
    conversion: { goal: string; contentTypes: string[]; example: string };
    retention: { goal: string; contentTypes: string[]; example: string };
  };

  // 5. Campaign Strategy
  campaigns: { name: string; goal: string; duration: string; hookAngle: string; assets: string[] }[];

  // 6. Offer
  offer: {
    headline: string;
    coreOffer: string;
    bonuses: string[];
    urgency: string;
    guarantee: string;
    priceAnchor: string;
  };

  // 7. CTAs (variants for different stages)
  ctas: { stage: string; text: string }[];

  // 8. 30-Day Content Plan
  thirtyDayPlan: {
    day: number;
    platform: string;
    format: string;
    pillar: string;
    funnelStage: string;
    topic: string;
    hook: string;
    cta: string;
  }[];

  // Bonus supporting data (kept for backwards compatibility with old views)
  viralAngles: string[];
};

/** Compact string used to feed downstream generation modules. */
export function summarizeStrategyForPrompt(plan: StrategyPlan, brief?: Partial<StrategyBrief>): string {
  const parts: string[] = [];
  if (brief?.product) parts.push(`Brand/Product: ${brief.product}`);
  if (brief?.audience) parts.push(`Audience: ${brief.audience}`);
  if (brief?.tone) parts.push(`Tone: ${brief.tone}`);
  if (plan.businessStrategy?.positioning) parts.push(`Positioning: ${plan.businessStrategy.positioning}`);
  if (plan.businessStrategy?.valueProposition) parts.push(`Value prop: ${plan.businessStrategy.valueProposition}`);
  if (plan.customerPersona?.name) {
    parts.push(`Persona: ${plan.customerPersona.name} — ${plan.customerPersona.demographics}`);
    if (plan.customerPersona.pains?.length) parts.push(`Pains: ${plan.customerPersona.pains.slice(0, 4).join("; ")}`);
    if (plan.customerPersona.desires?.length) parts.push(`Desires: ${plan.customerPersona.desires.slice(0, 4).join("; ")}`);
  }
  if (plan.contentPillars?.length) parts.push(`Pillars: ${plan.contentPillars.map((p) => p.name).join(", ")}`);
  if (plan.offer?.coreOffer) parts.push(`Offer: ${plan.offer.coreOffer}`);
  if (plan.ctas?.length) parts.push(`Preferred CTAs: ${plan.ctas.slice(0, 3).map((c) => c.text).join(" | ")}`);
  return parts.join("\n");
}

export const generateStrategyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("strategy")])
  .inputValidator((input: StrategyBrief & { projectId?: string | null }) => input)
  .handler(async ({ data, context }) => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const plan = await gatewayChatJson<StrategyPlan>({
      messages: [
        { role: "system", content: "You are a senior brand & content strategist. Return ONLY a valid JSON object matching the schema. No prose, no markdown fences." },
        { role: "user", content: `Build a comprehensive AI content operating strategy.

Return a JSON object with EXACTLY these top-level keys:

overview: string (2-3 sentence executive summary)

businessStrategy: {
  positioning: string,
  valueProposition: string,
  differentiators: string[] (3-5),
  growthLevers: string[] (3-5)
}

customerPersona: {
  name: string (e.g. "Ambitious Solo Founder Sarah"),
  demographics: string,
  psychographics: string,
  pains: string[] (5),
  desires: string[] (5),
  objections: string[] (3-5),
  triggers: string[] (3-5)
}

contentPillars: array of exactly 4-5 { name, description, percentage (int, sums ~100), sampleTopics: string[] (3-5) }

marketingFunnel: {
  awareness: { goal, contentTypes: string[], example },
  interest:  { goal, contentTypes: string[], example },
  consideration: { goal, contentTypes: string[], example },
  conversion: { goal, contentTypes: string[], example },
  retention:  { goal, contentTypes: string[], example }
}

campaigns: array of 3 { name, goal, duration, hookAngle, assets: string[] }

offer: {
  headline: string,
  coreOffer: string,
  bonuses: string[] (3-4),
  urgency: string,
  guarantee: string,
  priceAnchor: string
}

ctas: array of 6-8 { stage (Awareness|Interest|Consideration|Conversion|Retention), text }

thirtyDayPlan: array of EXACTLY 30 { day (1-30), platform, format (Short|Long|Carousel|Image|Story|Live|Newsletter|Thread), pillar, funnelStage, topic, hook, cta }

viralAngles: string[] (8)

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
      maxTokens: 12000,
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

export const getStrategyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("strategies" as never)
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as {
      id: string; promoting: string; product: string; audience: string;
      goal: string; primary_platform: string; secondary_platforms: string[];
      tone: string; frequency: string; plan: StrategyPlan; created_at: string;
    };
  });

export const deleteStrategyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("strategies" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
