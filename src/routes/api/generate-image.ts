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
        const {
          prompt,
          style,
          ratio,
          background,
          quality,
          model: modelOverride,
          image,
        } = (await request.json()) as {
          prompt: string;
          style?: string;
          ratio?: string;
          background?: "transparent" | "opaque";
          quality?: "low" | "medium" | "high";
          model?: string;
          image?: string;
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
        const fullPrompt = `${stylePrefix}${prompt}`;
        // Editing an input image needs a multimodal-capable Gemini image model.
        const model = modelOverride ?? (image ? "google/gemini-3.1-flash-image" : "google/gemini-3.1-flash-image");

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
          // Gemini chat-completions image shape. If editing, include image_url.
          const content: unknown = image
            ? [
                { type: "text", text: fullPrompt },
                { type: "image_url", image_url: { url: image } },
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
