import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

import { inspectApprovalVideo } from "../video-publish-approval.server";

describe("server export inspection", () => {
  it("blocks malformed media", async () => {
    await expect(inspectApprovalVideo(Buffer.from("invalid"), "mp4")).rejects.toThrow();
  });

  it("records actual dimensions, codec, duration, audio presence and digest", async () => {
    const directory = mkdtempSync(join(tmpdir(), "publish-test-"));
    try {
      const output = join(directory, "test.mp4");
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:d=0.5:r=24",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-an",
        output,
      ]);
      const result = await inspectApprovalVideo(readFileSync(output), "mp4");
      expect(result).toMatchObject({
        width: 160,
        height: 90,
        codec: "h264",
        frameRate: "24/1",
        hasAudio: false,
      });
      expect(result.duration).toBeCloseTo(0.5);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
