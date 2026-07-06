import { createFileRoute } from "@tanstack/react-router";

// Server route for Lovable AI text-to-speech.
// Non-streaming: returns an MP3 file the client can decode into an AudioBuffer
// and mix into the MediaRecorder audio track when rendering a UGC video.
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text, voice } = (await request.json()) as {
          text: string;
          voice?: string;
        };

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const input = (text ?? "").trim();
        if (!input) {
          return new Response(JSON.stringify({ error: "text required" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Cap per-scene voiceover length so we stay well within the model's
        // input limit; scenes are one or two sentences by design.
        const clipped = input.length > 800 ? input.slice(0, 800) : input;

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/speech",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: clipped,
              voice: voice || "alloy",
              response_format: "mp3",
            }),
          }
        );

        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          return new Response(
            JSON.stringify({ error: errText || "TTS failed" }),
            { status: upstream.status || 502, headers: { "Content-Type": "application/json" } }
          );
        }

        // Forward the mp3 bytes to the browser.
        return new Response(upstream.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
