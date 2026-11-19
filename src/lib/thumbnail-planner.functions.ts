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
import {
  buildUniversalThumbnailPrompt,
  needsOverlayScript,
  formatFromAspectRatio,
  getFormat,
} from "@/lib/thumbnail-formats";
import { aiChatFetch, aiKey, AI_NOT_CONFIGURED } from "@/lib/ai-provider";

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
    brief.overrideSubjectAction ? `User override — subject action: ${brief.overrideSubjectAction}` : "",
    brief.overrideBackground    ? `User override — background: ${brief.overrideBackground}` : "",
    brief.overrideCameraAngle   ? `User override — camera angle: ${brief.overrideCameraAngle}` : "",
    brief.subjectImage ? "A primary subject reference image has been uploaded — its facial identity MUST be preserved exactly." : "",
    brief.textMode === "custom" && brief.customText
      ? `Required overlay text: "${brief.customText}"`
      : brief.textMode === "none"
        ? "No overlay text."
        : "Overlay text: auto (invent a punchy 2–4 word hook).",
  ].filter(Boolean).join("\n");
}

/**
 * Ask the AI Thumbnail Optimizer to infer creative decisions (subject action,
 * expression, camera angle, background, thumbnail text, text placement,
 * lighting/color grading) for the given topic, then build the FINAL image-gen
 * prompt using the single universal template driven by the selected format.
 */
export const planThumbnailBrief = createServerFn({ method: "POST" })
  .inputValidator((data: { brief: ThumbnailBrief }) => data)
  .handler(async ({ data }): Promise<PlannedBrief> => {
    const ctx = briefContext(data.brief);
    const format = getFormat(formatFromAspectRatio(data.brief.aspectRatio, data.brief.platform));

    type Optimized = {
      sceneDescription: string;
      subjectAction: string;
      subjectExpression: string;
      cameraAngle: string;
      backgroundDescription: string;
      thumbnailText: string;
      textPlacement: string;
      lighting: string;
      colorPalette: string;
      composition: string;
      negativePrompt: string;
      ctrTips: string[];
    };

    const optimized = await gatewayChatJson<Optimized>({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are the AI Thumbnail Optimizer — an expert art director for viral thumbnails across ANY niche. " +
            "Infer the strongest creative choices (facial expression, subject pose/action, camera angle, background, " +
            "thumbnail text of 2–4 impactful words, text placement that NEVER covers the face, lighting, and color " +
            "grading) tailored to the topic and target format. Respect user overrides when provided. " +
            "Return STRICT JSON — no prose.",
        },
        {
          role: "user",
          content:
            `Target format: ${format.label} (${format.ratio}, ${format.outputWidth}x${format.outputHeight}).\n` +
            `Composition rule: ${format.compositionRule}\n` +
            `Text placement rule: ${format.textPlacement}\n\n` +
            `${ctx}\n\n` +
            `Return JSON with keys: sceneDescription, subjectAction, subjectExpression, cameraAngle, ` +
            `backgroundDescription, thumbnailText (2–4 UPPERCASE words), textPlacement, lighting, colorPalette, ` +
            `composition, negativePrompt (comma list), ctrTips (string[] of 3–5 short tips).`,
        },
      ],
    });

    // Force user overrides to win over AI inference.
    const subjectAction     = data.brief.overrideSubjectAction || optimized.subjectAction || "";
    const backgroundDesc    = data.brief.overrideBackground    || optimized.backgroundDescription || "";
    const cameraAngle       = data.brief.overrideCameraAngle   || optimized.cameraAngle || "";
    const thumbnailText =
      data.brief.textMode === "none"
        ? ""
        : data.brief.textMode === "custom"
          ? (data.brief.customText || "").toUpperCase()
          : String(optimized.thumbnailText ?? "").toUpperCase().slice(0, 40);
    const subjectExpression =
      data.brief.expression && data.brief.expression !== "none"
        ? data.brief.expression
        : (optimized.subjectExpression || "confident, engaging");

    // Image models garble Indic/Arabic scripts. If the topic or the text uses one,
    // the app draws the text itself and the model is told to draw none — even when
    // the hook text is English, the model tends to add regional text on its own.
    // Image models also misspell English ("AII BROKE ME"), so the headline is
    // ALWAYS drawn by the app as an editable text layer; the model draws none.
    const textOverlay = !!thumbnailText;
    void needsOverlayScript;

    // Build the FINAL image-generation prompt from the single universal template.
    const positivePrompt = buildUniversalThumbnailPrompt(format, {
      TOPIC: data.brief.title || data.brief.prompt || "",
      SUBJECT_ACTION: subjectAction,
      SUBJECT_EXPRESSION: subjectExpression,
      BACKGROUND_DESCRIPTION: backgroundDesc,
      THUMBNAIL_TEXT: thumbnailText,
      ASPECT_RATIO: format.ratio,
      hasUploadedSubject: Boolean(data.brief.subjectImage),
      textOverlay,
    });

    return {
      sceneDescription: String(optimized.sceneDescription ?? ""),
      positivePrompt,
      negativePrompt:   String(optimized.negativePrompt   ?? "blurry, low quality, extra fingers, watermark, text artifacts, misspelled text, distorted face"),
      thumbnailText,
      textOverlay,
      composition:      String(optimized.composition      ?? format.compositionRule),
      cameraAngle:      cameraAngle,
      lighting:         String(optimized.lighting         ?? ""),
      colorPalette:     String(optimized.colorPalette     ?? ""),
      ctrTips:          Array.isArray(optimized.ctrTips) ? optimized.ctrTips.map(String).slice(0, 6) : [],
    };
  });


/** Score a rendered thumbnail across CTR heuristics. */
export const analyzeThumbnailQuality = createServerFn({ method: "POST" })
  .inputValidator((data: { imageDataUrl: string; title: string; text: string }) => data)
  .handler(async ({ data }): Promise<ThumbnailQualityReport> => {
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);
    const res = await aiChatFetch({
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
    const key = aiKey();
    if (!key) throw new Error(AI_NOT_CONFIGURED);
    const res = await aiChatFetch({
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
