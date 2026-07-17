/**
 * SEO Content Package generator.
 *
 * Produces structured, editable outputs per content type — never fabricates
 * SEO metrics (search volumes, difficulty scores, ranking claims).
 * Every keyword suggestion is labelled `aiSuggestion: true` at the schema
 * level so the UI cannot present it as verified data.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { gatewayChatJson } from "@/lib/ai-gateway.server";
import {
  createGenerationJobFn,
  markJobCompleteAdmin,
  markJobFailedAdmin,
  updateJobProgressAdmin,
} from "@/lib/generation-jobs.functions";

export const SEO_CONTENT_TYPES = ["blog", "product", "youtube", "landing"] as const;
export type SeoContentType = (typeof SEO_CONTENT_TYPES)[number];

const inputSchema = z.object({
  contentType: z.enum(SEO_CONTENT_TYPES),
  topic: z.string().min(3).max(300),
  brand: z.string().max(120).optional().default(""),
  audience: z.string().max(240).optional().default(""),
  region: z.string().max(80).optional().default(""),
  language: z.string().max(40).optional().default("English"),
  primaryKeyword: z.string().max(120).optional().default(""),
  secondaryKeywords: z.string().max(400).optional().default(""),
  tone: z.string().max(60).optional().default("professional"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
  cta: z.string().max(200).optional().default(""),
  projectId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().min(1).max(128),
});

export type SeoPackageInput = z.infer<typeof inputSchema>;

const CREDITS_FULL = 5;

function systemPrompt(contentType: SeoContentType): string {
  const common =
    "You are an SEO content strategist. Return STRICT JSON only, matching the schema described below. " +
    "Do NOT invent numerical search volume, keyword difficulty, CPC, or Google ranking claims. " +
    "Every keyword suggestion must be marked as an AI suggestion. Do not include text outside JSON.";
  const shape: Record<SeoContentType, string> = {
    blog: `Schema: {
  "kind": "blog",
  "brief": string, "searchIntent": string, "audience": string,
  "primaryKeyword": string,
  "secondaryKeywords": Array<{"term": string, "aiSuggestion": true, "reason": string}>,
  "titleOptions": string[5], "seoTitle": string, "metaDescription": string, "urlSlug": string,
  "h1": string,
  "outline": Array<{"heading": string, "level": 2|3, "points": string[]}>,
  "article": string,
  "featuredSnippet": string,
  "keyTakeaways": string[],
  "faq": Array<{"q": string, "a": string}>,
  "faqSchema": string,
  "articleSchema": string,
  "internalLinkAnchors": string[],
  "externalTopics": string[],
  "imageIdeas": string[],
  "altTextSuggestions": string[],
  "socialShareTitle": string, "socialShareDescription": string,
  "qualityChecklist": Array<{"item": string, "done": false}>
}`,
    product: `Schema: {
  "kind": "product",
  "productNames": string[5], "seoProductTitle": string,
  "shortDescription": string, "fullSalesDescription": string,
  "problem": string, "benefits": string[], "features": string[], "inclusions": string[],
  "idealCustomer": string, "useCases": string[], "howItWorks": string[], "trustPoints": string[],
  "cta": string, "faq": Array<{"q": string, "a": string}>,
  "seoTitle": string, "metaDescription": string, "urlSlug": string, "productSchema": string,
  "imageAltText": string[], "socialCaptions": string[]
}`,
    youtube: `Schema: {
  "kind": "youtube",
  "titleOptions": string[5], "description": string, "hook": string,
  "chapters": Array<{"time": string, "label": string}>,
  "tags": string[], "hashtags": string[],
  "thumbnailTextOptions": string[], "thumbnailConcept": string,
  "pinnedComment": string, "communityPost": string, "shortPromoIdeas": string[]
}`,
    landing: `Schema: {
  "kind": "landing",
  "heroHeadline": string, "subheadline": string,
  "benefits": string[], "features": string[], "howItWorks": string[],
  "socialProofPlaceholders": Array<{"placeholder": string, "note": "Placeholder — replace with real proof"}>,
  "faq": Array<{"q": string, "a": string}>, "ctaSections": string[],
  "seoTitle": string, "metaDescription": string, "urlSlug": string,
  "schemaSuggestions": string[], "imageAltText": string[]
}`,
  };
  return `${common}\n\n${shape[contentType]}`;
}

function userPrompt(input: SeoPackageInput): string {
  return [
    `Topic: ${input.topic}`,
    input.brand && `Brand: ${input.brand}`,
    input.audience && `Audience: ${input.audience}`,
    input.region && `Region: ${input.region}`,
    input.language && `Language: ${input.language}`,
    input.primaryKeyword && `Primary keyword: ${input.primaryKeyword}`,
    input.secondaryKeywords && `Secondary keywords: ${input.secondaryKeywords}`,
    `Tone: ${input.tone}`,
    `Length: ${input.length}`,
    input.cta && `Desired CTA: ${input.cta}`,
    "",
    "Return the JSON matching the schema exactly. No prose outside the JSON.",
  ].filter(Boolean).join("\n");
}

export const generateSeoPackageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => inputSchema.parse(v))
  .handler(async ({ data, context }) => {
    // Create + reserve credits via the shared job service.
    const create = (createGenerationJobFn as unknown as (opts: { data: unknown }) => Promise<{ job: { id: string }; reused: boolean }>);
    const { job } = await create({
      data: {
        moduleType: "seo_package",
        jobType: `seo_${data.contentType}`,
        projectId: data.projectId ?? null,
        requestPayload: { contentType: data.contentType, topic: data.topic, length: data.length } as never,
        creditsEstimated: CREDITS_FULL,
        provider: "lovable-gateway",
        idempotencyKey: data.idempotencyKey,
      },
    });

    try {
      await updateJobProgressAdmin({ jobId: job.id, status: "processing", progress: 15, currentStep: "Generating SEO package" });

      const result = await gatewayChatJson<Record<string, unknown>>({
        model: "openai/gpt-5.5",
        maxTokens: data.length === "long" ? 8000 : 5000,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt(data.contentType) },
          { role: "user", content: userPrompt(data) },
        ],
      });

      await updateJobProgressAdmin({ jobId: job.id, progress: 85, currentStep: "Saving package" });

      // Persist into projects if a projectId was provided; otherwise return inline.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let projectId = data.projectId ?? null;
      if (!projectId) {
        const { data: p, error: pErr } = await supabaseAdmin.from("projects").insert({
          user_id: context.userId,
          content_type: "seo_pack",
          title: `SEO · ${data.topic.slice(0, 80)}`,
          status: "completed",
          metadata: { seoPackage: result, contentType: data.contentType, input: data } as never,
        }).select("id").single();
        if (!pErr && p) projectId = p.id;
      } else {
        await supabaseAdmin.from("projects").update({
          metadata: { seoPackage: result, contentType: data.contentType, input: data } as never,
          status: "completed",
        }).eq("id", projectId).eq("user_id", context.userId);
      }

      await markJobCompleteAdmin({ jobId: job.id, outputPayload: { projectId, contentType: data.contentType } as never });
      return { jobId: job.id, projectId, package: result, contentType: data.contentType };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJobFailedAdmin({ jobId: job.id, code: "seo_generation_error", message: msg, refund: true });
      throw e;
    }
  });

export const regenerateSeoSectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      sectionKey: z.string().min(1).max(64),
      instruction: z.enum(["regenerate", "shorter", "longer", "retune"]).default("regenerate"),
      tone: z.string().max(60).optional(),
      idempotencyKey: z.string().min(1).max(128),
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const create = (createGenerationJobFn as unknown as (opts: { data: unknown }) => Promise<{ job: { id: string }; reused: boolean }>);
    const { job } = await create({
      data: {
        moduleType: "seo_package",
        jobType: `seo_section_${data.instruction}`,
        projectId: data.projectId,
        requestPayload: { sectionKey: data.sectionKey, instruction: data.instruction } as never,
        creditsEstimated: 1,
        provider: "lovable-gateway",
        idempotencyKey: data.idempotencyKey,
      },
    });

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: proj, error } = await supabaseAdmin
        .from("projects").select("id, user_id, metadata").eq("id", data.projectId).maybeSingle();
      if (error || !proj || proj.user_id !== context.userId) throw new Error("project not found");
      const meta = (proj.metadata ?? {}) as { seoPackage?: Record<string, unknown>; contentType?: SeoContentType; input?: SeoPackageInput };
      const pkg = meta.seoPackage ?? {};
      const currentValue = (pkg as Record<string, unknown>)[data.sectionKey];
      if (currentValue === undefined) throw new Error("Section not found");

      await updateJobProgressAdmin({ jobId: job.id, status: "processing", progress: 30, currentStep: `Rewriting ${data.sectionKey}` });

      const modeMsg =
        data.instruction === "shorter" ? "Rewrite significantly shorter, keep meaning." :
        data.instruction === "longer" ? "Expand with useful detail; do not fluff." :
        data.instruction === "retune" ? `Rewrite in a ${data.tone ?? "friendlier"} tone.` :
        "Rewrite from scratch keeping the same intent.";

      const newValue = await gatewayChatJson<{ value: unknown }>({
        model: "openai/gpt-5.5",
        maxTokens: 3000,
        temperature: 0.6,
        messages: [
          { role: "system", content: "Return STRICT JSON: {\"value\": <replacement value in the SAME shape as input>}. No commentary." },
          { role: "user", content: `Section: ${data.sectionKey}\nInstruction: ${modeMsg}\nCurrent value JSON:\n${JSON.stringify(currentValue).slice(0, 6000)}` },
        ],
      });

      const nextPkg = { ...pkg, [data.sectionKey]: newValue.value };
      await supabaseAdmin.from("projects").update({
        metadata: { ...meta, seoPackage: nextPkg } as never,
      }).eq("id", data.projectId);

      await markJobCompleteAdmin({ jobId: job.id, outputPayload: { sectionKey: data.sectionKey } as never });
      return { jobId: job.id, sectionKey: data.sectionKey, value: newValue.value };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJobFailedAdmin({ jobId: job.id, code: "seo_section_regen_error", message: msg, refund: true });
      throw e;
    }
  });

export const getSeoProjectFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ projectId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: proj, error } = await context.supabase
      .from("projects").select("id, title, metadata, updated_at").eq("id", data.projectId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!proj) return null;
    const meta = (proj.metadata ?? {}) as { seoPackage?: Record<string, unknown>; contentType?: SeoContentType; input?: SeoPackageInput };
    return {
      id: proj.id,
      title: proj.title,
      updatedAt: proj.updated_at,
      contentType: meta.contentType ?? null,
      package: meta.seoPackage ?? null,
      input: meta.input ?? null,
    };
  });
