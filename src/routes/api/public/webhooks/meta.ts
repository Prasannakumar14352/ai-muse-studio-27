// Meta webhook for Auto DM (Instagram comments/messages, Facebook Page feed/messages).
//
// Configure in the Meta App Dashboard → Webhooks:
//   Callback URL: https://<your-domain>/api/public/webhooks/meta
//   Verify token: the META_WEBHOOK_VERIFY_TOKEN environment variable
//   Instagram fields: comments, messages · Page fields: feed, messages
//
// Every POST is checked against X-Hub-Signature-256 (HMAC of the raw body with
// the Meta app secret saved in Admin → Social Publishing). We always answer 200
// quickly once the signature is valid, so Meta doesn't retry or disable us.
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function sameToken(a: string | null, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/webhooks/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
        if (
          mode === "subscribe" &&
          expected &&
          expected.length >= 16 &&
          sameToken(token, expected)
        ) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        // Exact bytes Meta signed.
        const raw = Buffer.from(await request.arrayBuffer()).toString("utf8");
        const { getMetaAppSecret, verifyMetaSignature, parseWebhook, ingestEvents, runDueSends } =
          await import("@/lib/auto-dm.server");
        const secret = await getMetaAppSecret();
        if (
          !secret ||
          !verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)
        ) {
          return new Response("Invalid signature", { status: 401 });
        }
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const events = parseWebhook(body);
        if (events.length === 0) return Response.json({ ok: true, events: 0 });
        let ids: string[];
        try {
          ids = await ingestEvents(events);
        } catch (e) {
          console.error("[meta-webhook]", e instanceof Error ? e.message : e);
          // 5xx → Meta redelivers; ingestEvents removed the dedupe row for the failed event.
          return Response.json({ ok: false }, { status: 500 });
        }
        // Fast path: send the first queued message now (well inside Meta's
        // response window); the rest go out within a minute via the worker.
        if (ids.length > 0) {
          await runDueSends({ ids: ids.slice(0, 1), deadlineMs: 4_000 }).catch(() => undefined);
        }
        return Response.json({ ok: true, events: events.length, queued: ids.length });
      },
    },
  },
});
