import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const approvalBucket = "approved-video-exports";
export const approvalUploadLimit = 50 * 1024 * 1024;
type Approval = { id: string; object_path: string };

export async function getVideoApproval(
  id: string,
  userId: string,
  projectId: string | null,
): Promise<Approval | null> {
  const query = supabaseAdmin
    .from("video_publish_approvals")
    .select("id,object_path")
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null);
  const { data, error } = await (
    projectId ? query.eq("project_id", projectId) : query.is("project_id", null)
  ).maybeSingle();
  if (error) throw new Error("Video approval verification failed");
  return data;
}

export async function inspectApprovalVideo(bytes: Buffer, extension: string) {
  const dir = await mkdtemp(join(tmpdir(), "publish-review-"));
  try {
    const file = join(dir, `export.${extension}`);
    await writeFile(file, bytes);
    const { stdout } = await promisify(execFile)(
      process.env.FFPROBE_PATH || "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      { timeout: 15_000, maxBuffer: 128_000 },
    );
    const probe = JSON.parse(stdout);
    const video = (probe.streams ?? []).find(
      (stream: { codec_type: string }) => stream.codec_type === "video",
    );
    const duration = Number(probe.format?.duration);
    const format = String(probe.format?.format_name ?? "").split(",");
    if (
      !video?.width ||
      !video?.height ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !format.includes(extension === "webm" ? "webm" : "mp4")
    ) {
      throw new Error("Invalid export");
    }
    return {
      width: Number(video.width),
      height: Number(video.height),
      duration,
      codec: String(video.codec_name),
      frameRate: String(video.avg_frame_rate),
      hasAudio: (probe.streams ?? []).some(
        (stream: { codec_type: string }) => stream.codec_type === "audio",
      ),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
