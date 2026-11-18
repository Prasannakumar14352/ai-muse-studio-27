import { createFileRoute } from "@tanstack/react-router";

// GET ?voice=<brief voice id> — a short, free preview of a narrator voice.
// Each sample is generated once (a fraction of a cent), stored, and reused.
const SAMPLE_TEXT = "Hi! This is how I'll narrate your next video. Ready when you are.";

export const Route = createFileRoute("/api/voice-sample")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        if (!(await getUserIdFromRequest(request))) return unauthorized();
        const { VOICES } = await import("@/lib/constants");
        const id = new URL(request.url).searchParams.get("voice") ?? "";
        const voice = VOICES.find((v) => v.id === id);
        if (!voice) return json({ error: "Unknown voice" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const path = `_samples/voice-${voice.id}.mp3`;
        const bucket = supabaseAdmin.storage.from("renders");
        const existing = await bucket.createSignedUrl(path, 60 * 60);
        if (existing.data?.signedUrl) {
          const head = await fetch(existing.data.signedUrl, { method: "HEAD" }).catch(() => null);
          if (head?.ok) return json({ url: existing.data.signedUrl });
        }

        const key = process.env.FAL_KEY;
        if (!key) return json({ error: "Voice previews aren't configured" }, 500);
        const up = await fetch("https://fal.run/fal-ai/elevenlabs/tts/turbo-v2.5", {
          method: "POST",
          headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: SAMPLE_TEXT, voice: voice.tts }),
        });
        const out = (await up.json().catch(() => ({}))) as { audio?: { url?: string } };
        if (!up.ok || !out.audio?.url) return json({ error: `Preview unavailable (${up.status})` }, 502);
        const audio = await fetch(out.audio.url);
        if (!audio.ok) return json({ error: "Preview download failed" }, 502);
        await bucket.upload(path, new Uint8Array(await audio.arrayBuffer()), { contentType: "audio/mpeg", upsert: true });
        const signed = await bucket.createSignedUrl(path, 60 * 60);
        return json({ url: signed.data?.signedUrl ?? out.audio.url });
      },
    },
  },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
