import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PublishButton } from "@/components/publish-actions";
import { supabase } from "@/integrations/supabase/client";
import type { RenderResult } from "@/lib/video-agents";
import {
  approveVideoExport,
  prepareVideoApproval,
  revokeVideoApproval,
} from "@/lib/video-publish-approval.functions";

export function FinalPublishApproval({
  render,
  title,
  caption,
}: {
  render: RenderResult;
  title: string;
  caption: string;
}) {
  const prepare = useServerFn(prepareVideoApproval);
  const approve = useServerFn(approveVideoExport);
  const revoke = useServerFn(revokeVideoApproval);
  const [reviewed, setReviewed] = useState(false);
  const [acceptSilence, setAcceptSilence] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadId, setUploadId] = useState<string>();
  const [approval, setApproval] = useState<Awaited<ReturnType<typeof approve>>>();

  async function approveExport() {
    setBusy(true);
    try {
      let staged = uploadId;
      if (!staged) {
        if (render.blob.size > 50 * 1024 * 1024)
          throw new Error("Publishing review supports exports up to 50 MiB");
        const upload = await prepare({ data: { extension: render.extension } });
        const { error } = await supabase.storage
          .from("renders")
          .uploadToSignedUrl(upload.path, upload.token, render.blob, { contentType: render.mime });
        if (error) throw new Error("Could not upload this export for review");
        staged = upload.uploadId;
        setUploadId(staged);
      }
      const digest = await crypto.subtle.digest("SHA-256", await render.blob.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      setApproval(
        await approve({
          data: {
            uploadId: staged,
            extension: render.extension,
            reviewed: true,
            sha256,
            acceptedWarnings: acceptSilence ? ["no-audio"] : [],
          },
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not approve this export");
    } finally {
      setBusy(false);
    }
  }

  async function revokeExport(id: string) {
    setBusy(true);
    try {
      await revoke({ data: { id } });
      setApproval(undefined);
      setUploadId(undefined);
      setReviewed(false);
      setAcceptSilence(false);
    } catch {
      toast.error("Could not revoke publishing approval");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Final publishing approval</h3>
      {approval && (
        <p className="text-sm">
          {approval.metadata.width} × {approval.metadata.height} ·{" "}
          {approval.metadata.duration.toFixed(1)} s · {approval.metadata.codec} ·{" "}
          {approval.metadata.hasAudio ? "Audio stream detected" : "No audio stream"}
        </p>
      )}
      {approval?.status === "approved" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm">
            Approved{approval.metadata.hasAudio ? "" : " with no-audio warning accepted"}
          </p>
          <PublishButton
            content={{ title, caption, videoApprovalId: approval.id, mediaHint: { videos: 1 } }}
          />
          <button
            disabled={busy}
            onClick={() => revokeExport(approval.id)}
            className="text-sm underline"
          >
            Revoke approval
          </button>
        </div>
      ) : (
        <>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            I watched this export and reviewed it for publishing.
          </label>
          {approval?.status === "warning" && (
            <label className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptSilence}
                onChange={(event) => setAcceptSilence(event.target.checked)}
              />
              I accept that this export has no audio stream.
            </label>
          )}
          <button
            className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50"
            disabled={busy || !reviewed || (approval?.status === "warning" && !acceptSilence)}
            onClick={approveExport}
          >
            {busy ? "Checking export…" : "Approve for publishing"}
          </button>
        </>
      )}
    </section>
  );
}
