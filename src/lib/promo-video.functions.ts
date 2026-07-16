// Promo Video generator — AI planning + supporting server functions.
// Owns the schema, prompt building and per-section regeneration used by the
// /promo-videos wizard. Rendering happens client-side via `renderVideo`
// (existing canvas + MediaRecorder pipeline). Persistence uses the shared
// `projects` table with content_type = 'promo_video'.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Format registry ----------

export type PromoFormatId =
  | "instagram_reel"
  | "youtube_short"
  | "tiktok"
  | "facebook_reel"
  | "youtube_promo"
  | "square_ad";

export type PromoFormat = {
  id: PromoFormatId;
  label: string;
  platform: string;
  aspect: "9:16" | "16:9" | "1:1";
  width: number;
  height: number;
  /** Composition guidance injected into the AI plan prompt. */
  composition: string;
  /** Safe zone description (title-safe area for text overlays). */
  safeZone: string;
};

export const PROMO_FORMATS: PromoFormat[] = [
  {
    id: "instagram_reel", label: "Instagram Reel", platform: "instagram",
    aspect: "9:16", width: 1080, height: 1920,
    composition: "Vertical 9:16 mobile-first framing. Subject centered in the middle 70% of the frame. Text overlays live in the top 12% or bottom 20% — never behind the subject's face.",
    safeZone: "Keep captions inside the center 82% width, 18%–72% vertical band.",
  },
  {
    id: "youtube_short", label: "YouTube Short", platform: "youtube",
    aspect: "9:16", width: 1080, height: 1920,
    composition: "Vertical 9:16, retention-optimized. Big bold hook in top third within 1.5s. Subject centered. CTA in bottom third with generous margin.",
    safeZone: "Keep all critical elements inside center 80% x 78% area — avoid the YouTube UI overlay in bottom 15%.",
  },
  {
    id: "tiktok", label: "TikTok", platform: "tiktok",
    aspect: "9:16", width: 1080, height: 1920,
    composition: "Vertical 9:16. Fast cuts, punchy on-screen captions, native-feel motion. Keep faces above the TikTok UI zone.",
    safeZone: "Right side has TikTok action buttons — keep the right 15% empty of text. Bottom 20% has caption+username UI.",
  },
  {
    id: "facebook_reel", label: "Facebook Reel", platform: "facebook",
    aspect: "9:16", width: 1080, height: 1920,
    composition: "Vertical 9:16 with a strong first-frame thumbnail. Warmer, story-first visuals.",
    safeZone: "Keep subject and text inside center 84% x 78%.",
  },
  {
    id: "youtube_promo", label: "YouTube Promo Video", platform: "youtube",
    aspect: "16:9", width: 1920, height: 1080,
    composition: "Cinematic 16:9 landscape composition. Wider environments, balanced left/right, subject on rule-of-thirds.",
    safeZone: "Title-safe area is the center 90% x 85%.",
  },
  {
    id: "square_ad", label: "Square Social Ad", platform: "instagram",
    aspect: "1:1", width: 1080, height: 1080,
    composition: "Balanced 1:1 square with subject or product centered. Strong text hierarchy top or bottom.",
    safeZone: "Text-safe area is the center 88% x 82%.",
  },
];

export const PROMO_FORMATS_BY_ID: Record<PromoFormatId, PromoFormat> =
  Object.fromEntries(PROMO_FORMATS.map((f) => [f.id, f])) as Record<PromoFormatId, PromoFormat>;

// ---------- Plan schema ----------

export type PromoScene = {
  n: number;
  role: string;              // hook | problem | intro | benefit | proof | offer | cta
  duration_sec: number;      // per-scene duration
  on_screen_text: string;
  voiceover: string;
  visual_prompt: string;     // image/video prompt for that scene
  transition: string;        // suggested transition into this scene
  motion?: string;           // suggested camera motion (matches video-renderer CameraMotion)
};

export type PromoPlan = {
  format: PromoFormatId;
  duration_sec: number;
  hook: string;
  problem: string;
  intro: string;
  benefits: string[];
  proof: string;
  offer: string;
  cta: string;
  cta_url?: string;
  scenes: PromoScene[];
  voiceover_script: string;      // full concatenated VO script
  music_mood: string;
  thumbnail_concept: string;
  thumbnail_text: string;
  title: string;
  description: string;
  caption: string;
  hashtags: string[];
};

// ---------- Input types ----------

export type PromoBrief = {
  productName: string;
  topic: string;
  description?: string;
  audience?: string;
  goal: string;
  format: PromoFormatId;
  durationSec: number;
  tone: string;
  language: string;
  ctaUrl?: string;
  ctaText?: string;
  offer?: string;
  voiceover: "none" | "male" | "female" | "auto";
  captions: boolean;
  music: boolean;
  brandColors?: string[];
  hasLogo?: boolean;
  hasProductImages?: boolean;
};

// ---------- Prompt builder ----------

function buildPlanPrompt(brief: PromoBrief, fmt: PromoFormat): string {
  const sceneTarget = Math.max(3, Math.min(9, Math.round(brief.durationSec / 5)));
  return `You are an elite direct-response promo-video director. Write a complete, ready-to-produce promotional video plan.

PRODUCT / BRAND: ${brief.productName}
TOPIC / OBJECTIVE: ${brief.topic}
${brief.description ? `DESCRIPTION / OFFER: ${brief.description}` : ""}
${brief.audience ? `TARGET AUDIENCE: ${brief.audience}` : ""}
CAMPAIGN GOAL: ${brief.goal}
${brief.offer ? `OFFER / DISCOUNT: ${brief.offer}` : ""}
${brief.ctaUrl ? `LANDING URL: ${brief.ctaUrl}` : ""}
${brief.ctaText ? `PREFERRED CTA: ${brief.ctaText}` : ""}
LANGUAGE: ${brief.language}
TONE: ${brief.tone}

FORMAT: ${fmt.label} — ${fmt.aspect} ${fmt.width}×${fmt.height} for ${fmt.platform}
COMPOSITION RULES: ${fmt.composition}
SAFE ZONE: ${fmt.safeZone}
TOTAL DURATION: ${brief.durationSec} seconds — build exactly ${sceneTarget} scenes whose durations sum to ${brief.durationSec}.

Return ONLY valid JSON with EXACTLY this shape (no commentary):
{
  "hook": "string - a 1-3s pattern-interrupt opener",
  "problem": "string - the pain the audience feels",
  "intro": "string - one-line product/brand intro",
  "benefits": ["string", "..."],
  "proof": "string - result, transformation, credibility or social proof",
  "offer": "string - urgency / reason to act now",
  "cta": "string - final call to action line",
  "scenes": [
    {
      "n": 1,
      "role": "hook|problem|intro|benefit|proof|offer|cta",
      "duration_sec": number,
      "on_screen_text": "short bold text overlay",
      "voiceover": "one sentence, natural spoken cadence",
      "visual_prompt": "detailed image/video prompt describing the shot for this beat, respecting ${fmt.aspect} composition. Keep the subject/product consistent across scenes. Cinematic, ${brief.tone.toLowerCase()} mood.",
      "transition": "cut|fade|whipPan|slideLeft|slideUp|maskCircle|zoomBlur|flash",
      "motion": "zoomIn|pushIn|panLeft|panRight|orbit|parallax|productSpin|kineticText"
    }
  ],
  "voiceover_script": "full narration concatenated, ${brief.durationSec}s reading pace",
  "music_mood": "1-2 words e.g. uplifting, cinematic, energetic",
  "thumbnail_concept": "description of the cover frame",
  "thumbnail_text": "short bold overlay for the thumbnail",
  "title": "punchy title ≤ 65 chars",
  "description": "2-3 sentence description with the CTA URL if provided",
  "caption": "social caption for ${fmt.platform}, ${brief.tone.toLowerCase()} tone",
  "hashtags": ["#tag1", "#tag2", "..."]
}

Rules:
- Every scene visual must feature THIS product/brand ("${brief.productName}") consistently.
- Scenes must sum to exactly ${brief.durationSec} seconds.
- Do not mention CreatorFlow AI unless it IS the product.
- Output valid JSON. No trailing commas. No markdown fences.`;
}

// ---------- Server functions ----------

export const planPromoVideoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: PromoBrief) => {
    if (!i.productName?.trim()) throw new Error("Product name required");
    if (!i.topic?.trim()) throw new Error("Topic required");
    if (!PROMO_FORMATS_BY_ID[i.format]) throw new Error("Invalid format");
    if (!i.durationSec || i.durationSec < 5) throw new Error("Duration required");
    return i;
  })
  .handler(async ({ data }): Promise<PromoPlan> => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const fmt = PROMO_FORMATS_BY_ID[data.format];
    const raw = await gatewayChatJson<Partial<PromoPlan>>({
      messages: [
        { role: "system", content: "You are an elite promo-video director. Return ONLY valid JSON matching the requested schema." },
        { role: "user", content: buildPlanPrompt(data, fmt) },
      ],
      temperature: 0.85,
      maxTokens: 4000,
    });

    const scenes = Array.isArray(raw?.scenes) ? raw!.scenes! : [];
    const normalizedScenes: PromoScene[] = scenes.map((s: any, idx: number) => ({
      n: Number(s?.n ?? idx + 1),
      role: String(s?.role ?? "beat"),
      duration_sec: Math.max(1, Number(s?.duration_sec ?? Math.round(data.durationSec / Math.max(1, scenes.length)))),
      on_screen_text: String(s?.on_screen_text ?? ""),
      voiceover: String(s?.voiceover ?? ""),
      visual_prompt: String(s?.visual_prompt ?? ""),
      transition: String(s?.transition ?? "fade"),
      motion: String(s?.motion ?? "zoomIn"),
    }));

    return {
      format: data.format,
      duration_sec: data.durationSec,
      hook: String(raw?.hook ?? ""),
      problem: String(raw?.problem ?? ""),
      intro: String(raw?.intro ?? ""),
      benefits: Array.isArray(raw?.benefits) ? raw!.benefits!.map(String) : [],
      proof: String(raw?.proof ?? ""),
      offer: String(raw?.offer ?? ""),
      cta: String(raw?.cta ?? data.ctaText ?? "Learn more"),
      cta_url: data.ctaUrl,
      scenes: normalizedScenes,
      voiceover_script: String(raw?.voiceover_script ?? normalizedScenes.map((s) => s.voiceover).join(" ")),
      music_mood: String(raw?.music_mood ?? "uplifting"),
      thumbnail_concept: String(raw?.thumbnail_concept ?? ""),
      thumbnail_text: String(raw?.thumbnail_text ?? ""),
      title: String(raw?.title ?? data.productName),
      description: String(raw?.description ?? ""),
      caption: String(raw?.caption ?? ""),
      hashtags: Array.isArray(raw?.hashtags) ? raw!.hashtags!.map(String) : [],
    };
  });

export const regeneratePromoSceneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: {
    brief: PromoBrief;
    scene: PromoScene;
    instruction?: string;
  }) => {
    if (!i.brief || !i.scene) throw new Error("brief and scene required");
    return i;
  })
  .handler(async ({ data }): Promise<PromoScene> => {
    const { gatewayChatJson } = await import("@/lib/ai-gateway.server");
    const fmt = PROMO_FORMATS_BY_ID[data.brief.format];
    const raw = await gatewayChatJson<Partial<PromoScene>>({
      messages: [
        { role: "system", content: "You rewrite a single scene of a promo video. Return ONLY valid JSON." },
        {
          role: "user",
          content: `Product: ${data.brief.productName}
Topic: ${data.brief.topic}
Format: ${fmt.label} (${fmt.aspect})
Tone: ${data.brief.tone}
Instruction: ${data.instruction || "Rewrite this scene stronger, more visual, more specific."}
Current scene JSON: ${JSON.stringify(data.scene)}

Return { "n", "role", "duration_sec", "on_screen_text", "voiceover", "visual_prompt", "transition", "motion" }`,
        },
      ],
      temperature: 0.9,
      maxTokens: 800,
    });

    return {
      n: data.scene.n,
      role: String(raw?.role ?? data.scene.role),
      duration_sec: Math.max(1, Number(raw?.duration_sec ?? data.scene.duration_sec)),
      on_screen_text: String(raw?.on_screen_text ?? data.scene.on_screen_text),
      voiceover: String(raw?.voiceover ?? data.scene.voiceover),
      visual_prompt: String(raw?.visual_prompt ?? data.scene.visual_prompt),
      transition: String(raw?.transition ?? data.scene.transition),
      motion: String(raw?.motion ?? data.scene.motion ?? "zoomIn"),
    };
  });

// ---------- CreatorFlow AI preset ----------

export function creatorFlowPreset(): Partial<PromoBrief> {
  return {
    productName: "CreatorFlow AI",
    topic: "The AI content operating system for creators and marketers",
    description: "CreatorFlow AI turns one idea into videos, thumbnails, images, carousels, LinkedIn posts, captions and SEO packs — with brand kit, agents, research and calendar built in.",
    audience: "Creators, founders and marketing teams",
    goal: "Sign-ups",
    tone: "Bold",
    language: "English",
    ctaText: "Try CreatorFlow AI free",
    voiceover: "auto",
    captions: true,
    music: true,
  };
}
