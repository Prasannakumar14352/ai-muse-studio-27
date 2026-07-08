import { createFileRoute } from "@tanstack/react-router";

// Server route for AI image generation via Lovable AI Gateway.
// Non-streaming: returns { b64_json } after the image is fully rendered.
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, style, ratio, background, quality } = (await request.json()) as {
          prompt: string;
          style?: string;
          ratio?: string;
          /** "transparent" produces a subject on a transparent PNG (great for thumbnail layer compositing). */
          background?: "transparent" | "opaque";
          /** "low" | "medium" | "high" — thumbnails default to "medium". */
          quality?: "low" | "medium" | "high";
        };

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (!prompt || !prompt.trim()) {
          return new Response(JSON.stringify({ error: "Prompt required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Map aspect ratio to a size the model accepts.
        const size =
          ratio === "9:16"
            ? "1024x1536"
            : ratio === "16:9"
            ? "1536x1024"
            : "1024x1024";

        const stylePrefix = style ? `${style} style. ` : "";
        const fullPrompt = `${stylePrefix}${prompt}`;
        const chosenQuality = quality ?? "low";

        type ImageReqBody = {
          model: string;
          prompt: string;
          size: string;
          quality: string;
          n: number;
          background?: "transparent" | "opaque";
        };
        const body: ImageReqBody = {
          model: "openai/gpt-image-2",
          prompt: fullPrompt,
          size,
          quality: chosenQuality,
          n: 1,
        };
        if (background === "transparent") body.background = "transparent";

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
            }
          );
        } catch (error) {
          return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Image service unreachable" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          return new Response(
            JSON.stringify({ error: text || "Image generation failed" }),
            { status: upstream.status, headers: { "Content-Type": "application/json" } }
          );
        }

        const json = (await upstream.json()) as {
          data?: Array<{ b64_json?: string; url?: string }>;
        };
        const first = json.data?.[0];
        const b64 = first?.b64_json;
        const url = first?.url;
        if (!b64 && !url) {
          return new Response(JSON.stringify({ error: "No image returned" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        let image = b64 ? `data:image/png;base64,${b64}` : url!;
        if (!b64 && url) {
          try {
            const imageResponse = await fetch(url);
            if (imageResponse.ok) {
              const contentType = imageResponse.headers.get("content-type") || "image/png";
              const bytes = await imageResponse.arrayBuffer();
              const encoded = Buffer.from(bytes).toString("base64");
              image = `data:${contentType};base64,${encoded}`;
            }
          } catch {
            // Fall back to the provider URL. The client has a second fallback path.
          }
        }

        return new Response(
          JSON.stringify({
            image,
            debug: {
              model: "openai/gpt-image-2",
              size,
              quality: chosenQuality,
              n: 1,
              background: background === "transparent" ? "transparent" : "opaque",
              fullPrompt,
              originalPrompt: prompt,
              stylePrefix: stylePrefix || null,
            },
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
