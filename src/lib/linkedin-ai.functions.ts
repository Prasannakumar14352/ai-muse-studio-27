// LinkedIn Content Studio — AI generation, regeneration, and scoring.
// Uses the Lovable AI Gateway with a demo fallback so the workflow never blocks.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Types ----------

export type LinkedinVariation = {
  id: string;
  label: string;                 // "Short" | "Medium" | "Long" | "Story" | "Educational" | "Viral"
  body: string;
  char_count: number;
  reading_time_sec: number;
};

export type LinkedinScoreCard = {
  engagement: number;
  readability: number;
  professional_tone: number;
  virality: number;
  storytelling: number;
  cta_strength: number;
  overall: number;
};

export type LinkedinPostContent = {
  // Backward-compat fields (still consumed by existing routes)
  headlines: string[];
  hooks: string[];
  recommended_hook: string;
  body: string;
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
  // New Studio fields
  post_type_suggested?: string;   // when caller sent post_type = "auto"
  variations?: LinkedinVariation[];
  hashtag_mix?: { trending: string[]; niche: string[]; broad: string[] };
  ctas?: string[];
  image_prompts?: string[];       // 3-5 image concepts
  carousel_outline?: {            // for the LinkedIn document carousel
    cover: string;
    slides: { title: string; body: string }[];
    cta: string;
  };
  scores?: LinkedinScoreCard;
  improvements?: string[];
};

// ---------- Post types / styles ----------

export const POST_TYPES = [
  "auto",
  "Personal Story", "Thought Leadership", "Educational", "Industry Insights",
  "Case Study", "Success Story", "Product Launch", "Company Update",
  "Behind the Scenes", "Founder Journey", "Career Advice", "Hiring Post",
  "Event Promotion", "Poll", "Question Post", "List Post",
  "Myth vs Fact", "Before & After", "Customer Testimonial", "AI Recommendation",
] as const;

export const WRITING_STYLES = [
  "Professional", "Friendly", "Corporate", "Inspirational", "Storytelling",
  "Educational", "Sales", "Founder", "Technical", "Executive", "Startup", "Minimal",
] as const;

export const EMOJI_LEVELS = ["none", "minimal", "moderate", "high"] as const;
export const CTA_TYPES = [
  "auto", "Comment", "Share", "Follow", "Visit website",
  "Download", "Book a call", "Subscribe", "Send a message",
] as const;

// ---------- Inputs ----------

const Input = z.object({
  topic: z.string().min(1),
  audience: z.string().default(""),
  industry: z.string().default(""),
  goal: z.string().default("Build authority"),
  tone: z.string().default("Professional"),
  writing_style: z.enum(WRITING_STYLES).default("Professional"),
  post_type: z.string().default("auto"),
  length: z.enum(["Short", "Medium", "Long", "Custom"]).default("Medium"),
  custom_length_words: z.number().int().optional(),
  brand: z.string().default(""),
  brand_voice: z.string().default(""),    // free-form brand voice description
  cta: z.string().default(""),
  cta_type: z.string().default("auto"),
  language: z.string().default("English"),
  emoji_level: z.enum(EMOJI_LEVELS).default("minimal"),
  variation_count: z.number().int().min(1).max(6).default(3),
  hashtag_count: z.number().int().min(0).max(15).default(6),
  include_image: z.boolean().default(false),
  include_carousel: z.boolean().default(false),
  include_hashtags: z.boolean().default(true),
  input_source: z.enum(["topic", "url", "youtube", "article", "pdf_text", "image_desc", "existing"]).default("topic"),
  source_text: z.string().default(""),    // pasted URL / article body / PDF text / existing post
  use_strategy_context: z.boolean().default(false),
});

const LENGTH_TARGET: Record<string, string> = {
  Short: "80-150 words, 3-5 short paragraphs",
  Medium: "180-320 words, 5-8 short paragraphs",
  Long: "400-700 words, 8-14 short paragraphs",
};

// ---------- Demo fallback ----------

function slug() {
  return Math.random().toString(36).slice(2, 9);
}

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
    `Nobody talks about this side of ${t}.`,
    `Here's what changed everything for me with ${t}.`,
    `The biggest lesson I learned about ${t}.`,
    `Most teams are making this mistake with ${t}.`,
    `I learned this the hard way — ${t}.`,
  ];
  const body = [
    hooks[0], "",
    `The problem isn't effort. It's the frame.`, "",
    `Here's a cleaner way to think about ${t}:`,
    `1. Define the outcome before the tactic.`,
    `2. Cut the step that doesn't move the metric.`,
    `3. Ship a smaller version this week.`, "",
    `That's it. No secret hack. Just fewer moving parts.`, "",
    input.cta || "Curious what your version of this looks like.",
  ].join("\n");
  const alt = [
    `Short take on ${t}:`, "",
    `Most teams add complexity when they should be removing it.`,
    `Pick the one lever that changes the outcome. Ship it small. Learn. Repeat.`, "",
    input.cta || "What's the one lever you'd cut this week?",
  ].join("\n");
  const hashtagsFlat = input.include_hashtags
    ? [t, input.industry || "leadership", input.audience || "growth", "linkedin", "career"]
        .filter(Boolean)
        .map((s) => "#" + String(s).replace(/[^a-zA-Z0-9]/g, ""))
        .filter((s) => s.length > 1)
    : [];
  const short = alt;
  const long = body + "\n\nPS — save this. I'll post the follow-up next week.";
  const variations: LinkedinVariation[] = [
    mkVariation("Short", short),
    mkVariation("Medium", body),
    mkVariation("Long", long),
    mkVariation("Story", `Two years ago I ignored ${t}. It cost us six months.\n\nHere's what I do now — and why it works.\n\n${body}`),
    mkVariation("Educational", `A short lesson on ${t}:\n\n${body}`),
    mkVariation("Viral", `${hooks[3]}\n\n${body}`),
  ].slice(0, input.variation_count);
  return {
    headlines,
    hooks,
    recommended_hook: hooks[0],
    body, alternate_body: alt,
    cta: input.cta || "What would you add?",
    hashtags: hashtagsFlat,
    keywords: [t, input.industry, input.audience].filter(Boolean),
    first_comment: `PS — if this was useful, save it. I'll share the follow-up on ${t} next week.`,
    engagement_strategy:
      "Reply to every comment in the first 90 minutes. Ask one clarifying question back. Pin the first insightful comment. Put links in the first comment, not the body.",
    image_concept: `Minimal editorial visual representing ${t} for a professional feed.`,
    image_prompt: `Editorial LinkedIn hero image, clean composition, generous negative space at top for headline, muted brand palette, subject related to ${t}, soft studio lighting, high detail, no text.`,
    carousel_concept: `6-slide LinkedIn document: 1) Hook cover, 2-4) Three practical points about ${t}, 5) Mini case, 6) CTA slide.`,
    accessibility_alt: `A clean editorial visual related to ${t}, designed for a LinkedIn feed post.`,
    post_type_suggested: input.post_type === "auto" ? "Educational" : input.post_type,
    variations,
    hashtag_mix: input.include_hashtags ? {
      trending: ["#linkedin", "#growth", "#leadership"],
      niche: [`#${(input.industry || t).replace(/[^a-zA-Z0-9]/g, "")}`],
      broad: ["#career", "#business", "#learning"],
    } : { trending: [], niche: [], broad: [] },
    ctas: [
      input.cta || "What would you add?",
      "Save this for later.",
      "DM me the word 'template' to get the checklist.",
      "Comment 'yes' if this resonates.",
    ],
    image_prompts: [
      `Editorial hero image about ${t}, clean composition, negative space.`,
      `Isometric 3D illustration representing ${t}, muted palette.`,
      `Flat-design infographic hero for ${t}, sharp typography-safe area.`,
    ],
    carousel_outline: {
      cover: `${cap}: a practical breakdown`,
      slides: [
        { title: "The problem", body: `Most teams overthink ${t}.` },
        { title: "The frame", body: "Outcome first. Tactic second." },
        { title: "The 3 steps", body: "Define. Cut. Ship." },
        { title: "A mini case", body: "One example, one number." },
        { title: "What to do this week", body: "Pick one lever. Ship small." },
      ],
      cta: input.cta || "Save this. Follow for weekly plays.",
    },
    scores: {
      engagement: 72, readability: 80, professional_tone: 82,
      virality: 65, storytelling: 68, cta_strength: 70, overall: 73,
    },
    improvements: [
      "Punch up the first line — the hook decides scroll-stop.",
      "Add a specific number or timeframe for credibility.",
      "Split any paragraph over 3 lines for mobile scannability.",
    ],
  };
}

function mkVariation(label: string, body: string): LinkedinVariation {
  return {
    id: slug(),
    label,
    body,
    char_count: body.length,
    reading_time_sec: Math.max(15, Math.round(body.split(/\s+/).length / 3.5)),
  };
}

// ---------- Prompt helpers ----------

function systemPrompt(v: z.infer<typeof Input>) {
  const strategyLine = v.use_strategy_context
    ? "You may use ambient project strategy context if it directly helps this topic."
    : "IGNORE any ambient project or strategy context. Focus ONLY on the exact topic and source the user provided.";
  return `You are a senior LinkedIn ghostwriter for founders, operators, and marketers.
You write posts that sound like a real human, not marketing copy.
${strategyLine}
Rules:
- Strong first line. No "In today's fast-paced world".
- Short paragraphs (1-3 lines). Natural whitespace between them.
- No robotic phrasing. No fabricated statistics. No fake personal stories.
- Emoji usage: ${v.emoji_level}. "none" = zero emojis. "minimal" = 0-2 if they help scanning.
- No hashtags in the body — hashtags go in the dedicated field.
- Do not invent quotes, numbers, or credentials.
- Keep it useful: one clear idea, applied.`;
}

function userPrompt(v: z.infer<typeof Input>) {
  const lengthHint = v.length === "Custom" && v.custom_length_words
    ? `${v.custom_length_words} words, short paragraphs`
    : LENGTH_TARGET[v.length] ?? LENGTH_TARGET.Medium;

  const sourceHint =
    v.input_source === "topic" || !v.source_text
      ? ""
      : `\nSource (${v.input_source}):\n"""\n${v.source_text.slice(0, 4000)}\n"""\nExtract only what is directly relevant to the topic above; do not fabricate details not present in the source.`;

  const variationLabels =
    v.variation_count <= 1 ? ["Recommended"] :
    v.variation_count === 2 ? ["Short", "Medium"] :
    v.variation_count === 3 ? ["Short", "Medium", "Long"] :
    v.variation_count === 4 ? ["Short", "Medium", "Long", "Story"] :
    v.variation_count === 5 ? ["Short", "Medium", "Long", "Story", "Educational"] :
                              ["Short", "Medium", "Long", "Story", "Educational", "Viral"];

  return `Write a LinkedIn ${v.post_type === "auto" ? "(choose best format)" : v.post_type} post.

Topic: ${v.topic}
Target audience: ${v.audience || "professionals"}
Industry: ${v.industry || "general"}
Goal: ${v.goal}
Tone: ${v.tone}
Writing style: ${v.writing_style}
Length: ${lengthHint}
Brand (optional): ${v.brand || "-"}
Brand voice (optional): ${v.brand_voice || "-"}
Preferred CTA (optional): ${v.cta || "-"}
CTA type: ${v.cta_type}
Language: ${v.language}
${sourceHint}

Return JSON EXACTLY:
{
  "post_type_suggested": "if input post_type was 'auto', the format you chose; otherwise repeat it",
  "headlines": [10 short headline options, 60-90 chars each],
  "hooks": [10 opening-line options, each punchy, under 140 chars],
  "recommended_hook": "the single strongest hook from the list",
  "body": "the primary post, ready to publish. Use \\n\\n between paragraphs.",
  "alternate_body": "a shorter or differently-framed alternate version",
  "variations": [
    ${variationLabels.map((l) => `{ "label": "${l}", "body": "full post text ready to publish for this variation" }`).join(",\n    ")}
  ],
  "cta": "one clean call-to-action line",
  "ctas": [4-6 alternative CTA lines aligned to cta_type when not 'auto'],
  "hashtags": [${v.include_hashtags ? `${v.hashtag_count} relevant hashtags with # symbol` : "empty array"}],
  "hashtag_mix": {
    "trending": [broad platform-wide tags],
    "niche": [tight topical tags],
    "broad": [category tags]
  },
  "keywords": [5-8 SEO/topic keywords],
  "first_comment": "on-brand first-comment to boost reach (can include a link placeholder)",
  "engagement_strategy": "3-5 concrete actions to maximize reach in the first 2 hours",
  "image_concept": "one-line concept for a LinkedIn hero image",
  "image_prompt": "rich image prompt (composition, lighting, negative-space, no text in image)",
  "image_prompts": [3-5 alternative image prompts spanning: professional photography, 3D illustration, flat design, isometric, infographic],
  "carousel_concept": "outline of a 6-8 slide LinkedIn document carousel on this topic",
  "carousel_outline": {
    "cover": "cover slide title",
    "slides": [{ "title": "slide title", "body": "1-2 line supporting text" }],
    "cta": "final CTA slide line"
  },
  "accessibility_alt": "concise alt text for the hero image",
  "scores": {
    "engagement": 0-100, "readability": 0-100, "professional_tone": 0-100,
    "virality": 0-100, "storytelling": 0-100, "cta_strength": 0-100, "overall": 0-100
  },
  "improvements": [3-6 short, actionable one-line suggestions]
}`;
}

// ---------- Zod output schema (all optional-with-defaults for resilience) ----------

const Variation = z.object({
  label: z.string().default("Medium"),
  body: z.string().default(""),
});

const HashtagMix = z.object({
  trending: z.array(z.string()).default([]),
  niche: z.array(z.string()).default([]),
  broad: z.array(z.string()).default([]),
});

const CarouselOutline = z.object({
  cover: z.string().default(""),
  slides: z.array(z.object({ title: z.string().default(""), body: z.string().default("") })).default([]),
  cta: z.string().default(""),
});

const Scores = z.object({
  engagement: z.number().default(70),
  readability: z.number().default(70),
  professional_tone: z.number().default(70),
  virality: z.number().default(60),
  storytelling: z.number().default(65),
  cta_strength: z.number().default(70),
  overall: z.number().default(70),
});

const OutSchema = z.object({
  post_type_suggested: z.string().optional().default(""),
  headlines: z.array(z.string()).default([]),
  hooks: z.array(z.string()).default([]),
  recommended_hook: z.string().default(""),
  body: z.string().default(""),
  alternate_body: z.string().default(""),
  variations: z.array(Variation).default([]),
  cta: z.string().default(""),
  ctas: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  hashtag_mix: HashtagMix.default({ trending: [], niche: [], broad: [] }),
  keywords: z.array(z.string()).default([]),
  first_comment: z.string().default(""),
  engagement_strategy: z.string().default(""),
  image_concept: z.string().default(""),
  image_prompt: z.string().default(""),
  image_prompts: z.array(z.string()).default([]),
  carousel_concept: z.string().default(""),
  carousel_outline: CarouselOutline.default({ cover: "", slides: [], cta: "" }),
  accessibility_alt: z.string().default(""),
  scores: Scores.default({
    engagement: 70, readability: 70, professional_tone: 70,
    virality: 60, storytelling: 65, cta_strength: 70, overall: 70,
  }),
  improvements: z.array(z.string()).default([]),
});

async function callGateway(sys: string, user: string, key: string): Promise<unknown | null> {
  try {
    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (!upstream.ok) return null;
    const j = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = j.choices?.[0]?.message?.content ?? "";
    try { return JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : null;
    }
  } catch {
    return null;
  }
}

// ---------- Primary generator ----------

export const generateLinkedinPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<{ mode: "ai" | "demo"; content: LinkedinPostContent; safeError?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { mode: "demo", content: demo(data) };

    const parsed = await callGateway(systemPrompt(data), userPrompt(data), key);
    if (!parsed) return { mode: "demo", content: demo(data), safeError: "Generation is temporarily busy — showing draft content." };
    const p = OutSchema.safeParse(parsed);
    if (!p.success || !p.data.body) return { mode: "demo", content: demo(data), safeError: "Draft content shown while AI is warming up." };

    const variations: LinkedinVariation[] = (p.data.variations.length ? p.data.variations : [{ label: "Medium", body: p.data.body }])
      .map((v) => mkVariation(v.label || "Medium", v.body || ""));

    const hashtags = p.data.hashtags
      .map((h) => (h.startsWith("#") ? h : "#" + h.replace(/^\s+|\s+$/g, "")))
      .filter((h) => h.length > 1);

    const content: LinkedinPostContent = {
      ...p.data,
      hashtags,
      recommended_hook: p.data.recommended_hook || p.data.hooks[0] || "",
      variations,
    };
    return { mode: "ai", content };
  });

// ---------- Section regeneration ----------

const RegenSection = z.enum(["hook", "cta", "hashtags", "body", "conclusion", "first_comment"]);

const RegenInput = z.object({
  section: RegenSection,
  topic: z.string().default(""),
  audience: z.string().default(""),
  tone: z.string().default("Professional"),
  writing_style: z.string().default("Professional"),
  post_type: z.string().default("Educational"),
  emoji_level: z.enum(EMOJI_LEVELS).default("minimal"),
  current_body: z.string().default(""),      // context for regen (never included in output unless body regen)
  cta_type: z.string().default("auto"),
  hashtag_count: z.number().int().min(0).max(15).default(6),
  variation_index: z.number().int().optional(),
  brand_voice: z.string().default(""),
});

export type LinkedinRegenResult = {
  hook?: string;
  hooks?: string[];
  cta?: string;
  ctas?: string[];
  hashtags?: string[];
  hashtag_mix?: { trending: string[]; niche: string[]; broad: string[] };
  body?: string;
  conclusion?: string;
  first_comment?: string;
};

export const regenerateLinkedinSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RegenInput.parse(v))
  .handler(async ({ data }): Promise<{ mode: "ai" | "demo"; result: LinkedinRegenResult; safeError?: string }> => {
    const key = process.env.LOVABLE_API_KEY;

    const fallback: LinkedinRegenResult = (() => {
      const t = data.topic || "your topic";
      if (data.section === "hook") return {
        hooks: [
          `Nobody talks about this side of ${t}.`,
          `I learned this the hard way about ${t}.`,
          `Most people are wrong about ${t}. Here's why.`,
          `A quick note on ${t} — from someone who's shipped this.`,
          `The uncomfortable truth about ${t}.`,
        ],
        hook: `Nobody talks about this side of ${t}.`,
      };
      if (data.section === "cta") return {
        ctas: ["Save this for later.", "Follow for weekly plays.", "DM me 'template' for the checklist.", "Comment 'yes' if this resonates."],
        cta: "Save this for later.",
      };
      if (data.section === "hashtags") return {
        hashtags: [t, "linkedin", "growth", "leadership"].map((s) => "#" + s.replace(/[^a-zA-Z0-9]/g, "")).filter(Boolean).slice(0, data.hashtag_count),
        hashtag_mix: {
          trending: ["#linkedin", "#growth"],
          niche: [`#${t.replace(/[^a-zA-Z0-9]/g, "")}`],
          broad: ["#career", "#business"],
        },
      };
      if (data.section === "conclusion") return { conclusion: "Pick one lever this week. Ship it small. Learn." };
      if (data.section === "first_comment") return { first_comment: `PS — if this was useful, save it. Follow-up on ${t} coming next week.` };
      // body
      return { body: `${data.current_body || `Short take on ${t}. Fewer moving parts wins.`}` };
    })();

    if (!key) return { mode: "demo", result: fallback };

    const sys = `You edit LinkedIn posts. Return ONLY minified JSON with the requested field(s). Emoji usage: ${data.emoji_level}. No fabricated stats. No hashtags in body text.`;

    const asks: Record<z.infer<typeof RegenSection>, string> = {
      hook: `Return {"hooks":[10 punchy opening lines under 140 chars],"hook":"the strongest single hook"}`,
      cta: `Return {"ctas":[6 concise CTA lines aligned to CTA type "${data.cta_type}"],"cta":"the strongest single CTA"}`,
      hashtags: `Return {"hashtags":[${data.hashtag_count} LinkedIn hashtags with #], "hashtag_mix":{"trending":[...],"niche":[...],"broad":[...]}}`,
      body: `Rewrite the body only. Return {"body":"the full replacement body, ready to publish"}`,
      conclusion: `Return {"conclusion":"replacement last paragraph, 1-3 lines"}`,
      first_comment: `Return {"first_comment":"replacement first-comment"}`,
    };

    const user = `Topic: ${data.topic}
Audience: ${data.audience || "professionals"}
Post type: ${data.post_type}
Writing style: ${data.writing_style}
Tone: ${data.tone}
Brand voice: ${data.brand_voice || "-"}
Current body (context, do not repeat unless regenerating body):
"""
${data.current_body.slice(0, 3000)}
"""

Task: ${asks[data.section]}`;

    const parsed = await callGateway(sys, user, key);
    if (!parsed || typeof parsed !== "object") return { mode: "demo", result: fallback, safeError: "AI busy — showing draft." };

    const p = z.object({
      hook: z.string().optional(),
      hooks: z.array(z.string()).optional(),
      cta: z.string().optional(),
      ctas: z.array(z.string()).optional(),
      hashtags: z.array(z.string()).optional(),
      hashtag_mix: HashtagMix.optional(),
      body: z.string().optional(),
      conclusion: z.string().optional(),
      first_comment: z.string().optional(),
    }).safeParse(parsed);
    if (!p.success) return { mode: "demo", result: fallback, safeError: "AI response invalid." };

    const out: LinkedinRegenResult = { ...p.data };
    if (out.hashtags) {
      out.hashtags = out.hashtags.map((h) => (h.startsWith("#") ? h : "#" + h.replace(/^\s+|\s+$/g, ""))).filter((h) => h.length > 1);
    }
    return { mode: "ai", result: out };
  });

// ---------- Scoring ----------

const ScoreInput = z.object({
  body: z.string().min(1),
  topic: z.string().default(""),
  audience: z.string().default(""),
  post_type: z.string().default("Educational"),
});

export const scoreLinkedinPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ScoreInput.parse(v))
  .handler(async ({ data }): Promise<{ mode: "ai" | "demo"; scores: LinkedinScoreCard; improvements: string[]; safeError?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    const fallback = {
      scores: {
        engagement: 72, readability: 78, professional_tone: 80,
        virality: 62, storytelling: 65, cta_strength: 70, overall: 72,
      },
      improvements: [
        "Sharpen the first line — the hook decides scroll-stop.",
        "Add a specific number or timeframe for credibility.",
        "Split paragraphs longer than 3 lines for mobile.",
      ],
    };
    if (!key) return { mode: "demo", ...fallback };

    const sys = "You audit LinkedIn posts. Score each dimension 0-100 based on evidence in the post. Return ONLY JSON.";
    const user = `Post type: ${data.post_type}
Audience: ${data.audience || "professionals"}
Topic: ${data.topic}

POST:
"""
${data.body.slice(0, 6000)}
"""

Return {
  "scores": {
    "engagement": 0-100, "readability": 0-100, "professional_tone": 0-100,
    "virality": 0-100, "storytelling": 0-100, "cta_strength": 0-100, "overall": 0-100
  },
  "improvements": [3-6 short, actionable one-line suggestions]
}`;

    const parsed = await callGateway(sys, user, key);
    if (!parsed) return { mode: "demo", ...fallback, safeError: "AI busy." };
    const p = z.object({ scores: Scores, improvements: z.array(z.string()).default([]) }).safeParse(parsed);
    if (!p.success) return { mode: "demo", ...fallback, safeError: "AI response invalid." };
    return { mode: "ai", scores: p.data.scores, improvements: p.data.improvements };
  });
