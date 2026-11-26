// Promo Studio copy: one OpenRouter JSON call that writes N variants of hook / headline /
// slides / CTA / caption / hashtags (design §6.1). No auth, no spend here: the caller wraps it in withSpend.
import { z } from "zod";
import { openrouterJson, OpenrouterError } from "@/lib/providers/openrouter-json.server";
import { SpendCallError } from "./budget.server";
import { COPY_KB_MAX_CHARS, COPY_MAX_TOKENS, PROMO_COPY_MODEL } from "./prices.server";
import type { PromoFormat, PromoLanguage, PromoTemplate } from "./constants";

export type CopyVariant = {
  hook: string;
  headline: string;
  slides?: { title: string; body: string }[];
  cta: string;
  caption: string;
  hashtags: string[];
};

const TEMPLATE_BRIEF: Record<PromoTemplate, string> = {
  feature_spotlight:
    "Feature spotlight: show one real feature of the app (from the screenshot labels/tags) and the concrete result it gives a creator.",
  offer_festival:
    "Offer / festival ad: celebrate the current offer by its title only. The design adds the code and discount itself, so never write them.",
  before_after:
    "Before → after: contrast the slow manual way of making content with the fast result in the app.",
};

const LANGUAGE_RULE: Record<PromoLanguage, string> = {
  en: "Write everything in simple English.",
  te: "Write hook, headline, slide lines and CTA in Telugu script (not transliterated). Caption may mix Telugu and English. Hashtags may be English.",
  hi: "Write hook, headline, slide lines and CTA in Hindi (Devanagari script). Caption may mix Hindi and English. Hashtags may be English.",
};

const SCRIPT_RE: Partial<Record<PromoLanguage, RegExp>> = { te: /[ఀ-౿]/, hi: /[ऀ-ॿ]/ };

function schemaFor(n: number, slides: number | undefined) {
  const slide = z.object({
    title: z.string().trim().min(1).max(60),
    body: z.string().trim().max(160),
  });
  const variant = z.object({
    hook: z.string().trim().min(1).max(90),
    headline: z.string().trim().min(1).max(80),
    slides: slides ? z.array(slide).length(slides) : z.array(slide).optional(),
    cta: z.string().trim().min(1).max(28),
    caption: z.string().trim().min(1).max(1800),
    hashtags: z.array(z.string().trim().min(1).max(40)).min(3).max(15),
  });
  return z.object({ variants: z.array(variant).length(n) });
}

/** Soft lint (C8): prices, percents, "x off" and code-like tokens the model shouldn't have written. */
export function lintCopy(v: CopyVariant, offerCode: string | null): string[] {
  const text = [
    v.hook,
    v.headline,
    v.cta,
    ...(v.slides ?? []).flatMap((s) => [s.title, s.body]),
  ].join(" \n ");
  const out: string[] = [];
  if (/₹|\$\s?\d/.test(text)) out.push("Mentions a price — the design adds offers itself.");
  if (/%/.test(text)) out.push("Mentions a percentage.");
  if (/\d+\s*%?\s*off\b/i.test(text)) out.push('Mentions "… off".');
  const codes = (text.match(/\b[A-Z0-9]{5,}\b/g) ?? []).filter(
    (t) => /\d/.test(t) && t !== offerCode,
  );
  if (codes.length) out.push(`Looks like a code: ${[...new Set(codes)].join(", ")}`);
  return out;
}

export function buildCopyPrompt(args: {
  kb: string;
  appUrl: string;
  honestyRules: string;
  template: PromoTemplate;
  format: PromoFormat;
  language: PromoLanguage;
  variants: number;
  slides?: number;
  topic?: string;
  assets: { label: string; featureTag: string }[];
  offerTitle: string | null;
}): { system: string; user: string } {
  const system = [
    "You write short, honest social-media ad copy that promotes the CreatorFlow AI app itself (an AI content-creation platform for creators and small businesses).",
    args.honestyRules.replace("{SITE}", args.appUrl),
    "PRODUCT FACTS (only claim what is here):",
    args.kb.slice(0, COPY_KB_MAX_CHARS),
    "TEMPLATE: " + TEMPLATE_BRIEF[args.template],
    LANGUAGE_RULE[args.language],
    "Never write a discount code, a price, a percentage or a date. The design adds the offer itself.",
    "Hooks and headlines must be different in every variant. Headline ≤ 8 words. CTA ≤ 4 words.",
    'Reply with JSON only: {"variants":[{"hook","headline","slides"?:[{"title","body"}],"cta","caption","hashtags":[...]}]}',
  ].join("\n\n");
  const user = JSON.stringify({
    template: args.template,
    format: args.format,
    variants: args.variants,
    slides: args.format === "carousel" ? args.slides : undefined,
    slide_rule:
      args.format === "carousel"
        ? `Exactly ${args.slides} middle slides, one benefit each (title + short body). The design adds the cover slide (the hook) and the final CTA slide itself, so don't write those.`
        : undefined,
    topic: args.topic || undefined,
    screenshots: args.assets,
    offer_title: args.offerTitle ?? undefined,
  });
  return { system, user };
}

/**
 * Runs the copy call and validates it. Throws SpendCallError (with the billed usage) on any
 * failure, so withSpend logs the real cost and returns ok:false.
 */
export async function writeCopy(
  prompt: { system: string; user: string },
  opts: { variants: number; slides?: number; language: PromoLanguage },
): Promise<{
  value: CopyVariant[];
  actualUsd: number | null;
  units: number | null;
  requestId: string | null;
}> {
  let res;
  try {
    res = await openrouterJson({
      model: PROMO_COPY_MODEL,
      system: prompt.system,
      user: prompt.user,
      maxTokens: COPY_MAX_TOKENS,
      temperature: 0.8,
    });
  } catch (e) {
    if (e instanceof OpenrouterError) {
      throw new SpendCallError(e.message, {
        actualUsd: e.usage?.costUsd ?? null,
        units: tokens(e.usage),
        requestId: e.requestId,
      });
    }
    throw e;
  }
  const units = tokens(res.usage);
  const fail = (msg: string) =>
    new SpendCallError(msg, { actualUsd: res.usage.costUsd, units, requestId: res.requestId });

  const parsed = schemaFor(opts.variants, opts.slides).safeParse(res.data);
  if (!parsed.success) throw fail("Copy JSON didn't match the schema");
  const vs = parsed.data.variants as CopyVariant[];

  const hooks = new Set(vs.map((v) => v.hook.toLowerCase()));
  const heads = new Set(vs.map((v) => v.headline.toLowerCase()));
  if (hooks.size !== vs.length || heads.size !== vs.length) throw fail("Duplicate variants");

  const re = SCRIPT_RE[opts.language];
  if (re && !vs.every((v) => re.test(v.headline)))
    throw fail("Headline not in the requested script");

  return { value: vs, actualUsd: res.usage.costUsd, units, requestId: res.requestId };
}

function tokens(
  u: { promptTokens: number | null; completionTokens: number | null } | null | undefined,
): number | null {
  if (!u) return null;
  const t = (u.promptTokens ?? 0) + (u.completionTokens ?? 0);
  return t > 0 ? t : null;
}
