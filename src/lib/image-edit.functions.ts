/**
 * Image editing persistence:
 *   - saveEditedImageFn: upload the final canvas PNG to storage, create a
 *     generated_assets row, and optionally attach to a project.
 *   - The generative operations themselves (BG remove, generative fill,
 *     prompt transform, outpaint) reuse the existing streaming endpoint at
 *     /api/generate-image, so credits are enforced there via the standard
 *     credit-guard flow.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createGenerationJobAdmin, markJobCompleteAdmin, markJobFailedAdmin } from "@/lib/generation-jobs.functions";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

const saveSchema = z.object({
  dataUrl: z.string().min(64).max(30_000_000),
  filename: z.string().max(120).default("edited.png"),
  mime: z.enum(["image/png", "image/jpeg", "image/webp"]).default("image/png"),
  width: z.number().int().positive().max(8000),
  height: z.number().int().positive().max(8000),
  operationsApplied: z.array(z.string().max(40)).max(30).default([]),
  projectId: z.string().uuid().nullable().optional(),
  originalAssetId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().min(1).max(128),
});

function dataUrlToBuffer(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([\w/+.-]+);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("Invalid dataUrl");
  const mime = m[1];
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

export const saveEditedImageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => saveSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { job } = await createGenerationJobAdmin(context.userId, {
        moduleType: "image_editing",
        jobType: "save_edited",
        projectId: data.projectId ?? null,
        requestPayload: {
          operationsApplied: data.operationsApplied,
          width: data.width, height: data.height, mime: data.mime,
        } as never,
        creditsEstimated: 0,
        provider: "internal",
        idempotencyKey: data.idempotencyKey,
    });

    try {
      const { bytes, mime } = dataUrlToBuffer(data.dataUrl);
      if (bytes.byteLength > MAX_BYTES) throw new Error("File too large (max 15MB)");
      if (mime !== data.mime) throw new Error("mime mismatch");

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const ext = mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "webp";
      const path = `${context.userId}/image-edits/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabaseAdmin.storage.from("library").upload(path, bytes, {
        contentType: mime, upsert: false,
      });
      if (upErr) throw new Error(upErr.message);

      const { data: signed } = await supabaseAdmin.storage.from("library").createSignedUrl(path, 60 * 60 * 24 * 7);

      // Attach to a project (create one if none supplied).
      let projectId = data.projectId ?? null;
      if (!projectId) {
        const { data: p } = await supabaseAdmin.from("projects").insert({
          user_id: context.userId,
          content_type: "ai_image",
          title: "Edited image",
          status: "completed",
          metadata: { source: "image_editing", operationsApplied: data.operationsApplied } as never,
        }).select("id").single();
        if (p) projectId = p.id;
      }

      const { data: asset } = await supabaseAdmin.from("generated_assets").insert({
        user_id: context.userId,
        project_id: projectId,
        asset_type: "image",
        storage_path: path,
        provider: "internal",
        metadata: {
          filename: data.filename,
          mime,
          width: data.width,
          height: data.height,
          operationsApplied: data.operationsApplied,
          originalAssetId: data.originalAssetId ?? null,
        } as never,
      }).select("id").single();

      await markJobCompleteAdmin({
        jobId: job.id,
        outputPayload: {
          projectId, assetId: asset?.id ?? null, storagePath: path, signedUrl: signed?.signedUrl ?? null,
        } as never,
      });

      return { jobId: job.id, projectId, assetId: asset?.id ?? null, url: signed?.signedUrl ?? null, storagePath: path };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJobFailedAdmin({ jobId: job.id, code: "save_edited_error", message: msg, refund: true });
      throw e;
    }
  });

export const listImageEditsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(20) }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("generated_assets")
      .select("id, project_id, storage_path, metadata, created_at")
      .eq("asset_type", "image")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const meta = (r.metadata ?? {}) as { mime?: string; width?: number; height?: number };
      return {
        id: r.id as string,
        projectId: (r.project_id as string | null) ?? null,
        storagePath: (r.storage_path as string | null) ?? "",
        mime: meta.mime ?? "image/png",
        width: meta.width ?? null,
        height: meta.height ?? null,
        createdAt: r.created_at as string,
      };
    });
  });
