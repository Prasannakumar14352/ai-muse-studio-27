import { createFileRoute } from "@tanstack/react-router";
import { ADVANCED_VIDEO_FEATURE_FLAG, isAdvancedVideoModel } from "@/lib/advanced-video-models";
import { jobTagFromRequest } from "@/lib/job-credit-tag";

// Real-motion clip for one story beat: animates the beat's still image with an
// image-to-video model on fal.ai.
//
//   POST { image, prompt, beatSeconds, tier }  → { ok: true, token, credits, seconds }
//   then poll POST /api/video-clip-status { token } until the clip is ready.
//
// Credits are reserved here and finalized (or refunded) by the status route,
// so a failed clip never costs the user anything. Generation takes ~1–3 min,
// which is why this is a queue + poll instead of one long request.

export const Route = createFileRoute("/api/generate-video-clip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        const userId = await getUserIdFromRequest(request);
        if (!userId) return unauthorized();

        let body: {
          image?: string;
          prompt?: string;
          beatSeconds?: number;
          tier?: string;
          model?: string;
        };
        try { body = await request.json(); } catch { return Response.json({ ok: false, reason: "bad_json" }, { status: 400 }); }

        if (!body || typeof body !== "object") {
          return Response.json({ ok: false, reason: "bad_json" }, { status: 400 });
        }
        if (isAdvancedVideoModel(body.model)) {
          const enabled = process.env[ADVANCED_VIDEO_FEATURE_FLAG] === "true";
          return Response.json(
            {
              ok: false,
              reason: enabled ? "advanced_video_schema_unverified" : "advanced_video_disabled",
            },
            { status: 503 },
          );
        }
        if (body.model !== undefined && body.model !== "standard" && body.model !== "premium") {
          return Response.json({ ok: false, reason: "unknown_video_model" }, { status: 400 });
        }
        if (
          (body.image !== undefined && typeof body.image !== "string") ||
          (body.prompt !== undefined && typeof body.prompt !== "string")
        ) {
          return Response.json({ ok: false, reason: "invalid_clip_input" }, { status: 400 });
        }
        const image = (body.image ?? "").trim();
        const prompt = (body.prompt ?? "").trim();
        if (!image || !/^(https:\/\/|data:image\/)/.test(image)) {
          return Response.json({ ok: false, reason: "image_required" }, { status: 400 });
        }
        if (!prompt) return Response.json({ ok: false, reason: "prompt_required" }, { status: 400 });

        const { MOTION_MODELS, clipSecondsFor, motionClipCredits } = await import("@/lib/motion-clips");
        const tier = (body.model ?? body.tier) === "premium" ? "premium" : "standard";
        const model = MOTION_MODELS[tier];
        const beatSeconds = Math.max(1, Math.min(15, Number(body.beatSeconds) || 4));
        const seconds = clipSecondsFor(tier, beatSeconds);
        const credits = motionClipCredits(tier, beatSeconds);

        const { isFalConfigured, falSubmit } = await import("@/lib/fal.server");
        if (!isFalConfigured()) return Response.json({ ok: false, reason: "video_model_not_configured" });

        const { chargeCredits } = await import("@/lib/credits-guard.server");
        let reservation: Awaited<ReturnType<typeof chargeCredits>>;
        try {
          reservation = await chargeCredits({
            userId,
            jobTag: jobTagFromRequest(request),
            action: "motion_clip",
            amount: credits,
            description: `Motion clip (${tier}, ${seconds}s)`,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.startsWith("insufficient_credits:")) {
            return Response.json({ ok: false, reason: "insufficient_credits", credits }, { status: 402 });
          }
          return Response.json({ ok: false, reason: msg.slice(0, 200) }, { status: 400 });
        }

        const input: Record<string, unknown> = tier === "premium"
          ? {
              prompt: prompt.slice(0, 2400),
              image_url: image,
              duration: String(seconds),
              negative_prompt: "text, captions, letters, watermark, logo, blur, distortion, morphing faces, extra people",
            }
          : {
              prompt: prompt.slice(0, 4000),
              image_url: image,
              duration: seconds,
              resolution: "768P",
              prompt_expansion_mode: "balanced",
            };

        try {
          const job = await falSubmit(model.endpoint, input);
          if (!reservation.ledgerId) throw new Error("No credit reservation");
          const { signClipToken } = await import("@/lib/motion-clips.server");
          const token = signClipToken({
            u: userId, l: reservation.ledgerId, s: job.statusUrl, r: job.responseUrl,
            e: Date.now() + 60 * 60 * 1000,
          });
          return Response.json({ ok: true, token, credits, seconds, model: model.endpoint });
        } catch (e) {
          await reservation.refund("provider_submit_failed");
          return Response.json({ ok: false, reason: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 502 });
        }
      },
    },
  },
});
