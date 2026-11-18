// Telegram → CreatorFlow support agent. Telegram signs every call with the
// secret_token we registered (X-Telegram-Bot-Api-Secret-Token).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getAgentSettings } = await import("@/lib/agents/core.server");
        const s = await getAgentSettings();
        const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!s.telegram_webhook_secret || given !== s.telegram_webhook_secret) {
          return new Response("unauthorized", { status: 401 });
        }
        const update = await request.json().catch(() => null);
        if (!update) return new Response("ok");
        try {
          const { handleTelegramUpdate } = await import("@/lib/agents/support.server");
          await handleTelegramUpdate(update);
        } catch (e) {
          // Always 200: a non-200 makes Telegram retry the same message forever.
          console.error("[telegram] update failed", e);
        }
        return new Response("ok");
      },
    },
  },
});
