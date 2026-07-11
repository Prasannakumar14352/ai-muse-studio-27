// Cron hook: processes due scheduled_posts. Publish adapters are stubbed:
// jobs are marked `manually_published` (user must post themselves) until
// OAuth adapters are wired in a follow-up turn.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/publish-scheduled")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("scheduled_posts")
          .select("id, user_id, project_id, platform, scheduled_at, attempts")
          .in("status", ["scheduled", "ready"])
          .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
          .limit(25);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        let processed = 0;
        for (const job of due ?? []) {
          // Publish adapter STUB — mark as manually_published with a note.
          const errMsg = "Direct publishing not yet configured for this platform. Marked as manually published.";
          await supabaseAdmin.from("scheduled_posts").update({
            status: "manually_published",
            attempts: (job.attempts as number ?? 0) + 1,
            last_error: errMsg,
            published_at: new Date().toISOString(),
          } as never).eq("id", job.id as string);
          if (job.project_id) {
            await supabaseAdmin.from("projects").update({
              publish_status: "manually_published",
              manually_published_at: new Date().toISOString(),
            } as never).eq("id", job.project_id as string);
          }
          processed++;
        }
        return Response.json({ ok: true, processed });
      },
    },
  },
});
