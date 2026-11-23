// Ad Creative tool — AI ad copy. The image itself is made in the browser
// (src/lib/ad-creative-render.ts) so the text on it is always exact.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdCopy = {
  headline: string;
  highlight: string;
  subline: string;
  tags: string[];
  cta: string;
  footer: string;
  badge: string;
  imagePrompt: string;
};

const input = z.object({
  business: z.string().trim().min(2).max(120),
  product: z.string().trim().min(2).max(300),
  offer: z.string().trim().max(160).optional().default(""),
  audience: z.string().trim().max(160).optional().default(""),
  language: z.string().trim().max(40).optional().default("English"),
  contact: z.string().trim().max(120).optional().default(""),
});

export const writeAdCopyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<AdCopy> => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const raw = await gatewayChatJson<Partial<AdCopy>>({
      messages: [
        {
          role: "system",
          content: "You write short, honest, high-converting social media ad copy for small businesses and creators. Return ONLY valid JSON.",
        },
        {
          role: "user",
          content: `Write copy for one Facebook/Instagram image ad.
BUSINESS: ${data.business}
WHAT IS BEING PROMOTED: ${data.product}
${data.offer ? `OFFER: ${data.offer}` : "OFFER: none — do not invent discounts or prices"}
${data.audience ? `AUDIENCE: ${data.audience}` : ""}
${data.contact ? `HOW TO ORDER / CONTACT: ${data.contact}` : ""}
LANGUAGE for all ad text: ${data.language}

Return JSON:
{
  "headline": "3-7 words, punchy, the main promise",
  "highlight": "1-2 words copied exactly from the headline to colour-highlight",
  "subline": "one sentence, max 12 words",
  "tags": ["exactly 4 short feature/benefit tags, 1-3 words each"],
  "cta": "button text, 2-4 words, e.g. Order Now",
  "footer": "short line with how to order/contact, or empty string",
  "badge": "short offer badge like '20% OFF' ONLY if an offer was given, else empty string",
  "imagePrompt": "English description of a photo-realistic background/scene for this ad with NO text in it, e.g. the product on a festive table with warm light"
}
Rules: no fake reviews, ratings, user counts or claims not given above. Keep every field short.`,
        },
      ],
      temperature: 0.8,
      maxTokens: 800,
    });
    const s = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
    const tags = Array.isArray(raw?.tags) ? raw!.tags!.map((t) => s(t, 28)).filter(Boolean).slice(0, 4) : [];
    return {
      headline: s(raw?.headline, 80) || data.product.slice(0, 60),
      highlight: s(raw?.highlight, 40),
      subline: s(raw?.subline, 120),
      tags,
      cta: s(raw?.cta, 28) || "Order Now",
      footer: s(raw?.footer, 80),
      badge: data.offer ? s(raw?.badge, 20) : "",
      imagePrompt: s(raw?.imagePrompt, 400),
    };
  });
