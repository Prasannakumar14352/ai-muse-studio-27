import { createFileRoute } from "@tanstack/react-router";

// Poll a motion clip started by /api/generate-video-clip.
//   POST { token } → { state: "pending" } | { state: "completed", url } | { state: "failed", error }
// Completed → the credit reservation is finalized. Failed → it is refunded.

export const Route = createFileRoute("/api/video-clip-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        const userId = await getUserIdFromRequest(request);
        if (!userId) return unauthorized();

        const { token } = (await request.json().catch(() => ({}))) as { token?: string };
        const { verifyClipToken } = await import("@/lib/motion-clips.server");
        const t = verifyClipToken(token ?? "", userId);
        if (!t) return Response.json({ state: "failed", error: "invalid_or_expired" }, { status: 400 });

        const { falPoll } = await import("@/lib/fal.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const settle = async (ok: boolean, reason?: string) => {
          // Only touch a reservation that belongs to this user and is still open.
          const { data: row } = await supabaseAdmin
            .from("credit_ledger").select("user_id,status").eq("id", t.l).maybeSingle();
          if (!row || row.user_id !== userId || row.status !== "reserved") return;
          if (ok) await supabaseAdmin.rpc("finalize_credits", { _ledger_id: t.l });
          else await supabaseAdmin.rpc("refund_credits_by_ledger", { _ledger_id: t.l, _reason: (reason ?? "clip_failed").slice(0, 240) });
        };

        try {
          const p = await falPoll(t.s, t.r, "video");
          if (p.state === "pending") return Response.json({ state: "pending" });
          if (p.state === "failed") {
            await settle(false, p.error);
            return Response.json({ state: "failed", error: p.error.slice(0, 300) });
          }
          await settle(true);
          return Response.json({ state: "completed", url: p.outputUrl });
        } catch (e) {
          // Network hiccup talking to fal — let the client keep polling.
          return Response.json({ state: "pending", note: (e instanceof Error ? e.message : String(e)).slice(0, 120) });
        }
      },
    },
  },
});
