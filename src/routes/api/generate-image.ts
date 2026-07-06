import { createFileRoute } from "@tanstack/react-router";

// Server route for AI image generation via Lovable AI Gateway.
// Non-streaming: returns { b64_json } after the image is fully rendered.
export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, style, ratio } = (await request.json()) as {
          prompt: string;
          style?: string;
          ratio?: string;
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
            : ratio === "4:5"
            ? "1024x1280"
            : "1024x1024";

        const stylePrefix = style ? `${style} style. ` : "";
        const fullPrompt = `${stylePrefix}${prompt}`;

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-image",
              prompt: fullPrompt,
              size,
              n: 1,
            }),
          }
        );

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

        return new Response(
          JSON.stringify({
            image: b64 ? `data:image/png;base64,${b64}` : url,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
