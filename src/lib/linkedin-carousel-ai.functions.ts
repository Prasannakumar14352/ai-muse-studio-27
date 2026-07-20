// LinkedIn document carousel AI generator (cover, N content slides, CTA).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeMiddleware } from "@/lib/credits-guard.server";
import { z } from "zod";

export type LinkedinCarouselSlide = {
  id: string;
  kind: "cover" | "content" | "cta";
  eyebrow?: string;
  title: string;
  body?: string;
  bullets?: string[];
  footer?: string;
  notes?: string;
};

export type LinkedinCarouselContent = {
  slides: LinkedinCarouselSlide[];
  design: { palette: string[]; theme: "light" | "dark" };
  hashtags?: string[];
};

const Input = z.object({
  topic: z.string().min(1),
  audience: z.string().default(""),
  tone: z.string().default("Professional"),
  body: z.string().default(""),
  slide_count: z.number().int().min(4).max(12).default(8),
  brand: z.string().default(""),
  cta: z.string().default(""),
  theme: z.enum(["light", "dark"]).default("dark"),
});

function slug() {
  return Math.random().toString(36).slice(2, 9);
}

function demo(v: z.infer<typeof Input>): LinkedinCarouselContent {
  const contentSlides = Math.max(2, v.slide_count - 2);
  const slides: LinkedinCarouselSlide[] = [
    { id: slug(), kind: "cover", eyebrow: v.brand || "Insight", title: v.topic, body: `A practical breakdown for ${v.audience || "operators"}.`, footer: "Swipe →" },
    ...Array.from({ length: contentSlides }, (_, i) => ({
      id: slug(),
      kind: "content" as const,
      eyebrow: `${String(i + 1).padStart(2, "0")} / ${String(contentSlides).padStart(2, "0")}`,
      title: `Point ${i + 1} about ${v.topic}`,
      bullets: ["Frame the outcome first", "Cut the step that doesn't move the metric", "Ship a smaller version"],
    })),
    { id: slug(), kind: "cta", title: v.cta || "Save this for later.", body: "Follow for weekly plays like this.", footer: v.brand || "" },
  ];
  return { slides, design: { palette: ["#0A66C2", "#F3F6F8", "#111827"], theme: v.theme } };
}

export const generateLinkedinCarousel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("linkedin_carousel")])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<{ mode: "ai" | "demo"; content: LinkedinCarouselContent; safeError?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { mode: "demo", content: demo(data) };

    const sys = `You design LinkedIn document carousels ("PDF carousels") that get saves and shares.
Every carousel has a strong cover, high-density content slides, and a CTA closer.
Rules:
- Slide titles are punchy, 3-8 words. No fluff.
- Content slides: 2-4 short bullets OR a short body under 40 words. Never both long.
- No emojis except zero-to-one on the cover/CTA.
- No fabricated stats. Concrete, useful, opinionated.`;

    const user = `Design a ${data.slide_count}-slide LinkedIn document carousel.

Topic: ${data.topic}
Audience: ${data.audience || "professionals"}
Tone: ${data.tone}
Brand: ${data.brand || "-"}
Preferred CTA: ${data.cta || "-"}
Theme: ${data.theme}
Source post (use as the source of truth for ideas):
"""
${data.body || "(none)"}
"""

Return JSON EXACTLY:
{
  "slides": [
    { "kind": "cover", "eyebrow": "short brand or category tag", "title": "hook title 3-8 words", "body": "one-line subhook under 90 chars", "footer": "Swipe →" },
    ... ${Math.max(2, data.slide_count - 2)} content slides:
    { "kind": "content", "eyebrow": "01 / N", "title": "point title", "bullets": ["...","..."], "body": "optional short body" }
    ,
    { "kind": "cta", "title": "clear CTA line", "body": "one line reinforcing follow/save", "footer": "brand handle" }
  ],
  "design": { "palette": ["#hex","#hex","#hex"], "theme": "${data.theme}" },
  "hashtags": ["5-8 relevant hashtags without # symbol"]
}`;

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
      if (!upstream.ok) return { mode: "demo", content: demo(data), safeError: "AI busy — showing draft carousel." };
      const j = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = j.choices?.[0]?.message?.content ?? "";
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch {
        const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null;
      }
      const Slide = z.object({
        kind: z.enum(["cover", "content", "cta"]),
        eyebrow: z.string().optional().default(""),
        title: z.string().default(""),
        body: z.string().optional().default(""),
        bullets: z.array(z.string()).optional().default([]),
        footer: z.string().optional().default(""),
      });
      const Schema = z.object({
        slides: z.array(Slide).min(3),
        design: z.object({
          palette: z.array(z.string()).default(["#0A66C2", "#F3F6F8", "#111827"]),
          theme: z.enum(["light", "dark"]).default(data.theme),
        }).default({ palette: ["#0A66C2", "#F3F6F8", "#111827"], theme: data.theme }),
        hashtags: z.array(z.string()).optional().default([]),
      });
      const p = Schema.safeParse(parsed);
      if (!p.success) return { mode: "demo", content: demo(data), safeError: "Draft shown while AI is warming up." };
      const slides: LinkedinCarouselSlide[] = p.data.slides.map((s) => ({ id: slug(), ...s }));
      return { mode: "ai", content: { slides, design: p.data.design, hashtags: p.data.hashtags } };
    } catch {
      return { mode: "demo", content: demo(data), safeError: "AI temporarily unavailable — draft shown." };
    }
  });

const TransformInput = z.object({
  action: z.enum(["rewrite", "expand", "shorten"]),
  title: z.string().default(""),
  body: z.string().default(""),
  bullets: z.array(z.string()).default([]),
  tone: z.string().default("Professional"),
  topic: z.string().default(""),
});

export type CarouselSlideTransform = {
  title: string;
  body: string;
  bullets: string[];
};

export const transformCarouselSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, chargeMiddleware("linkedin_carousel_slide")])
  .inputValidator((v: unknown) => TransformInput.parse(v))
  .handler(async ({ data }): Promise<{ mode: "ai" | "demo"; slide: CarouselSlideTransform; safeError?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    const fallback: CarouselSlideTransform = {
      title: data.title,
      body: data.body,
      bullets: data.bullets,
    };
    if (!key) return { mode: "demo", slide: fallback, safeError: "AI key missing." };
    const instruction =
      data.action === "rewrite" ? "Rewrite the slide with sharper phrasing. Keep length similar."
      : data.action === "expand" ? "Expand this slide: richer body (up to 60 words) and up to 5 punchy bullets."
      : "Shorten this slide: title 3-6 words, body under 20 words, max 2 bullets.";
    const sys = "You edit LinkedIn carousel slides. Return ONLY JSON: {\"title\":\"...\",\"body\":\"...\",\"bullets\":[\"...\"]}. No emojis, no fluff, no fabricated stats.";
    const user = `Topic: ${data.topic}\nTone: ${data.tone}\n${instruction}\n\nCurrent slide:\nTitle: ${data.title}\nBody: ${data.body}\nBullets: ${JSON.stringify(data.bullets)}`;
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
      if (!upstream.ok) return { mode: "demo", slide: fallback, safeError: "AI busy." };
      const j = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = j.choices?.[0]?.message?.content ?? "";
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch {
        const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null;
      }
      const S = z.object({
        title: z.string().default(data.title),
        body: z.string().default(data.body),
        bullets: z.array(z.string()).default(data.bullets),
      });
      const p = S.safeParse(parsed);
      if (!p.success) return { mode: "demo", slide: fallback, safeError: "AI response invalid." };
      return { mode: "ai", slide: p.data };
    } catch {
      return { mode: "demo", slide: fallback, safeError: "AI unavailable." };
    }
  });

