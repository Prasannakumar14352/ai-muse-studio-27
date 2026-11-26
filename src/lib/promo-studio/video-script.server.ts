// Promo video script: one OpenRouter JSON call that writes the scenes (voiceover + short
// on-screen caption + which screenshot to show), the end screen, and the YouTube title,
// description and hashtags. Caller wraps it in withSpend.
import { z } from "zod";
import { openrouterJson, OpenrouterError } from "@/lib/providers/openrouter-json.server";
import { SpendCallError } from "./budget.server";
import { COPY_KB_MAX_CHARS, PROMO_COPY_MODEL } from "./prices.server";
import type { PromoLanguage, PromoVideoFormat, PromoVideoTemplate } from "./constants";

export type PromoVideoScene = { voiceover: string; caption: string; asset: number };
export type PromoVideoScript = {
  title: string;
  description: string;
  hashtags: string[];
  scenes: PromoVideoScene[];
  end: { headline: string; cta: string; voiceover: string };
};

const BRIEF: Record<PromoVideoTemplate, string> = {
  product_tour:
    "Product tour: a quick walk through the app. Hook → the problem creators have → 3-5 real features, each on its own screenshot → sign-up call to action.",
  feature_spotlight:
    "Feature spotlight: one feature in depth (from the screenshot labels). Hook → pain → how the feature solves it step by step → result → call to action.",
  offer:
    "Offer video: lead with the current offer by its title (never write the code, a price, a percentage or a date — the end screen shows them), then 2-3 reasons to join now.",
  faceless_explainer:
    "Faceless YouTube explainer: speak to people who want to grow on YouTube without showing their face. Show how the app makes scripts, voiceovers and videos for them.",
  telugu_voiceover:
    "Telugu voiceover ad: for Telugu creators. Show that the app writes and voices videos in Telugu, plus other Indian languages.",
};

const LANG: Record<PromoLanguage, string> = {
  en: "Write voiceovers, captions and the end screen in simple, spoken English.",
  te: "Write voiceovers, captions and the end screen in natural spoken Telugu (Telugu script, not transliterated). App names and feature names may stay in English. Title, description and hashtags may mix Telugu and English.",
  hi: "Write voiceovers, captions and the end screen in natural spoken Hindi (Devanagari). App names and feature names may stay in English. Title, description and hashtags may mix Hindi and English.",
};
const SCRIPT_RE: Partial<Record<PromoLanguage, RegExp>> = { te: /[ఀ-౿]/, hi: /[ऀ-ॿ]/ };

export function buildVideoPrompt(a: {
  kb: string;
  honestyRules: string;
  appUrl: string;
  template: PromoVideoTemplate;
  format: PromoVideoFormat;
  seconds: number;
  scenes: number;
  language: PromoLanguage;
  assets: { label: string; featureTag: string }[];
  offerTitle: string | null;
  defaultCta: string;
  topic?: string;
}) {
  const wordsPerScene = Math.round(((a.seconds / (a.scenes + 1)) * 2.3) | 0);
  const system = [
    "You write short, honest promo video scripts that make viewers sign up for the CreatorFlow AI app (an AI content-creation platform for creators and small businesses).",
    a.honestyRules.replace("{SITE}", a.appUrl),
    "PRODUCT FACTS (only claim what is here):",
    a.kb.slice(0, COPY_KB_MAX_CHARS),
    "TEMPLATE: " + BRIEF[a.template],
    LANG[a.language],
    `The video is a ${a.format === "short" ? "YouTube Short / Reel (vertical, fast)" : "regular YouTube video (horizontal)"} of about ${a.seconds} seconds.`,
    `Write exactly ${a.scenes} scenes plus an end screen. Each scene's voiceover is about ${Math.max(6, wordsPerScene)} words (one or two short sentences). The first scene must hook in under 3 seconds.`,
    "caption = 2-6 punchy words shown big on screen for that scene. asset = index of the screenshot to show (0-based, from the screenshots list); spread them out and match each scene to the screenshot whose label/tag fits.",
    `End screen: headline ≤ 8 words, cta ≤ 4 words (prefer "${a.defaultCta}"), voiceover = a short spoken call to sign up free.`,
    "Never write a discount code, a price, a percentage or a date anywhere. Don't invent numbers of users or results.",
    "title ≤ 90 characters for YouTube search; description 2-4 short lines (no link, it is added for you); 5-12 hashtags.",
    'Reply with JSON only: {"title","description","hashtags":[...],"scenes":[{"voiceover","caption","asset"}],"end":{"headline","cta","voiceover"}}',
  ].join("\n\n");
  const user = JSON.stringify({
    template: a.template,
    format: a.format,
    seconds: a.seconds,
    scenes: a.scenes,
    screenshots: a.assets.map((s, i) => ({ index: i, ...s })),
    offer_title: a.offerTitle ?? undefined,
    topic: a.topic || undefined,
  });
  return { system, user };
}

export async function writeVideoScript(
  prompt: { system: string; user: string },
  opts: { scenes: number; assets: number; language: PromoLanguage },
): Promise<{
  value: PromoVideoScript;
  actualUsd: number | null;
  units: number | null;
  requestId: string | null;
}> {
  const schema = z.object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(1500),
    hashtags: z.array(z.string().trim().min(1).max(40)).min(3).max(15),
    scenes: z
      .array(
        z.object({
          voiceover: z.string().trim().min(1).max(300),
          caption: z.string().trim().min(1).max(60),
          asset: z.number().int().min(0),
        }),
      )
      .length(opts.scenes),
    end: z.object({
      headline: z.string().trim().min(1).max(80),
      cta: z.string().trim().min(1).max(30),
      voiceover: z.string().trim().min(1).max(200),
    }),
  });
  let res;
  try {
    res = await openrouterJson({
      model: PROMO_COPY_MODEL,
      system: prompt.system,
      user: prompt.user,
      maxTokens: 1800,
      temperature: 0.8,
    });
  } catch (e) {
    if (e instanceof OpenrouterError) {
      const u = e.usage;
      throw new SpendCallError(e.message, {
        actualUsd: u?.costUsd ?? null,
        units: u ? (u.promptTokens ?? 0) + (u.completionTokens ?? 0) || null : null,
        requestId: e.requestId,
      });
    }
    throw e;
  }
  const units = (res.usage.promptTokens ?? 0) + (res.usage.completionTokens ?? 0) || null;
  const fail = (m: string) =>
    new SpendCallError(m, { actualUsd: res.usage.costUsd, units, requestId: res.requestId });
  const parsed = schema.safeParse(res.data);
  if (!parsed.success) throw fail("Video script JSON didn't match the schema");
  const v = parsed.data as PromoVideoScript;
  const re = SCRIPT_RE[opts.language];
  if (re && !v.scenes.every((s) => re.test(s.voiceover)))
    throw fail("Voiceover not in the requested script");
  // Clamp screenshot indexes to what was sent.
  v.scenes = v.scenes.map((s) => ({
    ...s,
    asset: opts.assets ? Math.min(s.asset, opts.assets - 1) : 0,
  }));
  v.hashtags = v.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`));
  return { value: v, actualUsd: res.usage.costUsd, units, requestId: res.requestId };
}
