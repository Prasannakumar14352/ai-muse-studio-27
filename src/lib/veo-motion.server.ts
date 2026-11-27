import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargeCredits } from "./credits-guard.server";
import { falPoll, falSubmit, FalSubmissionError, isFalConfigured } from "./fal.server";
import {
  ADVANCED_VIDEO_MODELS,
  ADVANCED_VIDEO_FEATURE_FLAG,
  ADVANCED_VIDEO_PRICING_DATE,
  advancedClipQuote,
  veoProviderInput,
  veoSecondsFor,
} from "./advanced-video-models";

const db = () => supabaseAdmin as unknown as SupabaseClient;
const table = () => db().from("model_generations");
const BUCKET = "generated-motion";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8_000_000;

export const veoRequest = z.object({
  model: z.enum(["veo-fast", "veo-standard"]),
  jobId: z.string().uuid(),
  shotId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  revision: z.number().int().min(0).max(4).default(0),
  prompt: z.string().trim().min(1).max(2400),
  image: z.string().max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64),
  beatSeconds: z.number().finite().positive().max(15),
  aspectRatio: z.enum(["16:9", "9:16"]),
  resolution: z.enum(["720p", "1080p"]),
  nativeAudio: z.boolean(),
});

export function veoAvailable() {
  return process.env[ADVANCED_VIDEO_FEATURE_FLAG] === "true" && isFalConfigured();
}

export function validateVeoImage(value: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return false;
  if (match[1] === "jpeg") return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (match[1] === "png")
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

function allowedUrl(raw: string, hosts: (name: string) => boolean) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts(url.hostname)
  ) {
    throw new Error("Untrusted media or queue URL");
  }
  return url.href;
}

const queue = (value: string) => allowedUrl(value, (host) => host === "queue.fal.run");

async function update(owner: string, id: string, values: Record<string, unknown>) {
  const { error } = await table().update(values).eq("id", id).eq("user_id", owner);
  if (error) throw new Error("Could not persist motion state");
}

async function settle(owner: string, id: string, path: string | null, failure: string | null) {
  const { error } = await db().rpc("settle_veo_clip", {
    owner_id: owner,
    asset: id,
    object_path: path,
    failure,
  });
  if (error) throw new Error("Could not settle motion credits");
}

export async function startVeoClip(owner: string, raw: unknown) {
  if (!veoAvailable())
    return Response.json({ ok: false, reason: "advanced_video_disabled" }, { status: 503 });
  const parsed = veoRequest.safeParse(raw);
  if (!parsed.success || !validateVeoImage(parsed.data.image)) {
    return Response.json(
      { ok: false, reason: "Invalid Veo settings or source image (JPEG, PNG or WebP, up to 8 MB)" },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const seconds = veoSecondsFor(input.beatSeconds);
  const credits = advancedClipQuote(input.model, seconds, input.nativeAudio).totalCredits;
  const identity = `${input.jobId}:${input.shotId}:${input.revision}`;
  const params = {
    seconds,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    nativeAudio: input.nativeAudio,
    pricing: ADVANCED_VIDEO_PRICING_DATE,
    sourceHash: createHash("sha256").update(input.image).digest("hex"),
  };
  if (input.revision > 0) {
    const previous = `${input.jobId}:${input.shotId}:${input.revision - 1}`;
    const { data, error } = await table()
      .select("status")
      .eq("user_id", owner)
      .eq("motion_request_key", previous)
      .maybeSingle();
    if (error || !data || !["completed", "failed"].includes(data.status)) {
      return Response.json(
        { ok: false, reason: "Previous Veo revision must settle before a new charge" },
        { status: 409 },
      );
    }
  }
  const model = ADVANCED_VIDEO_MODELS[input.model];
  const { data: item, error } = await table()
    .insert({
      user_id: owner,
      motion_request_key: identity,
      model_id: input.model,
      kind: "video",
      prompt: input.prompt,
      params,
      credits,
      provider_cost_usd:
        seconds * (input.nativeAudio ? model.nativeUsdPerSecond : model.silentUsdPerSecond),
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const { data: existing } = await table()
      .select("id,model_id,params,prompt")
      .eq("user_id", owner)
      .eq("motion_request_key", identity)
      .maybeSingle();
    if (
      existing &&
      existing.model_id === input.model &&
      existing.prompt === input.prompt &&
      Object.entries(params).every(([key, value]) => existing.params?.[key] === value)
    ) {
      return Response.json({ ok: true, assetId: existing.id, credits, seconds });
    }
    return Response.json(
      { ok: false, reason: "Shot revision already has a different configuration" },
      { status: 409 },
    );
  }
  if (error || !item) throw new Error("Could not create motion job");

  let reservation;
  try {
    reservation = await chargeCredits({
      userId: owner,
      action: "motion_clip",
      amount: credits,
      description: `Veo motion (${input.model}, ${seconds}s)`,
      idempotencyKey: `veo-motion:${item.id}`,
    });
    if (!reservation.ledgerId) throw new Error("Missing reservation");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const insufficient = reason.startsWith("insufficient_credits:");
    const rejected = insufficient || reason.startsWith("plan_required:");
    await update(
      owner,
      item.id,
      rejected
        ? { status: "failed", error: insufficient ? "Insufficient credits" : "Video plan required" }
        : { error: "Reservation outcome needs reconciliation" },
    );
    return Response.json(
      {
        ok: false,
        reason: rejected
          ? "Credit reservation rejected"
          : "Reservation outcome needs reconciliation",
      },
      { status: insufficient ? 402 : rejected ? 403 : 503 },
    );
  }
  await update(owner, item.id, { ledger_id: reservation.ledgerId });
  try {
    const job = await falSubmit(
      model.endpoint,
      veoProviderInput({ ...input, seconds }),
      AbortSignal.timeout(12_000),
    );
    await update(owner, item.id, {
      provider_request_id: job.requestId,
      status_url: queue(job.statusUrl),
      response_url: queue(job.responseUrl),
    });
  } catch (error) {
    if (
      error instanceof FalSubmissionError &&
      [400, 401, 402, 403, 404, 422, 429].includes(error.status)
    ) {
      await settle(owner, item.id, null, "Veo rejected the submission");
    } else {
      await update(owner, item.id, { error: "Provider submission outcome needs reconciliation" });
    }
  }
  return Response.json({ ok: true, assetId: item.id, credits, seconds });
}

async function storeVideo(owner: string, id: string, raw: string) {
  const url = allowedUrl(raw, (host) => host === "fal.media" || host.endsWith(".fal.media"));
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (
    !response.ok ||
    !response.body ||
    !["video/mp4", "application/octet-stream"].includes(
      response.headers.get("content-type")?.split(";")[0] ?? "",
    )
  ) {
    throw new Error("Invalid provider media response");
  }
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_VIDEO_BYTES) throw new Error("Provider media exceeds storage limit");
      parts.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = Buffer.concat(parts, size);
  if (bytes.length < 16 || bytes.toString("ascii", 4, 8) !== "ftyp")
    throw new Error("Invalid MP4 container");
  const path = `${owner}/${id}.mp4`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error("Could not store generated clip");
  return path;
}

export async function pollVeoClip(owner: string, id: string) {
  const { data: item, error } = await table()
    .select("*")
    .eq("id", id)
    .eq("user_id", owner)
    .not("motion_request_key", "is", null)
    .maybeSingle();
  if (error) throw new Error("Could not read motion job");
  if (!item) return Response.json({ state: "failed", error: "Clip not found" }, { status: 404 });
  if (item.status === "failed" || item.error)
    return Response.json({ state: "failed", error: item.error });
  let path = item.output_url;
  if (item.status !== "completed") {
    if (!item.status_url || !item.response_url) return Response.json({ state: "pending" });
    const result = await falPoll(
      queue(item.status_url),
      queue(item.response_url),
      "video",
      AbortSignal.timeout(12_000),
    );
    if (result.state === "pending") return Response.json({ state: "pending" });
    if (result.state === "failed") {
      await settle(owner, id, null, "Veo generation failed");
      return Response.json({ state: "failed", error: "Veo generation failed" });
    }
    path = await storeVideo(owner, id, result.outputUrl);
    await settle(owner, id, path, null);
  }
  const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 900);
  if (!data) throw new Error("Could not sign generated clip");
  return Response.json({ state: "completed", url: data.signedUrl });
}
