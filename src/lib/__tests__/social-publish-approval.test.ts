import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../video-publish-approval.server", () => ({
  approvalBucket: "approved-video-exports",
  getVideoApproval: vi.fn(),
}));

import { runPublishJob } from "../social-publish.server";
import { getVideoApproval } from "../video-publish-approval.server";

function scheduledFixture(record: Record<string, unknown> | null) {
  const eq = vi.fn().mockReturnThis();
  const update = vi.fn(() => ({
    eq,
    or: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({ data: [{ id: "post" }] }),
  }));
  const select = vi.fn(() => ({ eq, maybeSingle: vi.fn().mockResolvedValue({ data: record }) }));
  const table = { select, update };
  eq.mockImplementation(function (this: unknown) {
    return this;
  });
  const admin = { from: vi.fn(() => table), storage: { from: vi.fn() } };
  return { admin: admin as unknown as Parameters<typeof runPublishJob>[0], eq, update };
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("worker publishing approval guard", () => {
  it("limits user-initiated dispatch to a post owned by the caller", async () => {
    const { admin, eq, update } = scheduledFixture(null);
    await expect(runPublishJob(admin, "post", "caller")).resolves.toMatchObject({
      status: "missing",
    });
    expect(eq).toHaveBeenCalledWith("user_id", "caller");
    expect(update).not.toHaveBeenCalled();
  });

  it.each([null, "revoked"])(
    "blocks an unapproved or revoked YouTube export (%s)",
    async (approvalId) => {
      const { admin } = scheduledFixture({
        id: "post",
        user_id: "owner",
        project_id: "project",
        updated_at: "fixture",
        status: "ready",
        platform: "youtube",
        video_approval_id: approvalId,
        media_urls: [],
      });
      vi.mocked(getVideoApproval).mockResolvedValue(null);
      const outbound = vi.fn();
      vi.stubGlobal("fetch", outbound);
      await expect(runPublishJob(admin, "post")).resolves.toMatchObject({ status: "failed" });
      if (approvalId) expect(getVideoApproval).toHaveBeenCalledWith(approvalId, "owner", "project");
      expect(outbound).not.toHaveBeenCalled();
    },
  );
});
