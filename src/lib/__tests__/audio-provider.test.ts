import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioRequest } from "../audio-generation";

const fake = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  fetchRow: vi.fn(),
  submit: vi.fn(),
  poll: vi.fn(),
  charge: vi.fn(),
  upload: vi.fn(),
  sign: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: fake.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        update: (values: Record<string, unknown>) => {
          fake.update(values);
          return query;
        },
        single: () => fake.fetchRow(),
        maybeSingle: () => fake.fetchRow(),
      };
      return query;
    },
    storage: { from: () => ({ upload: fake.upload, createSignedUrl: fake.sign }) },
  },
}));
vi.mock("../credits-guard.server", () => ({ chargeCredits: fake.charge }));
vi.mock("../fal.server", () => ({
  isFalConfigured: () => Boolean(process.env.FAL_KEY),
  falSubmit: fake.submit,
  falPoll: fake.poll,
  FalSubmissionError: class extends Error {
    constructor(readonly status: number) {
      super("provider rejection");
    }
  },
}));

import { pollAudio, startAudio } from "../audio-provider.server";
import { FalSubmissionError } from "../fal.server";

const owner = "owner";
const input: AudioRequest = {
  jobId: "087674c0-30ab-4e2c-a02a-dcd97ec35949",
  track: "sfx",
  slot: 0,
  revision: 0,
  prompt: "Ocean waves",
  duration: 3,
};
const record = {
  id: "asset",
  user_id: owner,
  status: "submitting",
  track: "sfx",
  credits: 2,
  duration: 3,
  prompt: input.prompt,
  ledger_id: null,
  provider_request_id: null,
  status_url: null,
  response_url: null,
  storage_path: null,
  error: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("FAL_KEY", "test-only");
  vi.stubEnv("VIDEO_PAID_AUDIO_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("audio submission and settlement", () => {
  it("refuses paid submission while disabled or unconfigured", async () => {
    vi.stubEnv("VIDEO_PAID_AUDIO_ENABLED", "");
    await expect(startAudio(owner, input)).rejects.toThrow("disabled");
    vi.stubEnv("VIDEO_PAID_AUDIO_ENABLED", "true");
    vi.stubEnv("FAL_KEY", "");
    await expect(startAudio(owner, input)).rejects.toThrow("FAL_KEY");
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.submit).not.toHaveBeenCalled();
  });

  it("only reserves and submits the concurrent request admitted by the database", async () => {
    fake.rpc
      .mockResolvedValueOnce({ data: { created: true, row: record } })
      .mockResolvedValueOnce({ data: { created: false, row: record } });
    fake.charge.mockResolvedValue({ ledgerId: "ledger" });
    fake.fetchRow
      .mockResolvedValueOnce({ data: { ...record, ledger_id: "ledger" } })
      .mockResolvedValueOnce({ data: { ...record, status: "queued" } });
    fake.submit.mockResolvedValue({
      requestId: "fal-id",
      statusUrl: "https://queue.fal.run/status",
      responseUrl: "https://queue.fal.run/result",
    });
    await Promise.all([startAudio(owner, input), startAudio(owner, input)]);
    expect(fake.charge).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        userId: owner,
        amount: 2,
        idempotencyKey: "video-audio:asset",
      }),
    );
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.update).toHaveBeenCalledWith(
      expect.objectContaining({ provider_request_id: "fal-id" }),
    );
  });

  it("does not call fal when credits are insufficient", async () => {
    fake.rpc
      .mockResolvedValueOnce({ data: { created: true, row: record } })
      .mockResolvedValueOnce({ data: null });
    fake.charge.mockRejectedValue(new Error("insufficient_credits:{}"));
    fake.fetchRow.mockResolvedValue({ data: { ...record, status: "failed" } });
    await expect(startAudio(owner, input)).rejects.toMatchObject({ status: 402 });
    expect(fake.submit).not.toHaveBeenCalled();
  });

  it("keeps ambiguous paid submission reserved and does not resubmit its slot", async () => {
    const uncertain = { ...record, status: "uncertain", ledger_id: "ledger" };
    fake.rpc
      .mockResolvedValueOnce({ data: { created: true, row: record } })
      .mockResolvedValueOnce({ data: { created: false, row: uncertain } });
    fake.charge.mockResolvedValue({ ledgerId: "ledger" });
    fake.fetchRow
      .mockResolvedValueOnce({ data: { ...record, ledger_id: "ledger" } })
      .mockResolvedValueOnce({ data: uncertain });
    fake.submit.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    await expect(startAudio(owner, input)).resolves.toMatchObject({ status: "uncertain" });
    await expect(startAudio(owner, input)).resolves.toMatchObject({ status: "uncertain" });
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.rpc.mock.calls.map(([name]) => name)).toEqual([
      "admit_video_audio",
      "admit_video_audio",
    ]);
  });

  it("keeps admission rate limits separate from provider submission", async () => {
    fake.rpc.mockResolvedValue({ data: { error: "Audio generation limit reached" } });
    await expect(startAudio(owner, input)).rejects.toMatchObject({ status: 429 });
    expect(fake.charge).not.toHaveBeenCalled();
  });

  it("requests eligible refund for a definite provider rejection", async () => {
    fake.rpc
      .mockResolvedValueOnce({ data: { created: true, row: record } })
      .mockResolvedValueOnce({ data: { ...record, status: "failed" } });
    fake.charge.mockResolvedValue({ ledgerId: "ledger" });
    fake.fetchRow.mockResolvedValue({ data: { ...record, ledger_id: "ledger" } });
    fake.submit.mockRejectedValue(new FalSubmissionError(422, "fixture"));
    await expect(startAudio(owner, input)).resolves.toMatchObject({ status: "failed" });
    expect(fake.rpc).toHaveBeenLastCalledWith("settle_video_audio", {
      owner_id: owner,
      asset: "asset",
      object_path: null,
      failure: "Audio provider rejected the request",
    });
  });

  it("does not expose or poll an asset absent from the owner's query", async () => {
    fake.fetchRow.mockResolvedValue({ data: null });
    await expect(pollAudio(owner, "unowned")).rejects.toMatchObject({ status: 404 });
    expect(fake.poll).not.toHaveBeenCalled();
    expect(fake.sign).not.toHaveBeenCalled();
  });

  it("rejects an unsafe provider download URL before fetch", async () => {
    fake.fetchRow.mockResolvedValue({
      data: {
        ...record,
        status: "queued",
        ledger_id: "ledger",
        status_url: "https://queue.fal.run/status",
        response_url: "https://queue.fal.run/result",
      },
    });
    fake.poll.mockResolvedValue({
      state: "completed",
      outputUrl: "https://fal.media.attacker.test/test.mp3",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(pollAudio(owner, "asset")).rejects.toThrow("valid provider audio");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it("stores structurally valid audio privately before settling the reservation", async () => {
    const frames = new Uint8Array(834);
    frames.set([255, 251, 144, 0], 0);
    frames.set([255, 251, 144, 0], 417);
    fake.fetchRow.mockResolvedValue({
      data: {
        ...record,
        status: "queued",
        ledger_id: "ledger",
        status_url: "https://queue.fal.run/status",
        response_url: "https://queue.fal.run/result",
      },
    });
    fake.poll.mockResolvedValue({ state: "completed", outputUrl: "https://v3.fal.media/file.mp3" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(frames, {
          headers: { "Content-Type": "audio/mpeg" },
        }),
      ),
    );
    fake.upload.mockResolvedValue({ error: null });
    fake.rpc.mockResolvedValue({
      data: { ...record, status: "ready", storage_path: "owner/asset.mp3" },
    });
    fake.sign.mockResolvedValue({ data: { signedUrl: "https://example.test/signed" } });
    await expect(pollAudio(owner, "asset")).resolves.toMatchObject({
      status: "ready",
      url: "https://example.test/signed",
    });
    expect(fake.upload).toHaveBeenCalledWith("owner/asset.mp3", frames, {
      contentType: "audio/mpeg",
      upsert: true,
    });
    expect(fake.rpc).toHaveBeenCalledWith("settle_video_audio", {
      owner_id: owner,
      asset: "asset",
      object_path: "owner/asset.mp3",
      failure: null,
    });
    expect(fake.upload.mock.invocationCallOrder[0]).toBeLessThan(
      fake.rpc.mock.invocationCallOrder[0],
    );
  });
});
