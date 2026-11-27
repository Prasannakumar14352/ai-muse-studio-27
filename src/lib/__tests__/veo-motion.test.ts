import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  insert: vi.fn(),
  one: vi.fn(),
  existing: vi.fn(),
  charge: vi.fn(),
  submit: vi.fn(),
  poll: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const query = {
        insert: (value: unknown) => {
          mock.insert(value);
          return query;
        },
        update: () => query,
        select: () => query,
        eq: () => query,
        not: () => query,
        single: () => mock.one(),
        maybeSingle: () => mock.existing(),
      };
      return query;
    },
    rpc: mock.rpc,
    storage: { from: () => ({ upload: mock.upload, createSignedUrl: mock.sign }) },
  },
}));
vi.mock("../credits-guard.server", () => ({ chargeCredits: mock.charge }));
vi.mock("../fal.server", () => ({
  isFalConfigured: () => true,
  falSubmit: mock.submit,
  falPoll: mock.poll,
  FalSubmissionError: class extends Error {},
}));

import { pollVeoClip, startVeoClip } from "../veo-motion.server";

const input = {
  jobId: "087674c0-30ab-4e2c-a02a-dcd97ec35949",
  shotId: "s1",
  revision: 0,
  model: "veo-fast",
  prompt: "Animate the frame",
  image: "data:image/png;base64,iVBORw0KGgo=",
  aspectRatio: "9:16",
  resolution: "1080p",
  beatSeconds: 4.1,
  nativeAudio: true,
};
const statusUrl = "https://queue.fal.run/example/status";
const responseUrl = "https://queue.fal.run/example";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VIDEO_ADVANCED_MODELS_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("submits the allowlisted request once and reserves for six generated seconds", async () => {
  mock.one
    .mockResolvedValueOnce({ data: { id: "asset" } })
    .mockResolvedValueOnce({ error: { code: "23505" } });
  mock.charge.mockResolvedValue({ ledgerId: "ledger" });
  mock.submit.mockResolvedValue({ requestId: "request", statusUrl, responseUrl });
  expect(await (await startVeoClip("user", input)).json()).toMatchObject({
    assetId: "asset",
    seconds: 6,
    credits: 167,
  });
  mock.existing.mockResolvedValue({ data: { ...mock.insert.mock.calls[0][0], id: "asset" } });
  expect(await (await startVeoClip("user", input)).json()).toMatchObject({ assetId: "asset" });
  expect(mock.submit).toHaveBeenCalledExactlyOnceWith(
    "fal-ai/veo3.1/fast/image-to-video",
    expect.objectContaining({ duration: "6s", resolution: "1080p", generate_audio: true }),
    expect.any(AbortSignal),
  );
  expect(mock.charge).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ amount: 167, idempotencyKey: "veo-motion:asset" }),
  );
});

it("refunds a definitive provider failure using the owner-scoped settlement RPC", async () => {
  mock.existing.mockResolvedValue({
    data: { status: "queued", status_url: statusUrl, response_url: responseUrl },
  });
  mock.poll.mockResolvedValue({ state: "failed" });
  mock.rpc.mockResolvedValue({ error: null });
  expect(await (await pollVeoClip("user", "asset")).json()).toMatchObject({ state: "failed" });
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("settle_veo_clip", {
    owner_id: "user",
    asset: "asset",
    object_path: null,
    failure: "Veo generation failed",
  });
});

it("does not follow a provider media URL outside fal storage", async () => {
  mock.existing.mockResolvedValue({
    data: { status: "queued", status_url: statusUrl, response_url: responseUrl },
  });
  mock.poll.mockResolvedValue({
    state: "completed",
    outputUrl: "https://fal.media.example/asset.mp4",
  });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(pollVeoClip("user", "asset")).rejects.toThrow("Untrusted");
  expect(fetch).not.toHaveBeenCalled();
  expect(mock.rpc).not.toHaveBeenCalled();
});

it("does not sign clips absent from the authenticated owner's lookup", async () => {
  mock.existing.mockResolvedValue({ data: null });
  expect((await pollVeoClip("user", "unowned")).status).toBe(404);
  expect(mock.sign).not.toHaveBeenCalled();
});
