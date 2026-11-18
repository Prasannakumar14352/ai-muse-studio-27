// Signed-in users' in-app support chat (bottom-right widget).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { userId: string; claims?: { email?: string } };
export type SupportChatMsg = { id: string; role: "user" | "assistant" | "admin"; text: string; created_at: string; seen_by_user: boolean };

export const getSupportChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as unknown as Ctx;
    const { admin } = await import("@/lib/agents/core.server");
    const db = await admin();
    const { data } = await db.from("support_chat_messages")
      .select("id,role,text,created_at,seen_by_user").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(60);
    const messages = ((data ?? []) as SupportChatMsg[]).reverse();
    return { messages, unread: messages.filter((m) => !m.seen_by_user).length };
  });

export const sendSupportChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    text: z.string().trim().min(1).max(2000),
    page: z.string().max(200).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as unknown as Ctx;
    const { handleInAppMessage } = await import("@/lib/agents/in-app-support.server");
    const added = await handleInAppMessage(userId, claims?.email ?? null, data.text, data.page ?? null);
    return { added: added as SupportChatMsg[] };
  });

export const markSupportChatSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as unknown as Ctx;
    const { admin } = await import("@/lib/agents/core.server");
    const db = await admin();
    await db.from("support_chat_messages").update({ seen_by_user: true }).eq("user_id", userId).eq("seen_by_user", false);
    return { ok: true };
  });
