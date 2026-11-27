// Cron hook: sends queued Auto DM messages (retries, rate-capped ones, and
// anything the webhook couldn't send right away). Called every minute by
// pg_cron (job "auto-dm-worker", only when something is queued) with the same
// x-cron-secret as the publishing worker.
import { createFileRoute } from "@tanstack/react-router";

async function authorized(request: Request): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const given =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!given) return false;
  const envSecret = process.env.PUBLISH_CRON_SECRET;
  if (envSecret && envSecret.length >= 16 && given === envSecret) return true;
  const { data, error } = await supabaseAdmin.rpc(
    "verify_publish_cron_secret" as never,
    { _secret: given } as never,
  );
  return !error && data === true;
}

export const Route = createFileRoute("/api/public/hooks/auto-dm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authorized(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const { runDueSends, pruneOldEvents } = await import("@/lib/auto-dm.server");
        await pruneOldEvents().catch(() => undefined);
        try {
          const r = await runDueSends({ deadlineMs: 50_000 });
          return Response.json({ ok: true, ...r });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
