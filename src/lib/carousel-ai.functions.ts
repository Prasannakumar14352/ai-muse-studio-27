import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AiCarouselSlide = {
  n: number;
  role: string;              // "Cover" | "Point 1" | "CTA" etc
  label: string;             // "COVER" | "TRUTH #1" | "READY?"
  emoji?: string;
  headline: string;
  body: string;
  bullets: string[];
  bottom_highlight: string;
  visual: string;            // short layout description
  image_prompt: string;      // full rich prompt for image generation
};

export type AiCarousel = {
  title: string;
  slides: AiCarouselSlide[];
};

const Input = z.object({
  topic: z.string().min(1),
  tone: z.string(),
  platform: z.string(),
  styleLabel: z.string(),
  slideCount: z.number().int().min(3).max(10),
  aspectRatio: z.string(),
});

const SIZE_HINT: Record<string, string> = {
  "1:1": "1080x1080 square",
  "4:5": "1080x1350 vertical",
  "9:16": "1080x1920 vertical story",
  "16:9": "1920x1080 landscape",
};

export const generateAiCarousel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<AiCarousel> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const sizeHint = SIZE_HINT[data.aspectRatio] ?? data.aspectRatio;
    const total = data.slideCount;
    const pointCount = Math.max(1, total - 2);

    const sys = `You are a senior social-media creative director who writes premium
carousels in the style of top Instagram creators (dark editorial, big typography,
diagrams, icons). Return STRICT JSON — no prose, no markdown fences.`;

    const user = `Create an Instagram carousel for the topic below.

TOPIC: ${data.topic}
TONE: ${data.tone}
PLATFORM: ${data.platform}
VISUAL STYLE: ${data.styleLabel}
ASPECT: ${data.aspectRatio} (${sizeHint})
SLIDE COUNT: ${total} (Slide 1 = cover, ${pointCount} point slides, last = CTA)

For EACH slide, produce:
- n: slide number (1..${total})
- role: "Cover" | "Point 1"..."Point ${pointCount}" | "CTA"
- label: short badge shown on the slide (e.g. "COVER", "TRUTH #1", "STEP 2", "READY?")
- emoji: 1 relevant emoji
- headline: 3-7 word punchy headline
- body: 1 short sentence (max 18 words)
- bullets: 3-5 tight bullets, each 2-6 words
- bottom_highlight: the key takeaway line (max 10 words)
- visual: 1-line layout description (what's on the slide)
- image_prompt: a rich, self-contained prompt for an AI image model to render this
  slide AS A FINISHED INFOGRAPHIC POSTER. It MUST include:
    * "${data.styleLabel} style, ${sizeHint}, dark editorial poster"
    * the exact label text in a top badge
    * the exact headline as the hero typography (one accent word in a purple-to-cyan gradient)
    * the bullets rendered as icon cards on the left, each with the bullet label
    * a diagram/illustration on the right supporting the headline
    * the bottom_highlight text in a bottom banner labeled "KEY TAKEAWAY"
    * neon accents, dashed connectors, minimalist line icons, ultra-crisp sans-serif typography, generous negative space
    * command "spell every word correctly" and "no lorem ipsum"

Return JSON EXACTLY:
{
  "title": "string (Instagram carousel title incl. platform)",
  "slides": [ { ...fields above... } ]
}`;

    let upstream: Response;
    try {
      upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      throw new Error(`AI gateway unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (!upstream.ok) {
      const t = await upstream.text().catch(() => "");
      throw new Error(`AI gateway ${upstream.status}: ${t || upstream.statusText}`);
    }

    const j = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = j.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error("AI returned empty content");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("AI response was not valid JSON");
      parsed = JSON.parse(m[0]);
    }

    const Schema = z.object({
      title: z.string(),
      slides: z.array(z.object({
        n: z.number(),
        role: z.string(),
        label: z.string(),
        emoji: z.string().optional().default(""),
        headline: z.string(),
        body: z.string(),
        bullets: z.array(z.string()).default([]),
        bottom_highlight: z.string().default(""),
        visual: z.string(),
        image_prompt: z.string(),
      })),
    });
    const out = Schema.parse(parsed);
    // normalize slide numbering
    out.slides = out.slides.map((s, i) => ({ ...s, n: i + 1 }));
    return out;
  });
