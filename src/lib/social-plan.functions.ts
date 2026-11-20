// Admin-only: CreatorFlow's own content plan (content_plan_items) and the
// per-platform drafts the post creator makes from it (agent_tasks).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }; userId: string };

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function db() {
  const core = await import("@/lib/agents/core.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await core.admin()) as any;
}

export type PlanItemRow = {
  id: string; day_number: number | null; plan_date: string; idea: string;
  format: "reel" | "long" | "carousel" | "image";
  build: "walkthrough" | "video" | "thumbnail" | "carousel" | "image";
  media_id: string | null; platforms: Array<{ platform: string; time: string }>;
  notes: string | null; status: "planned" | "drafted" | "done" | "skipped";
};
export type PlanTaskRow = {
  id: string; agent: string; kind: string; title: string; body: string; status: string; priority: number;
  draft_reply: string | null; source: string | null; source_ref: Record<string, string | number | boolean | null>;
  created_at: string; resolved_at: string | null;
};

export const listSocialPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as unknown as Ctx);
    const d = await db();
    const [items, tasks] = await Promise.all([
      d.from("content_plan_items").select("*").order("plan_date").limit(400),
      d.from("agent_tasks").select("*").eq("kind", "social_post").not("source_ref->>plan_item_id", "is", null)
        .order("created_at", { ascending: false }).limit(600),
    ]);
    if (items.error) throw new Error(items.error.message);
    if (tasks.error) throw new Error(tasks.error.message);
    return { items: (items.data ?? []) as PlanItemRow[], tasks: (tasks.data ?? []) as PlanTaskRow[] };
  });

/** Run the post creator now for chosen planned days. */
export const draftPlanItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { runContentPlanCreator } = await import("@/lib/agents/content-plan.server");
    const r = await runContentPlanCreator("manual", { itemIds: data.ids });
    if (!r) throw new Error("The monthly agent budget is used up — raise it in Agent HQ settings.");
    return r;
  });

export const setPlanItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["planned", "drafted", "done", "skipped"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const { error } = await (await db()).from("content_plan_items")
      .update({ status: data.status, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const MIME = z.string().regex(/^(image\/(png|jpeg|webp)|video\/(mp4|quicktime|webm))$/);

/**
 * A one-time upload URL for media built in a studio. The browser uploads the
 * file straight to Storage (no size limit from the server function body).
 */
export const createPlanMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid(), mime: MIME }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    const ext = (data.mime.split("/")[1] ?? "bin").replace("jpeg", "jpg").replace("quicktime", "mov");
    const path = `${(context as unknown as Ctx).userId}/content-plan/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: up, error } = await supabaseAdmin.storage.from("renders").createSignedUploadUrl(path);
    if (error || !up) throw new Error(error?.message ?? "Couldn't start the upload");
    return { path, token: up.token };
  });

/** Attach uploaded media to a draft (and, optionally, the same day's other drafts without media). */
export const attachPlanMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    taskId: z.string().uuid(),
    path: z.string().regex(/^[0-9a-f-]{36}\/content-plan\/[0-9a-f-]{36}\.(png|jpg|webp|mp4|mov|webm)$/),
    mime: MIME,
    sameDay: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as unknown as Ctx);
    if (!data.path.startsWith(`${(context as unknown as Ctx).userId}/`)) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Scheduled posts can be weeks out, so the link must outlive the plan.
    const { data: signed, error: sErr } = await supabaseAdmin.storage.from("renders").createSignedUrl(data.path, 45 * 24 * 3600);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Couldn't read the upload");
    const d = await db();
    const { data: task, error: tErr } = await d.from("agent_tasks").select("id, source_ref").eq("id", data.taskId).maybeSingle();
    if (tErr || !task) throw new Error("Draft not found");
    const ref = (task.source_ref ?? {}) as Record<string, unknown>;
    const mediaType = data.mime.startsWith("video/") ? "video" : "image";
    const ids = [task.id as string];
    if (data.sameDay && ref.plan_item_id) {
      const { data: sibs } = await d.from("agent_tasks").select("id, source_ref")
        .eq("kind", "social_post").eq("status", "waiting_approval")
        .eq("source_ref->>plan_item_id", String(ref.plan_item_id));
      for (const s of (sibs ?? []) as Array<{ id: string; source_ref: Record<string, unknown> }>) {
        if (s.id !== task.id && !s.source_ref?.media_url) ids.push(s.id);
      }
    }
    for (const id of ids) {
      const { data: row } = await d.from("agent_tasks").select("source_ref").eq("id", id).maybeSingle();
      const next = { ...((row?.source_ref ?? {}) as Record<string, unknown>), media_url: signed.signedUrl, media_type: mediaType, media_path: data.path };
      await d.from("agent_tasks").update({ source_ref: next, updated_at: new Date().toISOString() }).eq("id", id);
    }
    return { url: signed.signedUrl, attached: ids.length };
  });
