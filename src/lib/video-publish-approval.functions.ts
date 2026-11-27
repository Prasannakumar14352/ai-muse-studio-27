import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uploadSchema = z.object({ extension: z.enum(["mp4", "webm"]), uploadId: z.string().uuid() });
const warnings = ["no-audio"] as const;

export const prepareVideoApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ extension: uploadSchema.shape.extension }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uploadId = crypto.randomUUID();
    const path = `${context.userId}/review-upload/${uploadId}.${data.extension}`;
    const { data: upload, error } = await supabaseAdmin.storage
      .from("renders")
      .createSignedUploadUrl(path);
    if (error || !upload) throw new Error("Could not prepare the export upload");
    return { path, uploadId, token: upload.token };
  });

export const approveVideoExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    uploadSchema
      .extend({
        projectId: z.string().uuid().optional(),
        acceptedWarnings: z.array(z.enum(warnings)).max(warnings.length),
        reviewed: z.literal(true),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { approvalBucket, approvalUploadLimit, inspectApprovalVideo } =
      await import("./video-publish-approval.server");
    if (data.projectId) {
      const { data: project } = await context.supabase
        .from("projects")
        .select("id")
        .eq("id", data.projectId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!project) throw new Error("Project not found");
    }
    const source = `${context.userId}/review-upload/${data.uploadId}.${data.extension}`;
    const staging = supabaseAdmin.storage.from("renders");
    const { data: info } = await staging.info(source);
    if (!info?.size || info.size > approvalUploadLimit)
      throw new Error("The export must be between 1 byte and 50 MiB");
    const { data: blob } = await staging.download(source);
    if (!blob || blob.size > approvalUploadLimit) throw new Error("Could not read the export");
    const bytes = Buffer.from(await blob.arrayBuffer());
    let inspected: Awaited<ReturnType<typeof inspectApprovalVideo>>;
    try {
      inspected = await inspectApprovalVideo(bytes, data.extension);
    } catch {
      throw new Error("The server could not verify this video export");
    }
    const { sha256, ...metadata } = inspected;
    if (sha256 !== data.sha256)
      throw new Error("The uploaded export differs from the reviewed video");
    if (!metadata.hasAudio && !data.acceptedWarnings.includes("no-audio")) {
      return { status: "warning" as const, metadata };
    }
    const id = crypto.randomUUID();
    const path = `${context.userId}/${id}.${data.extension}`;
    const bucket = supabaseAdmin.storage.from(approvalBucket);
    const { error: uploadError } = await bucket.upload(path, bytes, {
      contentType: `video/${data.extension}`,
      upsert: false,
    });
    if (uploadError) throw new Error("Could not save the immutable export");
    const { error } = await supabaseAdmin.from("video_publish_approvals").insert({
      id,
      object_path: path,
      user_id: context.userId,
      project_id: data.projectId ?? null,
      sha256,
      metadata,
      accepted_warnings: metadata.hasAudio ? [] : ["no-audio"],
    });
    if (error) {
      await bucket.remove([path]);
      throw new Error("Could not save the approval");
    }
    await staging.remove([source]);
    return { status: "approved" as const, id, metadata };
  });

export const revokeVideoApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("video_publish_approvals")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    if (error) throw new Error("Could not revoke the approval");
    return { ok: true };
  });
