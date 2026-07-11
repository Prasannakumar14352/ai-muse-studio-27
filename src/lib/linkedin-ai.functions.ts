// LinkedIn Post AI generator.
// Uses Lovable AI Gateway with a demo fallback so the workflow never blocks.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LinkedinPostContent = {
  headlines: string[];      // 10
  hooks: string[];          // 5
  recommended_hook: string;
  body: string;             // full LinkedIn post
  alternate_body: string;
  cta: string;
  hashtags: string[];
  keywords: string[];
  first_comment: string;
  engagement_strategy: string;
  image_concept: string;
  image_prompt: string;
  carousel_concept: string;
  accessibility_alt: string;
};

const Input = z.object({
  topic: z.string().min(1),
  audience: z.string().default(""),
  industry: z.string().default(""),
  goal: z.string().default("Build authority"),
  tone: z.string().default("Professional"),
  post_type: z.string().default("Educational"),
  length: z.enum(["Short", "Medium", "Long", "Custom"]).default("Medium"),
  custom_length_words: z.number().int().optional(),
  brand: z.string().default(""),
  cta: z.string().default(""),
  language: z.string().default("English"),
  include_image: z.boolean().default(false),
  include_carousel: z.boolean().default(false),
  include_hashtags: z.boolean().default(true),
});

const LENGTH_TARGET: Record<string, string> = {
  Short: "80-150 words, 3-5 short paragraphs",
  Medium: "180-320 words, 5-8 short paragraphs",
  Long: "400-700 words, 8-14 short paragraphs",
};

function demo(input: z.infer<typeof Input>): LinkedinPostContent {
  const t = input.topic.trim();
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  const headlines = [
    `What most people get wrong about ${t}`,
    `The 3-step ${t} framework I wish I knew earlier`,
    `${cap}: a practical guide for ${input.audience || "operators"}`,
    `Why ${t} is quietly reshaping ${input.industry || "our industry"}`,
    `A simple mental model for ${t}`,
    `Stop doing ${t} the old way`,
    `The uncomfortable truth about ${t}`,
    `${cap} — lessons from the last 12 months`,
    `Read this before your next ${t} decision`,
    `The one ${t} habit that changed everything`,
  ];
  const hooks = [
    `I used to overthink ${t}. Here's what actually worked.`,
    `Most advice about ${t} is wrong. Let me show you why.`,
    `A short note on ${t} — from someone who's shipped this a lot.`,
    `${cap} is simpler than the internet makes it look.`,
    `If you're stuck on ${t}, read this once.`,
  ];
  const body = [
    hooks[0],
    "",
    `The problem isn't effort. It's the frame.`,
    "",
    `Here's a cleaner way to think about ${t}:`,
    `1. Define the outcome before the tactic.`,
    `2. Cut the step that doesn't move the metric.`,
    `3. Ship a smaller version this week.`,
    "",
    `That's it. No secret hack. Just fewer moving parts.`,
    "",
    input.cta || "Curious what your version of this looks like.",
  ].join("\n");
  const alt = [
    `Short take on ${t}:`,
    "",
    `Most teams add complexity when they should be removing it.`,
    `Pick the one lever that changes the outcome. Ship it small. Learn. Repeat.`,
    "",
    input.cta || "What's the one lever you'd cut this week?",
  ].join("\n");
  const hashtags = input.include_hashtags
    ? [t, input.industry || "leadership", input.audience || "growth", "linkedin", "career"]
        .filter(Boolean)
        .map((s) => "#" + String(s).replace(/[^a-zA-Z0-9]/g, ""))
        .filter((s) => s.length > 1)
    : [];
  return {
    headlines,
    hooks,
    recommended_hook: hooks[0],
    body,
    alternate_body: alt,
    cta: input.cta || "What would you add?",
    hashtags,
    keywords: [t, input.industry, input.audience].filter(Boolean),
    first_comment: `PS — if this was useful, save it. I'll share the follow-up on ${t} next week.`,
    engagement_strategy:
      "Reply to every comment in the first 90 minutes. Ask one clarifying question back. Pin the first insightful comment. Don't add links to the body — put them in the first comment.",
    image_concept: `Minimal editorial visual representing ${t} for a professional feed.`,
    image_prompt: `Editorial LinkedIn hero image, clean composition, generous negative space at top for headline, muted brand palette, subject related to ${t}, soft studio lighting, high detail, no text.`,
    carousel_concept: `6-slide LinkedIn document: 1) Hook cover, 2-4) Three practical points about ${t}, 5) Mini case, 6) CTA slide.`,
    accessibility_alt: `A clean editorial visual related to ${t}, designed for a LinkedIn feed post.`,
  };
}

export const generateLinkedinPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<{ mode: "ai" | "demo"; content: LinkedinPostContent; safeError?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { mode: "demo", content: demo(data) };

    const lengthHint =
      data.length === "Custom" && data.custom_length_words
        ? `${data.custom_length_words} words, short paragraphs`
        : LENGTH_TARGET[data.length] ?? LENGTH_TARGET.Medium;

    const sys = `You are a senior LinkedIn ghostwriter for founders and operators.
You write posts that sound like a real human, not marketing copy.
Rules:
- Strong first line. No "In today's fast-paced world".
- Short paragraphs (1-3 lines). Natural whitespace between them.
- No robotic phrasing. No fabricated statistics. No fake personal stories.
- No excessive emojis. Zero to two, only if they help scanning.
- No unnecessary hashtags in the body — hashtags go in the dedicated field.
- Do not invent quotes, numbers, or credentials.
- Keep it useful: one clear idea, applied.`;

    const user = `Write a LinkedIn ${data.post_type} post.

Topic: ${data.topic}
Target audience: ${data.audience || "professionals"}
Industry: ${data.industry || "general"}
Goal: ${data.goal}
Tone: ${data.tone}
Length: ${lengthHint}
Brand (optional): ${data.brand || "-"}
Preferred CTA (optional): ${data.cta || "-"}
Language: ${data.language}

Return JSON EXACTLY:
{
  "headlines": [10 short headline options, 60-90 chars each],
  "hooks": [5 opening-line options, each punchy, under 140 chars],
  "recommended_hook": "the single strongest hook from the list",
  "body": "the full LinkedIn post, ready to publish. Use \\n\\n between paragraphs.",
  "alternate_body": "a shorter or differently-framed alternate version",
  "cta": "one clean call-to-action line",
  "hashtags": [${data.include_hashtags ? "5-8 relevant hashtags, no # symbol" : "empty array"}],
  "keywords": [5-8 SEO/topic keywords],
  "first_comment": "an on-brand first-comment to boost reach (can include a link placeholder)",
  "engagement_strategy": "3-5 concrete actions to maximize reach in the first 2 hours",
  "image_concept": "one-line concept for a LinkedIn hero image",
  "image_prompt": "rich image prompt with composition, lighting, negative-space guidance (no text in image)",
  "carousel_concept": "outline of a 6-8 slide LinkedIn document carousel on this topic",
  "accessibility_alt": "concise alt text for the hero image"
}`;

    try {
      const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!upstream.ok) {
        return { mode: "demo", content: demo(data), safeError: "Generation is temporarily busy — showing draft content." };
      }
      const j = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = j.choices?.[0]?.message?.content ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const m = raw.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : null;
      }
      const Schema = z.object({
        headlines: z.array(z.string()).default([]),
        hooks: z.array(z.string()).default([]),
        recommended_hook: z.string().default(""),
        body: z.string().default(""),
        alternate_body: z.string().default(""),
        cta: z.string().default(""),
        hashtags: z.array(z.string()).default([]),
        keywords: z.array(z.string()).default([]),
        first_comment: z.string().default(""),
        engagement_strategy: z.string().default(""),
        image_concept: z.string().default(""),
        image_prompt: z.string().default(""),
        carousel_concept: z.string().default(""),
        accessibility_alt: z.string().default(""),
      });
      const p = Schema.safeParse(parsed);
      if (!p.success || !p.data.body) {
        return { mode: "demo", content: demo(data), safeError: "Draft content shown while AI is warming up." };
      }
      const content: LinkedinPostContent = {
        ...p.data,
        hashtags: p.data.hashtags
          .map((h) => (h.startsWith("#") ? h : "#" + h.replace(/^\s+|\s+$/g, "")))
          .filter((h) => h.length > 1),
        recommended_hook: p.data.recommended_hook || p.data.hooks[0] || "",
      };
      return { mode: "ai", content };
    } catch {
      return { mode: "demo", content: demo(data), safeError: "Generation is temporarily unavailable — showing draft content." };
    }
  });
