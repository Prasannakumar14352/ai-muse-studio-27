import { createFileRoute } from "@tanstack/react-router";

// Beat-level AI video clip generation.
//
// Contract: POST { prompt, style, ratio, duration } → { ok: true, clip: <data URL mp4> }
// or { ok: false, reason }. The client's beat visual pipeline calls this first
// for every beat and falls back to a still image on any non-ok response.
//
// Today Lovable AI Gateway does not expose a generally-available text-to-video
// model behind this key, so this handler returns { ok: false } and the pipeline
// stays on images. When a video model becomes available the fetch below is the
// only place that changes.

export const Route = createFileRoute("/api/generate-video-clip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        if (!(await getUserIdFromRequest(request))) return unauthorized();
        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return Response.json({ ok: false, reason: "Missing LOVABLE_API_KEY" }, { status: 200 });
        }
        try {
          const body = (await request.json()) as {
            prompt?: string; style?: string; ratio?: string; duration?: number;
          };
          const prompt = (body.prompt ?? "").trim();
          if (!prompt) {
            return Response.json({ ok: false, reason: "prompt required" }, { status: 400 });
          }
          // Placeholder: no video-generation model wired through Lovable AI Gateway yet.
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
