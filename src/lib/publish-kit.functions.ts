// Publish Kit + Quality Review server functions.
// The Publish Kit produces the full distribution package for a video/short
// (SEO title/desc, per-platform captions, hashtags, pinned comment, thumbnail
// concept + prompt). The Quality Reviewer scores the whole asset across 8
// dimensions and flags weak sections. All AI calls go through Lovable AI
// Gateway. No client-side keys.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseStructuredJsonResponse } from "@/lib/video-json";
import {
  BANNED_OPENERS,
  CTA_LIBRARY,
  HOOK_ARCHETYPES,
  PLATFORM_LIMITS,
  classifyTopic,
  pickCta,
  pickHook,
  pickStructure,
  requiresFactualHedging,
  type CtaType,
  type HookArchetype,
  type Platform,
} from "@/lib/short-video-engine";

// ---------- Publish Kit ----------

export type PlatformKit = {
  caption: string;
  hashtags: string[];
};

export type PublishKit = {
  version: 1;
  format: "short" | "long";
  primary_platform: Platform;
  seo_title: string;
  seo_description: string;
  keywords: string[];
  cta_type: CtaType;
  cta_line: string;
  pinned_comment: string;
  thumbnail: { concept: string; prompt: string };
  platforms: Partial<Record<Platform, PlatformKit>>;
  hook_archetype: HookArchetype;
  generated_at: string;
};

const PublishKitInput = z.object({
  topic: z.string().min(1),
  title: z.string().default(""),
  script: z.string().default(""),
  hook_line: z.string().default(""),
  format: z.enum(["short", "long"]).default("short"),
  audience: z.string().default(""),
  tone: z.string().default("cinematic"),
  primary_platform: z
    .enum(["instagram", "tiktok", "youtube_shorts", "facebook", "linkedin", "pinterest"])
    .default("instagram"),
  cta_goal: z
    .enum(["comment", "share", "save", "follow", "visit", "download", "learn_more", "shop", "dm", "waitlist"])
    .optional(),
});

async function callGatewayJson<T>(
  key: string,
  system: string,
  user: string,
  schema: z.ZodType<T>,
  model = "google/gemini-2.5-flash",
): Promise<T> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${t || res.statusText}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = j.choices?.[0]?.message?.content ?? "";
  const parsed = parseStructuredJsonResponse(raw);
  const checked = schema.safeParse(parsed.value);
  if (!checked.success) {
    throw new Error(`Schema mismatch: ${checked.error.message}`);
  }
  return checked.data;
}

export const generatePublishKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PublishKitInput.parse(v))
  .handler(async ({ data }): Promise<PublishKit> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const bucket = classifyTopic(data.topic);
    const hook = pickHook(bucket);
    const structure = pickStructure(bucket);
    const ctaType: CtaType = data.cta_goal ?? pickCta(bucket);
    const hedge = requiresFactualHedging(bucket);

    const platforms: Platform[] = ["instagram", "tiktok", "youtube_shorts", "facebook"];
    const limitsText = platforms
      .map((p) => {
        const l = PLATFORM_LIMITS[p];
        return `- ${p}: caption <= ${l.captionMax} chars, ${l.hashtagCount[0]}-${l.hashtagCount[1]} hashtags`;
      })
      .join("\n");

    const sys = `You are the head of social growth at a top creative studio. You write
production-ready distribution kits for viral short-form video. Every caption
you write MUST fit the platform's character limit, feel native to that
platform, and stop the scroll in the first line. Never start with banned
openers: ${BANNED_OPENERS.join(", ")}. Return ONLY valid JSON.`;

    const user = `Generate a complete publish kit for this video.

TOPIC: ${data.topic}
TITLE (working): ${data.title || "(none — invent one)"}
HOOK LINE: ${data.hook_line || "(derive from topic)"}
FORMAT: ${data.format} (${data.format === "short" ? "9:16 vertical, 15-60s" : "16:9, long-form"})
PRIMARY PLATFORM: ${data.primary_platform}
AUDIENCE: ${data.audience || "general social viewer"}
TONE: ${data.tone}
STORY STRUCTURE: ${structure}
HOOK ARCHETYPE: ${hook} — ${HOOK_ARCHETYPES[hook].guidance}
CTA GOAL: ${ctaType} — ${CTA_LIBRARY[ctaType].label}
${hedge ? "FACTUAL HEDGING REQUIRED: use phrases like 'Research suggests', 'Evidence indicates', 'Experts generally agree'. Never invent statistics.\n" : ""}
SCRIPT (may be empty):
${(data.script || "").slice(0, 2000)}

PLATFORM LIMITS (HARD — do not exceed):
${limitsText}

Produce:
1. seo_title: <= 60 chars, keyword-first, no clickbait lies.
2. seo_description: <= 160 chars, benefit-oriented, includes 1-2 keywords.
3. keywords: 5-10 short-tail search terms, lowercase.
4. cta_line: one sentence that drives the ${ctaType} action, tuned to this topic.
5. pinned_comment: a first comment the creator pins to spark replies. 1-2 sentences, ends with a question.
6. thumbnail.concept: 1 sentence describing the visual concept.
7. thumbnail.prompt: a 100-150 word image-model prompt, 9:16 for shorts / 16:9 for long, with concrete camera + lighting + subject.
8. platforms.instagram, platforms.tiktok, platforms.youtube_shorts, platforms.facebook — each with:
   - caption (native voice, within limit)
   - hashtags (within count range, no banned tags, mix of broad + niche + branded)

Return ONLY this JSON shape:
{
  "seo_title": "string",
  "seo_description": "string",
  "keywords": ["string"],
  "cta_line": "string",
  "pinned_comment": "string",
  "thumbnail": { "concept": "string", "prompt": "string" },
  "platforms": {
    "instagram": { "caption": "string", "hashtags": ["#a"] },
    "tiktok": { "caption": "string", "hashtags": ["#a"] },
    "youtube_shorts": { "caption": "string", "hashtags": ["#a"] },
    "facebook": { "caption": "string", "hashtags": ["#a"] }
  }
}`;

    const Schema = z.object({
      seo_title: z.string(),
      seo_description: z.string(),
      keywords: z.array(z.string()).default([]),
      cta_line: z.string(),
      pinned_comment: z.string(),
      thumbnail: z.object({ concept: z.string(), prompt: z.string() }),
      platforms: z.object({
        instagram: z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]) }).optional(),
        tiktok: z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]) }).optional(),
        youtube_shorts: z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]) }).optional(),
        facebook: z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]) }).optional(),
      }),
    });

    const out = await callGatewayJson(key, sys, user, Schema);

    // Clamp captions and hashtag counts against PLATFORM_LIMITS as a safety net.
    const platOut: PublishKit["platforms"] = {};
    for (const p of platforms) {
      const raw = (out.platforms as Record<string, { caption: string; hashtags?: string[] } | undefined>)[p];
      if (!raw) continue;
      const lim = PLATFORM_LIMITS[p];
      const caption = raw.caption.length > lim.captionMax ? raw.caption.slice(0, lim.captionMax - 1) + "…" : raw.caption;
      const hashtags = (raw.hashtags ?? [])
        .map((h: string) => (h.startsWith("#") ? h : `#${h}`))
        .slice(0, lim.hashtagCount[1]);
      platOut[p] = { caption, hashtags };
    }

    return {
      version: 1,
      format: data.format,
      primary_platform: data.primary_platform,
      seo_title: out.seo_title.slice(0, 60),
      seo_description: out.seo_description.slice(0, 160),
      keywords: out.keywords.slice(0, 10),
      cta_type: ctaType,
      cta_line: out.cta_line,
      pinned_comment: out.pinned_comment,
      thumbnail: out.thumbnail,
      platforms: platOut,
      hook_archetype: hook,
      generated_at: new Date().toISOString(),
    };
  });

// ---------- Quality Review ----------

export type QualityScore = {
  section: string;
  score: number;         // 0-100
  threshold: number;
  passed: boolean;
  notes: string;
};

export type QualityReport = {
  version: 1;
  overall: number;
  passed: boolean;
  scores: QualityScore[];
  weakest_section: string | null;
  suggestions: string[];
  generated_at: string;
};

const QUALITY_THRESHOLDS: Record<string, number> = {
  hook_strength: 80,
  storytelling: 75,
  factual_accuracy: 85,
  visual_diversity: 75,
  thumbnail_quality: 75,
  seo_completeness: 90,
  cta_suitability: 75,
  retention: 75,
};

const QualityInput = z.object({
  topic: z.string().default(""),
  title: z.string().default(""),
  hook_line: z.string().default(""),
  script: z.string().default(""),
  scenes_summary: z.string().default(""),
  publish_kit: z.unknown().optional(),
  format: z.enum(["short", "long"]).default("short"),
});

export const reviewVideoQuality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => QualityInput.parse(v))
  .handler(async ({ data }): Promise<QualityReport> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const bucket = classifyTopic(data.topic);
    const hedge = requiresFactualHedging(bucket);
    const kitStr = data.publish_kit ? JSON.stringify(data.publish_kit).slice(0, 4000) : "(none yet)";

    const sys = `You are a senior YouTube + TikTok growth strategist doing a
production quality review. Be strict. Score each section 0-100 like a real
editor would. Return ONLY valid JSON.`;

    const user = `Review this ${data.format} video asset. Score each section 0-100.

TOPIC: ${data.topic}
TITLE: ${data.title}
HOOK LINE: ${data.hook_line}
${hedge ? "This is a health/finance/science/psychology topic — deduct heavily for uncited absolutes or fabricated stats.\n" : ""}
SCRIPT (truncated):
${(data.script || "").slice(0, 3000)}

SCENES SUMMARY:
${(data.scenes_summary || "").slice(0, 2000)}

PUBLISH KIT:
${kitStr}

Score these 8 sections (0-100 each):
- hook_strength: does the hook stop the scroll? Ban openers like ${BANNED_OPENERS.slice(0, 5).join(", ")}.
- storytelling: coherent arc, curiosity payoffs, no filler.
- factual_accuracy: hedging on health/finance/science; no fabricated numbers.
- visual_diversity: scene environments/angles/palettes must not repeat within 3-beat window.
- thumbnail_quality: high contrast, single subject, <=6 words if text present.
- seo_completeness: title <=60, desc <=160, keywords present, per-platform captions.
- cta_suitability: CTA matches goal, feels native, not generic "like and subscribe".
- retention: a new visual/info/emotion beat every ~2-3 seconds.

For each, produce { score, notes } where notes explains the deduction in 1 sentence.
Also produce weakest_section (the key name of the lowest score) and 3 concrete suggestions.

Return ONLY this JSON:
{
  "scores": {
    "hook_strength": { "score": 0, "notes": "" },
    "storytelling": { "score": 0, "notes": "" },
    "factual_accuracy": { "score": 0, "notes": "" },
    "visual_diversity": { "score": 0, "notes": "" },
    "thumbnail_quality": { "score": 0, "notes": "" },
    "seo_completeness": { "score": 0, "notes": "" },
    "cta_suitability": { "score": 0, "notes": "" },
    "retention": { "score": 0, "notes": "" }
  },
  "weakest_section": "string",
  "suggestions": ["string"]
}`;

    const ScoreShape = z.object({ score: z.number().min(0).max(100), notes: z.string().default("") });
    const Schema = z.object({
      scores: z.object({
        hook_strength: ScoreShape,
        storytelling: ScoreShape,
        factual_accuracy: ScoreShape,
        visual_diversity: ScoreShape,
        thumbnail_quality: ScoreShape,
        seo_completeness: ScoreShape,
        cta_suitability: ScoreShape,
        retention: ScoreShape,
      }),
      weakest_section: z.string().default(""),
      suggestions: z.array(z.string()).default([]),
    });

    const out = await callGatewayJson(key, sys, user, Schema);

    const scores: QualityScore[] = Object.entries(out.scores).map(([section, v]) => {
      const threshold = QUALITY_THRESHOLDS[section] ?? 75;
      return {
        section,
        score: Math.round(v.score),
        threshold,
        passed: v.score >= threshold,
        notes: v.notes,
      };
    });

    const overall = Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length);
    const failed = scores.filter((s) => !s.passed);
    const weakest = failed.length
      ? failed.reduce((min, s) => (s.score < min.score ? s : min), failed[0]).section
      : null;

    return {
      version: 1,
      overall,
      passed: failed.length === 0,
      scores,
      weakest_section: weakest,
      suggestions: out.suggestions.slice(0, 6),
      generated_at: new Date().toISOString(),
    };
  });
