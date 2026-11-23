import { createFileRoute } from "@tanstack/react-router";
import { voiceoverClipCredits } from "@/lib/tts-pricing";
import { findLanguage } from "@/lib/languages";
import { jobTagFromRequest } from "@/lib/job-credit-tag";
import { fetchWithRetry } from "@/lib/fetch-retry";

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
        const { text, voice, language } = (await request.json()) as { text: string; voice?: string; language?: string };

        const key = process.env.FAL_KEY;
        if (!key) return jsonError("Voice generation is not configured (missing FAL_KEY).", 500);

        const input = (text ?? "").trim();
        if (!input) return jsonError("text required", 400);

        // Scenes are one or two sentences by design; cap to keep cost bounded.
        const clipped = input.length > 800 ? input.slice(0, 800) : input;
        const elevenVoice = VOICE_MAP[(voice ?? "alloy").toLowerCase()] ?? voice ?? "Aria";

        const { ACTION_COSTS, chargeCredits } = await import("@/lib/credits-guard.server");
        // Voice language: the one the user chose, else guessed from the script.
        // Turbo v2.5 covers 32 languages; the rest go to Eleven v3 (twice the
        // provider price, so twice the credits). Some languages have no AI
        // voice at all — say so instead of reading them wrongly.
        const { detectTopicLanguage } = await import("@/lib/content-language");
        const langInfo = findLanguage(language) ?? findLanguage(detectTopicLanguage(clipped));
        if (!langInfo?.voice) {
          return jsonError(`No AI voice is available for ${langInfo?.id ?? "this language"} yet. Pick a voice language or turn voiceover off.`, 422);
        }
        const lang = langInfo.id;
        const v3Code = langInfo.voice === "v3" ? langInfo.code : null;
        const credits = voiceoverClipCredits(clipped.length, lang) * ACTION_COSTS.tts_per_100_chars;
        let reservation: Awaited<ReturnType<typeof chargeCredits>>;
        try {
          reservation = await chargeCredits({ userId, action: "voiceover", amount: credits, description: "Voiceover", jobTag: jobTagFromRequest(request) });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return jsonError(msg.startsWith("insufficient_credits:") ? `Not enough credits: this voiceover needs ${credits}.` : msg, msg.startsWith("insufficient_credits:") ? 402 : 400);
        }

        // The voice provider rate-limits bursts (a 12-scene video asks for 12
        // clips at once). Retry 429/5xx a few times with backoff before
        // giving up and refunding.
        const endpoint = v3Code ? "https://fal.run/fal-ai/elevenlabs/tts/eleven-v3" : "https://fal.run/fal-ai/elevenlabs/tts/turbo-v2.5";
        const codeForModel = v3Code ?? (langInfo.code !== "en" ? langInfo.code : null);
        const call = (withCode: boolean) => fetchWithRetry(endpoint, {
          method: "POST",
          headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: clipped, voice: elevenVoice, ...(withCode && codeForModel ? { language_code: codeForModel } : {}) }),
        });
        let upstream = await call(true);
        // A model can reject a language code it spells differently; it still
        // detects the language from the text, so retry once without the code.
        if (!upstream.ok && codeForModel && (upstream.status === 400 || upstream.status === 422)) {
          upstream = await call(false);
        }
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
