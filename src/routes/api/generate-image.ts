import { createFileRoute } from "@tanstack/react-router";

/**
 * Image generation / editing endpoint, served by fal.ai.
 *
 *   - Plain generation → fal-ai/nano-banana (Google Gemini image model,
 *     the same family the app used through Lovable's gateway)
 *   - Any input image or edit op (upscale, remove background, inpaint,
 *     outpaint, eraser, references) → fal-ai/nano-banana/edit
 *
 * Returns JSON { image: <data URL> }; the client helper (image-stream.ts)
 * already accepts this non-streaming shape. Requires FAL_KEY.
 */
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        if (!(await getUserIdFromRequest(request))) return unauthorized();
        const {
          prompt,
          style,
          ratio,
          background,
          quality,
          model: modelOverride,
          image,
          referenceImages,
          styleImages,
          negativePrompt,
          seed,
          cfg,
          styleStrength,
          operation,
          maskHint,
          outpaintDirection,
        } = (await request.json()) as {
          prompt: string;
          style?: string;
          ratio?: string;
          background?: "transparent" | "opaque";
          quality?: "low" | "medium" | "high";
          model?: string;
          image?: string;
          referenceImages?: string[];
          styleImages?: string[];
          negativePrompt?: string;
          seed?: number;
          cfg?: number;
          styleStrength?: number;
          operation?: "generate" | "upscale" | "removeBg" | "inpaint" | "outpaint" | "eraser";
          maskHint?: string;
          outpaintDirection?: "left" | "right" | "top" | "bottom" | "all";
        };

        const key = process.env.FAL_KEY;
        if (!key) {
          return json({ error: "Image generation is not configured (missing FAL_KEY)." }, 500);
        }
        if (!prompt || !prompt.trim()) {
          return json({ error: "Prompt required" }, 400);
        }

        const stylePrefix = style ? `${style} style. ` : "";

        // Editing op prefix — natural-language instruction the model can follow.
        let opPrefix = "";
        switch (operation) {
          case "upscale":
            opPrefix = "Upscale this image to higher resolution. Preserve every detail; sharpen textures; do not restyle or recompose. ";
            break;
          case "removeBg":
            opPrefix = "Remove the background completely. Output the subject on a fully transparent background (or pure white if transparency unavailable). Preserve edges and hair. ";
            break;
          case "inpaint":
            opPrefix = `Inpaint / replace this region: ${maskHint || "the described area"}. Match lighting, perspective, and grain of the rest of the image. `;
            break;
          case "outpaint":
            opPrefix = `Extend / outpaint this image on the ${outpaintDirection ?? "all"} side(s). Seamlessly continue the scene, lighting, and style. `;
            break;
          case "eraser":
            opPrefix = `Magic-erase: remove ${maskHint || "the described object"} from the image and cleanly fill the background where it was. Do not add anything else. `;
            break;
        }

        const negativeSuffix = negativePrompt?.trim()
          ? ` Avoid: ${negativePrompt.trim()}.`
          : "";
        const hintsSuffix = [
          seed !== undefined ? `seed:${seed}` : null,
          cfg !== undefined ? `guidance:${cfg}` : null,
          styleStrength !== undefined ? `style_strength:${styleStrength}` : null,
        ]
          .filter(Boolean)
          .join(" ");
        const hintsLine = hintsSuffix ? ` [${hintsSuffix}]` : "";

        const fullPrompt = `${opPrefix}${stylePrefix}${prompt}${negativeSuffix}${hintsLine}`;

        // Collect all attached images (edit source + refs + style refs).
        const allImages: string[] = [];
        if (image) allImages.push(image);
        if (referenceImages?.length) allImages.push(...referenceImages);
        if (styleImages?.length) allImages.push(...styleImages);

        const isEdit = allImages.length > 0 || (!!operation && operation !== "generate");
        if (isEdit && allImages.length === 0) {
          return json({ error: "This edit needs an input image." }, 400);
        }
        const endpoint = isEdit ? "fal-ai/nano-banana/edit" : "fal-ai/nano-banana";
        const RATIOS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"];
        const aspect = ratio && RATIOS.includes(ratio) ? ratio : isEdit ? "auto" : "1:1";

        const input: Record<string, unknown> = {
          prompt: fullPrompt,
          num_images: 1,
          aspect_ratio: aspect,
          output_format: background === "transparent" || operation === "removeBg" ? "png" : "jpeg",
          sync_mode: true,
        };
        if (isEdit) input.image_urls = allImages;
        if (typeof seed === "number") input.seed = seed;
        void quality; void modelOverride;

        let upstream: Response;
        try {
          upstream = await fetch(`https://fal.run/${endpoint}`, {
            method: "POST",
            headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Image service unreachable" }, 502);
        }

        const out = (await upstream.json().catch(() => ({}))) as {
          images?: Array<{ url?: string; content_type?: string }>;
          detail?: unknown;
        };
        if (!upstream.ok) {
          const detail = typeof out.detail === "string" ? out.detail : JSON.stringify(out.detail ?? out);
          return json({ error: `Image generation failed (${upstream.status}): ${detail.slice(0, 300)}` }, upstream.status);
        }
        let url = out.images?.[0]?.url;
        if (!url) return json({ error: "No image returned" }, 502);

        // sync_mode returns a data URI; fall back to fetching a hosted URL.
        if (!url.startsWith("data:")) {
          const img = await fetch(url);
          const buf = Buffer.from(await img.arrayBuffer());
          url = `data:${img.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`;
        }
        return json({ image: url, model: endpoint });
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
