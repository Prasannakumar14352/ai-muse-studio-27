import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { audioRequest } from "@/lib/audio-generation";

export const Route = createFileRoute("/api/generate-audio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        const userId = await getUserIdFromRequest(request);
        if (!userId) return unauthorized();

        const { startAudio, pollAudio, AudioServiceError } =
          await import("@/lib/audio-provider.server");
        const body: unknown = await request.json().catch(() => null);
        const status = z.object({ assetId: z.string().uuid() }).safeParse(body);
        const input = audioRequest.safeParse(body);
        if (!status.success && !input.success) {
          return Response.json({ error: "Invalid audio request" }, { status: 400 });
        }
        try {
          const result = status.success
            ? await pollAudio(userId, status.data.assetId)
            : input.success && (await startAudio(userId, input.data));
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
          if (error instanceof AudioServiceError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error("[video-audio] unexpected audio service failure");
          return Response.json(
            { error: "Audio service is temporarily unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
