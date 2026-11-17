// Cron hook: publishes due scheduled_posts with the users' connected accounts.
// Called every 5 minutes by pg_cron (job "publish-scheduled-posts") with the
// x-cron-secret header; the secret lives in Supabase Vault and is checked by
// public.verify_publish_cron_secret(). PUBLISH_CRON_SECRET (env) also works.
import { createFileRoute } from "@tanstack/react-router";

async function authorized(request: Request): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const given = request.headers.get("x-cron-secret")
    ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? "";
  if (!given) return false;
  const envSecret = process.env.PUBLISH_CRON_SECRET;
  if (envSecret && envSecret.length >= 16 && given === envSecret) return true;
  const { data, error } = await supabaseAdmin.rpc("verify_publish_cron_secret" as never, { _secret: given } as never);
  return !error && data === true;
}

export const Route = createFileRoute("/api/public/hooks/publish-scheduled")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorized(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDuePublishJobs } = await import("@/lib/social-publish.server");
        try {
          const r = await runDuePublishJobs(supabaseAdmin);
          return Response.json({ ok: true, ...r });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
