// Creative Director — LLM-powered intent detection + brief building.
// Falls back to the heuristic in `creative-director.ts` on any AI failure so
// generators never break because of the director.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeMiddleware } from "@/lib/credits-guard.server";
import { z } from "zod";
import {
  buildAssetPlanHeuristic,
  buildBriefFromIntent,
  detectIntentHeuristic,
  type AssetPlan,
  type CreativeBrief,
  type ContentIntent,
  type Surface,
  type VisualStyle,
  type ThumbnailStrategy,
  type SlideType,
} from "@/lib/creative-director";

const ContentIntentZ = z.enum([
  "digital_product","physical_product","educational","children_education",
  "documentary","storytelling","explainer","tutorial","saas_demo","website_promo",
  "business","personal_branding","social_media","news","course_promo","general",
]);

const VisualStyleZ = z.enum([
  "photoreal","premium_product_photo","modern_infographic","flat_illustration",
  "montessori","children_illustration","minimal","corporate","luxury","editorial",
  "3d_illustration","comic","magazine","apple_style","pinterest_style","canva_premium",
]);

const ThumbStratZ = z.enum([
  "curiosity","shock","comparison","emotion","transformation",
  "before_after","big_numbers","question","product_focus",
]);

const SlideTypeZ = z.enum([
  "hook","problem","benefits","features","comparison","process",
  "checklist","statistics","case_study","offer","cta",
]);

const BriefSchema = z.object({
  intent: ContentIntentZ,
  confidence: z.number().min(0).max(1),
  visualHero: z.string(),
  visualStyle: VisualStyleZ,
  cameraStyle: z.string(),
  sceneComposition: z.string(),
  assetMix: z.object({
    productPct: z.number(), usagePct: z.number(), peoplePct: z.number(), contextPct: z.number(),
  }),
  marketingGoal: z.string(),
  avoid: z.array(z.string()),
  paletteHint: z.string(),
  brandVoice: z.string(),
  ctaStyle: z.string(),
  thumbnailStrategy: ThumbStratZ,
});

const PlanItemSchema = z.object({
  index: z.number().int().min(1),
  role: z.string(),
  slideType: SlideTypeZ.nullish().transform((v) => v ?? undefined),
  shotType: z.string(),
  visualDescription: z.string(),
  layoutHint: z.string(),
});

const PlanSchema = z.object({
  brief: BriefSchema,
  items: z.array(PlanItemSchema),
});

const Input = z.object({
  prompt: z.string().min(1),
  surface: z.enum(["video","reel","carousel","image","thumbnail","ad","social_post"]),
  count: z.number().int().min(1).max(20).default(1),
  extras: z.string().optional(),
});

const SYSTEM = `You are the Creative Director of an elite marketing agency
(think Ogilvy x Apple x Pentagram) working across video, carousel, image,
thumbnail, and ad surfaces. You produce STRICT JSON creative briefs and asset
plans that STOP downstream models from generating generic AI slop like random
talking heads or stock people. Every decision (visual hero, style, camera,
composition, palette, avoid list, thumbnail strategy) is opinionated and
tailored to the detected intent. Return JSON only — no prose, no markdown.`;

function userPrompt(prompt: string, surface: Surface, count: number, extras?: string) {
  return `USER REQUEST: ${prompt}
SURFACE: ${surface}
ASSET COUNT: ${count}
${extras ? `EXTRAS: ${extras}` : ""}

Return JSON with this exact shape:
{
  "brief": {
    "intent": one of digital_product|physical_product|educational|children_education|documentary|storytelling|explainer|tutorial|saas_demo|website_promo|business|personal_branding|social_media|news|course_promo|general,
    "confidence": 0..1,
    "visualHero": "e.g. 'the product itself' or 'worksheets on an oak table' or 'the dashboard UI'",
    "visualStyle": one of photoreal|premium_product_photo|modern_infographic|flat_illustration|montessori|children_illustration|minimal|corporate|luxury|editorial|3d_illustration|comic|magazine|apple_style|pinterest_style|canva_premium,
    "cameraStyle": "specific camera + lens + framing rules",
    "sceneComposition": "e.g. '70% product / mockups, 20% product-in-use, 10% context'",
    "assetMix": { "productPct": n, "usagePct": n, "peoplePct": n, "contextPct": n },
    "marketingGoal": "one clear conversion goal",
    "avoid": ["explicit list of things NOT to show, including 'random talking heads' when appropriate"],
    "paletteHint": "palette description, ideally 3-4 hex values + mood",
    "brandVoice": "e.g. 'warm, calm, parent-to-parent'",
    "ctaStyle": "clear CTA verb + phrasing",
    "thumbnailStrategy": one of curiosity|shock|comparison|emotion|transformation|before_after|big_numbers|question|product_focus
  },
  "items": [
    {
      "index": 1,
      "role": "e.g. 'Product Hero' | 'Worksheet Flat Lay' | 'Hook'",
      "slideType": (carousel only) one of hook|problem|benefits|features|comparison|process|checklist|statistics|case_study|offer|cta,
      "shotType": "specific shot type — never generic",
      "visualDescription": "what to render in this asset, tied to the visual hero",
      "layoutHint": "layout / composition guidance"
    }
    // ... one item per asset, total = ASSET COUNT.
  ]
}

RULES:
- For product / SaaS / course / website intents: the visualHero must be the product itself, NEVER a random human presenter. Add "random talking heads" and "generic stock people" to avoid.
- For children_education: prefer worksheets, tracing, mazes, coloring pages, hands, and Montessori aesthetic. Avoid cartoon mascots and adult presenters.
- For documentary / storytelling / news: cinematic composition, editorial palette.
- For carousels: item 1 MUST be a hook, the LAST item MUST be cta. Middle items should VARY across slideType — do NOT return six identical slides.
- Each item's shotType must be genuinely different from its neighbors.`;
}

async function callLLM(prompt: string, surface: Surface, count: number, extras?: string) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user",   content: userPrompt(prompt, surface, count, extras) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text().catch(() => "")}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = j.choices?.[0]?.message?.content ?? "";
  if (!raw) throw new Error("AI empty content");
  const parsed = JSON.parse(raw);
  return PlanSchema.parse(parsed);
}

export const runCreativeDirector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("creative_director")])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<AssetPlan> => {
    try {
      const plan = await callLLM(data.prompt, data.surface, data.count, data.extras);
      // Guarantee item count matches request; pad from heuristic if needed.
      if (plan.items.length < data.count) {
        const filler = buildAssetPlanHeuristic(plan.brief as CreativeBrief, data.surface, data.count).items
          .slice(plan.items.length);
        plan.items = [...plan.items, ...filler];
      } else if (plan.items.length > data.count) {
        plan.items = plan.items.slice(0, data.count);
      }
      return plan as AssetPlan;
    } catch (err) {
      // Graceful heuristic fallback.
      console.warn("[creative-director] LLM failed, using heuristic:", err);
      const { intent, confidence } = detectIntentHeuristic(data.prompt);
      const brief = buildBriefFromIntent(data.prompt, intent as ContentIntent, confidence);
      return buildAssetPlanHeuristic(brief, data.surface, data.count);
    }
  });

/** Lightweight variant that only returns the brief (no asset plan). */
export const detectCreativeIntent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ prompt: z.string().min(1) }).parse(v))
  .handler(async ({ data }): Promise<CreativeBrief> => {
    try {
      const plan = await callLLM(data.prompt, "image", 1);
      return plan.brief as CreativeBrief;
    } catch {
      const { intent, confidence } = detectIntentHeuristic(data.prompt);
      return buildBriefFromIntent(data.prompt, intent as ContentIntent, confidence);
    }
  });

// Re-export types so callers only need one import path.
export type { CreativeBrief, AssetPlan, ContentIntent, VisualStyle, ThumbnailStrategy, SlideType };
