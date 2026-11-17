import { createFileRoute } from "@tanstack/react-router";

/**
 * Streaming image-generation endpoint.
 *
 * The previous implementation buffered the entire upstream response before
 * responding, which regularly tripped Cloudflare's 100s origin timeout (524)
 * on high-quality `openai/gpt-image-2` renders. This version:
 *
 *   1. Uses `google/gemini-3.1-flash-image` by default (much faster, still
 *      pro-tier quality), with an opt-in escape hatch for `openai/gpt-image-2`.
 *   2. Requests `stream: true` and pipes the upstream SSE body straight
 *      through to the browser — bytes start flowing within a couple seconds
 *      so Cloudflare never times out.
 *
 * The client parses the stream, keeps the latest partial for a live preview,
 * and treats the final `image_generation.completed` frame as the finished PNG.
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

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return json({ error: "Missing LOVABLE_API_KEY" }, 500);
        }
        if (!prompt || !prompt.trim()) {
          return json({ error: "Prompt required" }, 400);
        }

        const size =
          ratio === "9:16"
            ? "1024x1536"
            : ratio === "16:9"
              ? "1536x1024"
              : "1024x1024";

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

        const model = modelOverride ?? "google/gemini-3.1-flash-image";

        // Collect all attached images (edit source + refs + style refs).
        const allImages: string[] = [];
        if (image) allImages.push(image);
        if (referenceImages?.length) allImages.push(...referenceImages);
        if (styleImages?.length) {
          if (styleImages.length) {
            allImages.push(...styleImages);
          }
        }

        // Build request body per model family (see ai-image-generation).
        let body: Record<string, unknown>;
        if (model.startsWith("openai/")) {
          body = {
            model,
            prompt: fullPrompt,
            size,
            quality: quality ?? "medium",
            n: 1,
            stream: true,
            partial_images: 1,
          };
          if (background === "transparent") body.background = "transparent";
        } else {
          // Gemini chat-completions image shape. Include any attached images.
          const content: unknown = allImages.length
            ? [
                { type: "text", text: fullPrompt },
                ...allImages.map((url) => ({ type: "image_url", image_url: { url } })),
              ]
            : fullPrompt;
          body = {
            model,
            messages: [{ role: "user", content }],
            modalities: ["image", "text"],
            stream: true,
          };
        }

        let upstream: Response;
        try {
          upstream = await fetch(
            "https://ai.gateway.lovable.dev/v1/images/generations",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            },
          );
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Image service unreachable",
            },
            502,
          );
        }

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return json({ error: text || "Image generation failed" }, upstream.status);
        }

        // Pipe SSE straight to the client. Bytes flow immediately, so
        // Cloudflare doesn't time out and the browser can render partials.
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Image-Model": model,
          },
        });
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
