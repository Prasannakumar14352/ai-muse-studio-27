import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chargeMiddleware } from "@/lib/credits-guard.server";
import { z } from "zod";
import { parseStructuredJsonResponse } from "@/lib/video-json";
import {
  buildAssetPlanHeuristic,
  buildBriefFromIntent,
  detectIntentHeuristic,
  briefEnrichment,
  type CreativeBrief,
  type AssetPlan,
} from "@/lib/creative-director";
import {
  pickTemplate,
  templatePromptBlock,
  rewriteVisualForTemplate,
  LAYOUT_TEMPLATES,
  MARKETING_LAYOUT_RULES,
} from "@/lib/layout-engine";
import { aiChatFetch, aiKey, AI_NOT_CONFIGURED } from "@/lib/ai-provider";

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
  .middleware([requireSupabaseAuth, chargeMiddleware("carousel_plan")])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<AiCarousel> => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);

    const sizeHint = SIZE_HINT[data.aspectRatio] ?? data.aspectRatio;
    const total = data.slideCount;
    const pointCount = Math.max(1, total - 2);

    // ---------- Creative Director ----------
    // Detect the user's intent (product / educational / kids / SaaS / etc.)
    // and derive a full brief + slide-type plan BEFORE we ask the writer to
    // design slides. This is what stops the model from spitting out generic
    // "person holding phone" slides when the topic is a digital product or
    // Montessori worksheet pack.
    const { intent, confidence } = detectIntentHeuristic(data.topic);
    const brief: CreativeBrief = buildBriefFromIntent(data.topic, intent, confidence);
    const plan: AssetPlan = buildAssetPlanHeuristic(brief, "carousel", total);
    const slidePlanLines = plan.items.map((it) =>
      `Slide ${it.index}: ${it.slideType ?? it.role} — layout: ${it.layoutHint} — visual: ${it.visualDescription}`,
    ).join("\n");
    const directorBlock = briefEnrichment(brief);

    const sys = `You are the Creative Director of a top-tier social media agency
(think Ogilvy x Apple x Pentagram). You write RIDICULOUSLY detailed, magazine-quality,
ready-to-render image prompts for premium Instagram carousels. Every "image_prompt"
you produce is a full agency brief that a modern text-to-image model (gpt-image-2)
can execute as a finished, on-brand ad slide with perfectly spelled headline,
subheadline, badges, and CTA rendered inside the image itself. Return STRICT JSON —
no prose, no markdown fences.

You MUST follow the upstream CREATIVE DIRECTOR BRIEF below verbatim. In
particular: honor the "Visual hero" (do NOT drift into random presenters if
the hero is a product / worksheet / dashboard), respect the AVOID list, and
give EACH slide a DIFFERENT slide type + layout from the SLIDE PLAN — do
not return N identical slides.

${MARKETING_LAYOUT_RULES}`;

    const user = `Design a premium Instagram carousel.

${directorBlock}

SLIDE PLAN (obey slide-type + layout per slide — do NOT collapse into identical slides):
${slidePlanLines}

TOPIC: ${data.topic}
TONE: ${data.tone}
PLATFORM: ${data.platform}
VISUAL STYLE: ${data.styleLabel}
ASPECT: ${data.aspectRatio} (${sizeHint})
SLIDE COUNT: ${total} (Slide 1 = Hook, ${pointCount} content slides, last = CTA)

For EACH slide, produce:
- n: slide number (1..${total})
- role: "Cover" | "Point 1"..."Point ${pointCount}" | "CTA"
- label: short on-slide badge (e.g. "COVER", "TIP #1", "STEP 2", "READY?")
- emoji: 1 relevant emoji
- headline: 3-8 word punchy headline
- body: 1 short sentence (max 20 words)
- bullets: 3-5 tight bullets, each 2-6 words
- bottom_highlight: key takeaway line (max 10 words)
- visual: 1-line layout description
- image_prompt: A COMPLETE, SELF-CONTAINED AGENCY BRIEF (600-1000 words) that the
  image model will render AS A FINISHED, READY-TO-POST INSTAGRAM SLIDE.
  It MUST be written as clearly-labeled sections, in this exact order:

    Canvas Size: ${sizeHint} Instagram carousel slide
    Brand: infer a short brand name from the topic (keep it consistent across every slide)
    Design Style: describe the "${data.styleLabel}" aesthetic in detail —
      lighting, mood, color feel, level of polish, references (e.g. Apple keynote,
      luxury magazine ad, editorial poster), glassmorphism / gradients / shadows / spacing.
    Main Headline: the EXACT headline text, in quotes, with size + placement notes
    Subheadline: the EXACT body sentence, in quotes, with placement
    Feature Badges / Bullets: list EACH bullet exactly as written, each with a
      matching emoji/icon and a rounded pill/card treatment
    CTA: for Cover use "Swipe →", for content slides use a subtle prompt,
      for the last slide use a strong CTA button relevant to the topic
    Main Visual: a photoreal, magazine-quality hero visual that matches the
      slide's message. Describe the subject, wardrobe, expression, action,
      props, and how it interacts with the layout. Cover slide should feature
      a hero human or hero product; content slides should show a supporting
      scene, prop, or detail; CTA slide should show a satisfied outcome.
    Background: describe the environment — setting, lighting, textures,
      supporting props — in enough detail that it looks like a real premium
      photo shoot, not stock art.
    Product Showcase (only when the topic sells a product): describe an
      elegant 3D-style mockup + supporting icons floating around it.
    Decorative Elements: subtle confetti, dots, stars, soft shapes,
      floating icons — enhancing without cluttering.
    Color Palette: give explicit HEX values that match "${data.styleLabel}":
      primary background, 3-4 accent colors, text color, CTA button color.
      REUSE THE SAME PALETTE ON EVERY SLIDE so the carousel feels like one deck.
    Typography: premium bold modern sans-serif; headline dominates top,
      subhead centered under it, bullets in two neat rows, CTA near bottom.
      Everything mobile-legible.
    Composition: describe hierarchy and eye-flow explicitly
      (headline → hero → bullets → CTA), with generous whitespace.
    Lighting & Photography: cinematic natural light, shallow depth of field,
      commercial magazine photography, ultra-realistic textures, natural skin tones.
    Quality Requirements: ultra realistic, 8K, photorealistic, magazine cover
      quality, luxury digital product marketing, export-ready, no watermarks,
      no logos except the inferred brand name, NO SPELLING MISTAKES, perfect
      text alignment, high mobile readability.

  HARD RULES for image_prompt:
    * Always include the EXACT headline, subheadline, badge label, every bullet,
      and CTA text in quotes so the model renders them verbatim.
    * Always end with: "Spell every word correctly. No lorem ipsum. No gibberish text."
    * Keep brand name, palette, typography, and photographic style IDENTICAL across
      all ${total} slides so the deck feels cohesive.
    * Cover = maximum wow. Content slides = clean, focused, one idea each.
      Final = strong CTA + outcome imagery.

Return JSON EXACTLY:
{
  "title": "string (Instagram carousel title incl. platform)",
  "brand_lock": "One paragraph (80-140 words) locking the SHARED design system for ALL ${total} slides: brand name, exact HEX palette (bg + 3-4 accents + text + CTA), typography (font family + weights), photographic style, lighting, composition principles, decorative language. This is copied verbatim onto every slide.",
  "character_sheet": "One paragraph (80-140 words) locking the SAME HERO CHARACTER for every slide that features a person: gender, approximate age, ethnicity, exact hairstyle + color, eye color, face shape, distinguishing features, exact wardrobe (top, bottom, accessories, colors), and consistent expression tone. Say 'SAME PERSON, identical face and outfit across every slide — do not redesign, do not age, do not change wardrobe.' If the topic is purely product-only with no human, write a HERO PRODUCT SHEET instead with identical product details.",
  "slides": [ { ...fields above... } ]
}`;

    let upstream: Response;
    try {
      upstream = await aiChatFetch({
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
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

    const { value: parsed } = parseStructuredJsonResponse(raw);


    const Schema = z.object({
      title: z.string(),
      brand_lock: z.string().nullish().transform((v) => v ?? ""),
      character_sheet: z.string().nullish().transform((v) => v ?? ""),
      slides: z.array(z.object({
        n: z.number(),
        role: z.string(),
        label: z.string(),
        emoji: z.string().nullish().transform((v) => v ?? ""),
        headline: z.string(),
        body: z.string().nullish().transform((v) => v ?? ""),
        bullets: z.array(z.string()).nullish().transform((v) => v ?? []),
        bottom_highlight: z.string().nullish().transform((v) => v ?? ""),
        visual: z.string(),
        image_prompt: z.string(),
      })),
    });
    const out = Schema.parse(parsed);
    // Prepend the shared brand-lock + character-sheet + Creative Director
    // brief to EVERY slide's image prompt so slides 1..N render with the
    // same canvas, character, brand, AND respect the visual hero + avoid list.
    const lockHeader = [
      `CREATIVE DIRECTOR (identical on every slide — obey visual hero + avoid list):\n${directorBlock}`,
      out.brand_lock && `BRAND LOCK (identical on every slide):\n${out.brand_lock}`,
      out.character_sheet && `CHARACTER SHEET (SAME person / product on every slide — do not redesign):\n${out.character_sheet}`,
    ].filter(Boolean).join("\n\n");
    // Detect "product-led" vs "character-led" from the brief so each slide
    // picks an on-brand layout template instead of always defaulting to A.
    const briefText = `${brief.visualHero ?? ""} ${brief.avoid ?? ""}`.toLowerCase();
    const heroIsProduct = /product|worksheet|dashboard|app|screen|book|pack|kit|tablet/.test(briefText);
    const heroIsHuman = /child|kid|person|founder|creator|presenter|human|face/.test(briefText);

    out.slides = out.slides.map((s, i) => {
      const template = pickTemplate({
        slideRole: s.role,
        hasCharacter: heroIsHuman,
        hasProduct: heroIsProduct,
        bulletCount: s.bullets?.length ?? 0,
      });
      const layoutBlock = templatePromptBlock(template);
      const visualCompositional = rewriteVisualForTemplate(s.visual, template);
      const compositionalPrompt =
        `${lockHeader}\n\n---\n\n${layoutBlock}\n\n---\n\n` +
        `LAYOUT-AWARE VISUAL DIRECTION:\n${visualCompositional}\n\n---\n\n${s.image_prompt}`;
      return {
        ...s,
        n: i + 1,
        visual: visualCompositional,
        image_prompt: compositionalPrompt,
        // stash template id in visual metadata via a marker the editor can parse
        // (kept in `visual` because the schema doesn't accept new fields)
      };
    });
    // Silence unused-var warning for LAYOUT_TEMPLATES import (used by editor).
    void LAYOUT_TEMPLATES;
    return out;
  });
