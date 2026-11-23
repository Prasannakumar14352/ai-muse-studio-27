import { createFileRoute } from "@tanstack/react-router";

// GET ?voice=<voice id>&lang=<language> — a short, free preview of a narrator
// voice, in the user's language where we have a sample line. Each sample is
// generated once (a fraction of a cent), stored, and reused for everyone.

export const Route = createFileRoute("/api/voice-sample")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        if (!(await getUserIdFromRequest(request))) return unauthorized();
        const { VOICES } = await import("@/lib/constants");
        const { VOICE_CATALOG, SAMPLE_TEXTS } = await import("@/lib/voice-catalog");
        const { findLanguage } = await import("@/lib/languages");
        const params = new URL(request.url).searchParams;
        const id = params.get("voice") ?? "";
        // Project brief voices (id → ElevenLabs name) or catalog voices (id is the name).
        const brief = VOICES.find((v) => v.id === id);
        const catalog = VOICE_CATALOG.find((v) => v.id === id);
        const voice = brief ? { id: brief.id, tts: brief.tts } : catalog ? { id: catalog.id, tts: catalog.id } : null;
        if (!voice) return json({ error: "Unknown voice" }, 400);
        const reqLang = params.get("lang") ?? "English";
        const lang = SAMPLE_TEXTS[reqLang] ? reqLang : "English";
        const langInfo = findLanguage(lang);
        const sampleText = SAMPLE_TEXTS[lang];

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const path = lang === "English" ? `_samples/voice-${voice.id}.mp3` : `_samples/voice-${voice.id}-${langInfo?.code ?? "en"}.mp3`;
        const bucket = supabaseAdmin.storage.from("renders");
        const existing = await bucket.createSignedUrl(path, 60 * 60);
        if (existing.data?.signedUrl) {
          const head = await fetch(existing.data.signedUrl, { method: "HEAD" }).catch(() => null);
          if (head?.ok) return json({ url: existing.data.signedUrl });
        }

        const key = process.env.FAL_KEY;
        if (!key) return json({ error: "Voice previews aren't configured" }, 500);
        const v3 = langInfo?.voice === "v3";
        const up = await fetch(`https://fal.run/fal-ai/elevenlabs/tts/${v3 ? "eleven-v3" : "turbo-v2.5"}`, {
          method: "POST",
          headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: sampleText, voice: voice.tts, ...(lang !== "English" && langInfo ? { language_code: langInfo.code } : {}) }),
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
