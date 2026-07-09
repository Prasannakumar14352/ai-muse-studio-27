// Thumbnail Pipeline — turns a `ThumbnailConcept` into real image layers.
//
// Layer generation uses the /api/generate-image endpoint (gpt-image-2).
// Background layer: opaque, 16:9.
// Subject layer:    transparent PNG (background: "transparent") so the UI can
//                   composite it over the background, apply lighting, and
//                   render the HTML/CSS text overlay on top.

import type { ThumbnailConcept } from "@/lib/thumbnail-director";

export type LayerImageResult = {
  key: "background" | "subject" | "secondary";
  dataUrl: string | null;
  error?: string;
};

export type RenderedThumbnail = {
  concept: ThumbnailConcept;
  background: string | null;
  subject: string | null;
  secondary: string | null;
  errors: string[];
};

export type ThumbnailProgress = {
  conceptId: string;
  step: "background" | "subject" | "secondary" | "done";
  ok: boolean;
  message?: string;
};

import { fetchGeneratedImage } from "@/lib/image-stream";

async function generateImage(
  prompt: string,
  opts: { ratio: "16:9" | "1:1"; transparent: boolean; quality?: "low" | "medium" | "high" },
): Promise<string | null> {
  const { image } = await fetchGeneratedImage({
    prompt,
    ratio: opts.ratio,
    background: opts.transparent ? "transparent" : "opaque",
    quality: opts.quality ?? "medium",
  });
  return image;
}

/** Run all layers for one concept. */
export async function renderConcept(
  concept: ThumbnailConcept,
  onProgress?: (p: ThumbnailProgress) => void,
): Promise<RenderedThumbnail> {
  const errors: string[] = [];

  onProgress?.({ conceptId: concept.id, step: "background", ok: false });
  const bg = await generateImage(concept.backgroundPrompt, { ratio: "16:9", transparent: false, quality: "medium" });
  if (!bg) errors.push("Background failed");
  onProgress?.({ conceptId: concept.id, step: "background", ok: Boolean(bg) });

  onProgress?.({ conceptId: concept.id, step: "subject", ok: false });
  const subj = await generateImage(concept.subjectPrompt, { ratio: "1:1", transparent: true, quality: "medium" });
  if (!subj) errors.push("Subject failed");
  onProgress?.({ conceptId: concept.id, step: "subject", ok: Boolean(subj) });

  let sec: string | null = null;
  if (concept.secondarySubjectPrompt) {
    onProgress?.({ conceptId: concept.id, step: "secondary", ok: false });
    sec = await generateImage(concept.secondarySubjectPrompt, { ratio: "1:1", transparent: true, quality: "medium" });
    if (!sec) errors.push("Secondary subject failed");
    onProgress?.({ conceptId: concept.id, step: "secondary", ok: Boolean(sec) });
  }

  onProgress?.({ conceptId: concept.id, step: "done", ok: errors.length === 0 });
  return { concept, background: bg, subject: subj, secondary: sec, errors };
}

/** Regenerate a single layer without touching the others. */
export async function regenerateLayer(
  concept: ThumbnailConcept,
  layer: "background" | "subject" | "secondary",
): Promise<string | null> {
  if (layer === "background") return generateImage(concept.backgroundPrompt, { ratio: "16:9", transparent: false, quality: "medium" });
  if (layer === "subject")    return generateImage(concept.subjectPrompt,    { ratio: "1:1", transparent: true,  quality: "medium" });
  if (layer === "secondary" && concept.secondarySubjectPrompt)
    return generateImage(concept.secondarySubjectPrompt, { ratio: "1:1", transparent: true, quality: "medium" });
  return null;
}
