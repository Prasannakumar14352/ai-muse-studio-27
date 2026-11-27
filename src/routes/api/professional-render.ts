import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { proRenderManifest } from "@/lib/pro-render-manifest";

const control = z
  .object({ id: z.string().uuid(), operation: z.enum(["status", "cancel", "retry"]) })
  .strict();
const active = ["queued", "preparing_assets", "rendering", "encoding", "validating", "uploading"];

export const Route = createFileRoute("/api/professional-render")({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.VIDEO_SERVER_RENDER_ENABLED !== "true")
          return Response.json({ available: false });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await (supabaseAdmin as unknown as SupabaseClient)
          .from("professional_render_workers")
          .select("id")
          .gte("seen_at", new Date(Date.now() - 45_000).toISOString())
          .limit(1);
        return Response.json(
          {
            available: Boolean(data?.length),
            fourK: process.env.VIDEO_4K_EXPORT_ENABLED === "true",
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const { getUserIdFromRequest, unauthorized } = await import("@/lib/route-auth.server");
        const owner = await getUserIdFromRequest(request);
        if (!owner) return unauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const db = supabaseAdmin as unknown as SupabaseClient;
        const jobs = () => db.from("professional_render_jobs");
        const body = await request.json().catch(() => null);
        const action = control.safeParse(body);
        const enabled = process.env.VIDEO_SERVER_RENDER_ENABLED === "true";

        if (action.success) {
          const { id, operation } = action.data;
          if (operation === "cancel") {
            const { error } = await jobs()
              .update({ status: "cancelled", lease_id: null })
              .eq("id", id)
              .eq("user_id", owner)
              .in("status", active);
            if (error) return Response.json({ error: "Could not update render" }, { status: 503 });
          }
          if (operation === "retry") {
            if (!enabled)
              return Response.json({ error: "Server rendering is disabled" }, { status: 503 });
            const { data, error } = await db.rpc("queue_professional_render", {
              owner_id: owner,
              project: null,
              spec: null,
              retry_id: id,
            });
            if (error || !data)
              return Response.json({ error: "Could not retry render" }, { status: 503 });
            if (data.error) return Response.json({ error: data.error }, { status: 409 });
          }
          const { data, error } = await jobs()
            .select("id,status,progress,error,output_path,output_metadata")
            .eq("id", id)
            .eq("user_id", owner)
            .maybeSingle();
          if (error) return Response.json({ error: "Could not read render" }, { status: 503 });
          if (!data) return Response.json({ error: "Render not found" }, { status: 404 });
          const { output_path: path, ...description } = data;
          const url =
            path && data.status === "completed"
              ? (
                  await supabaseAdmin.storage
                    .from("professional-renders")
                    .createSignedUrl(path, 900)
                ).data?.signedUrl
              : undefined;
          return Response.json(
            { ...description, url },
            { headers: { "Cache-Control": "no-store" } },
          );
        }

        if (!enabled)
          return Response.json({ error: "Server rendering is disabled" }, { status: 503 });
        const manifest = proRenderManifest.safeParse(body);
        if (!manifest.success)
          return Response.json(
            { error: "Invalid or unsupported render manifest" },
            { status: 400 },
          );
        if (manifest.data.resolution === "4k" && process.env.VIDEO_4K_EXPORT_ENABLED !== "true") {
          return Response.json({ error: "4K server export is disabled" }, { status: 400 });
        }
        const paths = [...manifest.data.scenes, ...manifest.data.audio].map(({ path }) => path);
        if (paths.some((path) => !path.startsWith(`${owner}/`))) {
          return Response.json(
            { error: "Assets must belong to the signed-in user" },
            { status: 403 },
          );
        }
        // Studio job IDs are local. The authenticated owner and owned input
        // namespace are authoritative; this mode never reads a cloud project.
        if (manifest.data.projectScope === "cloud") {
          const { data: project } = await supabaseAdmin
            .from("projects")
            .select("id")
            .eq("id", manifest.data.projectId)
            .eq("user_id", owner)
            .maybeSingle();
          if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
        }
        const { data: workers } = await db
          .from("professional_render_workers")
          .select("id")
          .gte("seen_at", new Date(Date.now() - 45_000).toISOString())
          .limit(1);
        if (!workers?.length)
          return Response.json({ error: "No render worker is online" }, { status: 503 });
        const { data, error } = await db.rpc("queue_professional_render", {
          owner_id: owner,
          project: manifest.data.projectId,
          spec: manifest.data,
        });
        if (error || !data)
          return Response.json({ error: "Could not queue render" }, { status: 503 });
        if (data.error) return Response.json({ error: data.error }, { status: 429 });
        return Response.json(data, { status: 202 });
      },
    },
  },
});
