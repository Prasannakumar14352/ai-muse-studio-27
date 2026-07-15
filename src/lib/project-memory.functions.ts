import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MemoryEntry = {
  id: string;
  kind: string;
  payload: any;
  ref_url: string | null;
  version: number;
  created_at: string;
};

export const listProjectMemoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { projectId: string }) => i)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_memory" as never)
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as MemoryEntry[];
  });

export const appendProjectMemoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { projectId: string; kind: string; payload: any; refUrl?: string }) => i)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_memory" as never).insert({
      user_id: context.userId,
      project_id: data.projectId,
      kind: data.kind,
      payload: data.payload,
      ref_url: data.refUrl ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
