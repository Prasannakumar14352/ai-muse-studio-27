// Daily cron (pg_cron "agents-scheduler", 08:10 IST): QA health check, ops
// numbers, and on Mondays the product manager's weekly plan. Same secret as
// the publishing worker.
import { createFileRoute } from "@tanstack/react-router";

async function authorized(request: Request): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const given = request.headers.get("x-cron-secret") ?? "";
  if (!given) return false;
  const envSecret = process.env.PUBLISH_CRON_SECRET;
  if (envSecret && envSecret.length >= 16 && given === envSecret) return true;
  const { data, error } = await supabaseAdmin.rpc("verify_publish_cron_secret" as never, { _secret: given } as never);
  return !error && data === true;
}

export const Route = createFileRoute("/api/public/hooks/agents-scheduler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorized(request))) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        try {
          const { runDailyAgents } = await import("@/lib/agents/scheduled.server");
          return Response.json({ ok: true, ...(await runDailyAgents()) });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
