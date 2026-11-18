import { createFileRoute } from "@tanstack/react-router";

// POST { path, shape } — `path` is a file the user already uploaded to the
// private "renders" bucket (their own folder). Returns a signed URL to an
// H.264 MP4 at 1080p made from it. Used after every browser render.
export const Route = createFileRoute("/api/transcode-video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        const userId = await getUserIdFromRequest(request);
        if (!userId) return unauthorized();

        const body = (await request.json().catch(() => ({}))) as {
          path?: string; shape?: string; deleteSource?: boolean;
        };
        const path = String(body.path ?? "");
        if (!path.startsWith(`${userId}/`) || path.includes("..")) return json({ ok: false, error: "Invalid file" }, 400);
        const shape = body.shape === "landscape" || body.shape === "square" ? body.shape : "vertical";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: file, error: dlErr } = await supabaseAdmin.storage.from("renders").download(path);
        if (dlErr || !file) return json({ ok: false, error: dlErr?.message ?? "File not found" }, 404);
        if (file.size > 300 * 1024 * 1024) return json({ ok: false, error: "Video is too large to convert" }, 413);

        try {
          const { transcodeToMp4 } = await import("@/lib/transcode.server");
          const started = Date.now();
          const mp4 = await transcodeToMp4(new Uint8Array(await file.arrayBuffer()), shape);
          const outPath = `${userId}/mp4/${crypto.randomUUID()}.mp4`;
          const { error: upErr } = await supabaseAdmin.storage.from("renders").upload(outPath, mp4, {
            contentType: "video/mp4", upsert: false,
          });
          if (upErr) throw new Error(upErr.message);
          if (body.deleteSource) await supabaseAdmin.storage.from("renders").remove([path]).catch(() => undefined);
          const { data: signed } = await supabaseAdmin.storage.from("renders").createSignedUrl(outPath, 60 * 60 * 24 * 7);
          return json({ ok: true, path: outPath, url: signed?.signedUrl ?? null, bytes: mp4.byteLength, ms: Date.now() - started });
        } catch (e) {
          console.error("[transcode-video] failed", e);
          return json({ ok: false, error: e instanceof Error ? e.message : "Conversion failed" }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
