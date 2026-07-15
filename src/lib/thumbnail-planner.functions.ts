// Server functions for the pro Thumbnail Studio wizard: AI planning,
// quality analysis, reverse engineering, and one-shot rendering.
//
// Kept in a *.functions.ts file so imports are client-safe (handlers
// stripped from client bundles). No .server.ts imports at module scope.

import { createServerFn } from "@tanstack/react-start";
import { gatewayChatJson } from "@/lib/ai-gateway.server";
import type {
  ThumbnailBrief,
  PlannedBrief,
  ThumbnailQualityReport,
  ReverseEngineered,
} from "@/lib/thumbnail-presets";
import {
  EXTENDED_STYLES,
  BACKGROUNDS,
  LIGHTINGS,
  SUBJECTS,
  PALETTES,
} from "@/lib/thumbnail-presets";

function lookup<T extends { id: string }>(arr: T[], id: string): T {
  return arr.find((x) => x.id === id) ?? arr[0];
}

function briefContext(brief: ThumbnailBrief): string {
  const style   = lookup(EXTENDED_STYLES, brief.styleId);
  const subject = lookup(SUBJECTS, brief.subjectId);
  const bg      = lookup(BACKGROUNDS, brief.background);
  const light   = lookup(LIGHTINGS, brief.lighting);
  const pal     = lookup(PALETTES, brief.palette);
  const subjectDesc = brief.subjectId === "custom" ? brief.customSubject : subject.prompt;
  return [
    `Video title: ${brief.title || "(untitled)"}`,
    brief.prompt ? `User prompt: ${brief.prompt}` : "",
    `Platform: ${brief.platform} @ ${brief.aspectRatio}`,
    `Style: ${style.label} (${style.hint})`,
    `Subject: ${subjectDesc}`,
    `Expression: ${brief.expression}`,
    `Background: ${bg.label} — ${bg.prompt}`,
    `Lighting: ${light.label} — ${light.prompt}`,
    `Palette: ${pal.label}${pal.hint ? " — " + pal.hint : ""}`,
    brief.ctrOptions.length ? `CTR optimizations: ${brief.ctrOptions.join(", ")}` : "",
    brief.textMode === "custom" && brief.customText
      ? `Required overlay text: "${brief.customText}"`
      : brief.textMode === "none"
        ? "No overlay text."
        : "Overlay text: auto (invent a punchy 2–5 word hook).",
  ].filter(Boolean).join("\n");
}

/** Ask the AI to expand a brief into a structured, editable render plan. */
export const planThumbnailBrief = createServerFn({ method: "POST" })
  .inputValidator((data: { brief: ThumbnailBrief }) => data)
  .handler(async ({ data }): Promise<PlannedBrief> => {
    const ctx = briefContext(data.brief);
    const plan = await gatewayChatJson<PlannedBrief>({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are an expert YouTube thumbnail art director. Produce concise, punchy plans optimized for high CTR. Return STRICT JSON matching the schema — no prose.",
        },
        {
          role: "user",
          content:
            `Create a thumbnail plan.\n\n${ctx}\n\n` +
            `Return JSON with keys: sceneDescription (string, ≤200 chars), ` +
            `positivePrompt (string, single dense image-gen prompt ≤600 chars), ` +
            `negativePrompt (string, comma list of things to avoid), ` +
            `thumbnailText (string, 2–5 words UPPERCASE), ` +
            `composition (string), cameraAngle (string), lighting (string), ` +
            `colorPalette (string), ctrTips (string[] of 3–5 short tips).`,
        },
      ],
    });
    return {
      sceneDescription: String(plan.sceneDescription ?? ""),
      positivePrompt:   String(plan.positivePrompt   ?? ""),
      negativePrompt:   String(plan.negativePrompt   ?? "blurry, low quality, extra fingers, watermark, text artifacts"),
      thumbnailText:    String(plan.thumbnailText    ?? "").toUpperCase().slice(0, 40),
      composition:      String(plan.composition      ?? ""),
      cameraAngle:      String(plan.cameraAngle      ?? ""),
      lighting:         String(plan.lighting         ?? ""),
      colorPalette:     String(plan.colorPalette     ?? ""),
      ctrTips:          Array.isArray(plan.ctrTips) ? plan.ctrTips.map(String).slice(0, 6) : [],
    };
  });

/** Score a rendered thumbnail across CTR heuristics. */
export const analyzeThumbnailQuality = createServerFn({ method: "POST" })
  .inputValidator((data: { imageDataUrl: string; title: string; text: string }) => data)
  .handler(async ({ data }): Promise<ThumbnailQualityReport> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a YouTube CTR analyst. Score thumbnails 0-100 across dimensions. Return strict JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text:
                `Video: "${data.title}". Overlay text: "${data.text}". ` +
                `Return JSON: { ctrScore, readability, contrast, mobileVisibility, faceDetection, textBalance, brandConsistency, notes: string[] }. ` +
                `All scores 0-100. Notes: 3-5 short improvement tips.`
              },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Analyze failed ${res.status}`);
    const body = await res.json();
    const raw = body?.choices?.[0]?.message?.content ?? "{}";
    const j = JSON.parse((raw.match(/\{[\s\S]*\}/)?.[0]) ?? "{}");
    const num = (v: unknown, d = 70) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d;
    };
    return {
      ctrScore:         num(j.ctrScore),
      readability:      num(j.readability),
      contrast:         num(j.contrast),
      mobileVisibility: num(j.mobileVisibility),
      faceDetection:    num(j.faceDetection),
      textBalance:      num(j.textBalance),
      brandConsistency: num(j.brandConsistency),
      notes:            Array.isArray(j.notes) ? j.notes.map(String).slice(0, 6) : [],
    };
  });

/** Analyze an uploaded thumbnail image and return a ready-to-render brief. */
export const reverseEngineerThumbnail = createServerFn({ method: "POST" })
  .inputValidator((data: { imageDataUrl: string }) => data)
  .handler(async ({ data }): Promise<ReverseEngineered> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You reverse-engineer YouTube thumbnails. Return strict JSON so a designer can recreate the style.",
          },
          {
            role: "user",
            content: [
              { type: "text", text:
                `Analyze this thumbnail. Return JSON: { style, composition, lighting, cameraAngle, ` +
                `colors: string[] (5 hex), prompt (dense image-gen prompt to recreate the style with a NEW topic), ` +
                `negativePrompt, fontSuggestions: string[], textPlacement }.`
              },
              { type: "image_url", image_url: { url: data.imageDataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Reverse-engineer failed ${res.status}`);
    const body = await res.json();
    const raw = body?.choices?.[0]?.message?.content ?? "{}";
    const j = JSON.parse((raw.match(/\{[\s\S]*\}/)?.[0]) ?? "{}");
    return {
      style:           String(j.style ?? ""),
      composition:     String(j.composition ?? ""),
      lighting:        String(j.lighting ?? ""),
      cameraAngle:     String(j.cameraAngle ?? ""),
      colors:          Array.isArray(j.colors) ? j.colors.map(String).slice(0, 8) : [],
      prompt:          String(j.prompt ?? ""),
      negativePrompt:  String(j.negativePrompt ?? ""),
      fontSuggestions: Array.isArray(j.fontSuggestions) ? j.fontSuggestions.map(String).slice(0, 4) : [],
      textPlacement:   String(j.textPlacement ?? ""),
    };
  });
