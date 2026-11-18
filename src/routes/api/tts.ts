import { createFileRoute } from "@tanstack/react-router";

// Text-to-speech via fal.ai (ElevenLabs Turbo v2.5, multilingual).
// Returns MP3 bytes so callers can decode it into an AudioBuffer exactly as
// before. Voice ids from the old OpenAI voices are mapped to ElevenLabs ones.
const VOICE_MAP: Record<string, string> = {
  alloy: "Aria",
  nova: "Sarah",
  shimmer: "Laura",
  onyx: "Roger",
  ash: "George",
  echo: "Brian",
  fable: "Charlie",
};

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        const userId = await getUserIdFromRequest(request);
        if (!userId) return unauthorized();
        const { text, voice } = (await request.json()) as { text: string; voice?: string };

        const key = process.env.FAL_KEY;
        if (!key) return jsonError("Voice generation is not configured (missing FAL_KEY).", 500);

        const input = (text ?? "").trim();
        if (!input) return jsonError("text required", 400);

        // Scenes are one or two sentences by design; cap to keep cost bounded.
        const clipped = input.length > 800 ? input.slice(0, 800) : input;
        const elevenVoice = VOICE_MAP[(voice ?? "alloy").toLowerCase()] ?? voice ?? "Aria";

        const { ACTION_COSTS, chargeCredits } = await import("@/lib/credits-guard.server");
        // Turbo v2.5 can't speak Telugu, Kannada, Malayalam, Bengali or
        // Gujarati — those go to Eleven v3 (twice the provider price, so
        // twice the credits).
        const { detectTopicLanguage } = await import("@/lib/content-language");
        const lang = detectTopicLanguage(clipped);
        const V3_CODES: Record<string, string> = { Telugu: "te", Kannada: "kn", Malayalam: "ml", Bengali: "bn", Gujarati: "gu" };
        const v3Code = V3_CODES[lang];
        const credits = Math.max(1, Math.ceil(clipped.length / 100)) * ACTION_COSTS.tts_per_100_chars * (v3Code ? 2 : 1);
        let reservation: Awaited<ReturnType<typeof chargeCredits>>;
        try {
          reservation = await chargeCredits({ userId, action: "voiceover", amount: credits, description: "Voiceover" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return jsonError(msg.startsWith("insufficient_credits:") ? `Not enough credits: this voiceover needs ${credits}.` : msg, msg.startsWith("insufficient_credits:") ? 402 : 400);
        }

        const upstream = await fetch(
          v3Code ? "https://fal.run/fal-ai/elevenlabs/tts/eleven-v3" : "https://fal.run/fal-ai/elevenlabs/tts/turbo-v2.5",
          {
            method: "POST",
            headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(v3Code
              ? { text: clipped, voice: elevenVoice, language_code: v3Code }
              : { text: clipped, voice: elevenVoice }),
          },
        );
        const out = (await upstream.json().catch(() => ({}))) as { audio?: { url?: string }; detail?: unknown };
        if (!upstream.ok || !out.audio?.url) {
          await reservation.refund(`provider_${upstream.status}`);
          return jsonError(`TTS failed (${upstream.status}): ${JSON.stringify(out.detail ?? out).slice(0, 300)}`, upstream.status || 502);
        }

        const audio = await fetch(out.audio.url);
        if (!audio.ok || !audio.body) {
          await reservation.refund("download_failed");
          return jsonError("Could not download generated audio", 502);
        }
        await reservation.finalize();
        return new Response(audio.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
      },
    },
  },
});

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
