import { createFileRoute } from "@tanstack/react-router";

// Beat-level AI video clip generation.
//
// Contract: POST { prompt, style, ratio, duration } → { ok: true, clip: <data URL mp4> }
// or { ok: false, reason }. The client's beat visual pipeline calls this first
// for every beat and falls back to a still image on any non-ok response.
//
// Not wired to a video model: this always returns { ok: false } so the video
// pipeline uses still images. (Paid per-clip video lives in Model Studio,
// which charges credits per second; enabling it here would need the same.)

export const Route = createFileRoute("/api/generate-video-clip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        if (!(await getUserIdFromRequest(request))) return unauthorized();
        try {
          const body = (await request.json()) as {
            prompt?: string; style?: string; ratio?: string; duration?: number;
          };
          const prompt = (body.prompt ?? "").trim();
          if (!prompt) {
            return Response.json({ ok: false, reason: "prompt required" }, { status: 400 });
          }
          // Return ok:false so callers cleanly fall back to still images.
          return Response.json({
            ok: false,
            reason: "video_model_not_configured",
          });
        } catch (e) {
          return Response.json(
            { ok: false, reason: e instanceof Error ? e.message : String(e) },
            { status: 200 },
          );
        }
      },
    },
  },
});
