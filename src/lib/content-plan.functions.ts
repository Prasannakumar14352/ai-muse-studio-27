// Unified AI planning server function for all generation modules.
// Returns an editable JSON plan the wizard's PlanEditor renders as sections.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PlanModule =
  | "video"
  | "carousel"
  | "image"
  | "thumbnail"
  | "linkedin"
  | "caption";

export type PlanSection = {
  key: string;
  label: string;
  /** "text" = single string; "list" = string[]; "longtext" = multiline */
  kind: "text" | "longtext" | "list";
  value: string | string[];
};

export type ContentPlan = {
  module: PlanModule;
  topic: string;
  sections: PlanSection[];
};

const SCHEMAS: Record<PlanModule, Array<{ key: string; label: string; kind: PlanSection["kind"] }>> = {
  video: [
    { key: "outline", label: "Outline", kind: "list" },
    { key: "script", label: "Script", kind: "longtext" },
    { key: "scenes", label: "Scene breakdown", kind: "list" },
    { key: "imagePrompts", label: "Image prompts", kind: "list" },
    { key: "videoPrompts", label: "Video prompts", kind: "list" },
    { key: "voiceover", label: "Voiceover", kind: "longtext" },
    { key: "captions", label: "Captions", kind: "list" },
    { key: "cta", label: "CTA", kind: "text" },
  ],
  carousel: [
    { key: "slideTitles", label: "Slide titles", kind: "list" },
    { key: "slideContent", label: "Slide content", kind: "list" },
    { key: "imagePrompts", label: "Image prompts", kind: "list" },
    { key: "cta", label: "CTA", kind: "text" },
    { key: "caption", label: "Caption", kind: "longtext" },
    { key: "hashtags", label: "Hashtags", kind: "list" },
  ],
  image: [
    { key: "positivePrompt", label: "Positive prompt", kind: "longtext" },
    { key: "negativePrompt", label: "Negative prompt", kind: "longtext" },
    { key: "composition", label: "Composition", kind: "text" },
    { key: "camera", label: "Camera", kind: "text" },
    { key: "lighting", label: "Lighting", kind: "text" },
    { key: "colors", label: "Colors", kind: "text" },
  ],
  thumbnail: [
    { key: "prompt", label: "Prompt", kind: "longtext" },
    { key: "negativePrompt", label: "Negative prompt", kind: "longtext" },
    { key: "textOverlay", label: "Text overlay", kind: "text" },
    { key: "composition", label: "Composition", kind: "text" },
    { key: "ctrSuggestions", label: "CTR suggestions", kind: "list" },
  ],
  linkedin: [
    { key: "hook", label: "Hook", kind: "text" },
    { key: "story", label: "Story", kind: "longtext" },
    { key: "cta", label: "CTA", kind: "text" },
    { key: "firstComment", label: "First comment", kind: "longtext" },
    { key: "hashtags", label: "Hashtags", kind: "list" },
  ],
  caption: [
    { key: "captions", label: "Caption variants", kind: "list" },
    { key: "hooks", label: "Hooks", kind: "list" },
    { key: "ctas", label: "CTAs", kind: "list" },
    { key: "hashtags", label: "Hashtags", kind: "list" },
  ],
};

function coerceValue(kind: PlanSection["kind"], raw: unknown): string | string[] {
  if (kind === "list") {
    if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
    if (typeof raw === "string" && raw.trim()) return raw.split(/\r?\n|,\s*/).filter(Boolean);
    return [];
  }
  if (Array.isArray(raw)) return raw.join("\n");
  return raw == null ? "" : String(raw);
}

export const planContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { module: PlanModule; topic: string; context?: string; projectId?: string | null }) => {
    if (!i.module) throw new Error("module required");
    if (!i.topic?.trim()) throw new Error("topic required");
    return i;
  })
  .handler(async ({ data, context }) => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const schema = SCHEMAS[data.module];
    const keys = schema.map((s) => `- ${s.key} (${s.kind}): ${s.label}`).join("\n");
    const raw = await gatewayChatJson<Record<string, unknown>>({
      messages: [
        {
          role: "system",
          content:
            "You are an elite content strategist. Return ONLY valid JSON matching the requested keys. For 'list' kinds use string arrays; for 'text'/'longtext' use strings. No commentary.",
        },
        {
          role: "user",
          content: `Module: ${data.module}\nTopic: ${data.topic}\n${data.context ? `Context: ${data.context}\n` : ""}\nReturn a JSON object with exactly these keys:\n${keys}`,
        },
      ],
      temperature: 0.8,
      maxTokens: 3000,
    });

    const sections: PlanSection[] = schema.map((s) => ({
      key: s.key,
      label: s.label,
      kind: s.kind,
      value: coerceValue(s.kind, raw?.[s.key]),
    }));
    const plan: ContentPlan = { module: data.module, topic: data.topic, sections };

    if (data.projectId) {
      await context.supabase.from("project_memory" as never).insert({
        user_id: context.userId,
        project_id: data.projectId,
        kind: `wizard:${data.module}:plan`,
        payload: { originalPrompt: data.topic, aiPlan: plan },
      } as never);
    }
    return plan;
  });

export const regeneratePlanSectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    module: PlanModule;
    topic: string;
    sectionKey: string;
    instruction?: string;
    currentValue?: string | string[];
  }) => {
    if (!i.module || !i.sectionKey) throw new Error("module and sectionKey required");
    return i;
  })
  .handler(async ({ data }) => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const schema = SCHEMAS[data.module];
    const section = schema.find((s) => s.key === data.sectionKey);
    if (!section) throw new Error(`Unknown section: ${data.sectionKey}`);

    const raw = await gatewayChatJson<Record<string, unknown>>({
      messages: [
        {
          role: "system",
          content:
            "You rewrite one section of a content plan. Return ONLY valid JSON with a single key matching the requested section.",
        },
        {
          role: "user",
          content: `Module: ${data.module}\nTopic: ${data.topic}\nSection: ${section.key} (${section.kind}) — ${section.label}\nInstruction: ${data.instruction ?? "Improve and rewrite"}\nCurrent value: ${JSON.stringify(data.currentValue ?? "")}\nReturn: { "${section.key}": <${section.kind === "list" ? "string[]" : "string"}> }`,
        },
      ],
      temperature: 0.85,
      maxTokens: 1500,
    });
    return { key: section.key, value: coerceValue(section.kind, raw?.[section.key]) };
  });
