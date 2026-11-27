import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chargeCredits } from "./credits-guard.server";
import { FalSubmissionError, falPoll, falSubmit, isFalConfigured } from "./fal.server";
import {
  AUDIO_MODELS,
  AUDIO_PRICING_VERSION,
  audioCredits,
  buildAudioProviderInput,
  type AudioRequest,
  type GeneratedAudio,
} from "./audio-generation";

const BUCKET = "video-generated-audio";
const MAX_BYTES = 24 * 1024 * 1024;
const db = () => supabaseAdmin as unknown as SupabaseClient;
const table = () => db().from("video_audio_generations");

type Row = {
  id: string;
  user_id: string;
  track: AudioRequest["track"];
  status: GeneratedAudio["status"];
  credits: number;
  duration: number;
  prompt: string;
  ledger_id: string | null;
  provider_request_id: string | null;
  status_url: string | null;
  response_url: string | null;
  storage_path: string | null;
  error: string | null;
};

export class AudioServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function audioGenerationEnabled() {
  return process.env.VIDEO_PAID_AUDIO_ENABLED === "true";
}

function secureUrl(raw: string, hosts: (hostname: string) => boolean) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts(url.hostname)
  ) {
    throw new Error("Untrusted provider URL");
  }
  return url;
}

export function isMp3(bytes: Uint8Array) {
  let start = 0;
  if (bytes.length > 10 && bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
    if (bytes.subarray(6, 10).some((value) => value > 127)) return false;
    start = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
  }
  const frame = (offset: number) => {
    if (offset + 4 > bytes.length || bytes[offset] !== 255 || (bytes[offset + 1] & 0xe0) !== 0xe0) {
      return 0;
    }
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const rateIndex = (bytes[offset + 2] >> 2) & 3;
    const bitrateIndex = bytes[offset + 2] >> 4;
    if (
      version !== 3 ||
      layer !== 1 ||
      rateIndex === 3 ||
      bitrateIndex === 0 ||
      bitrateIndex === 15
    ) {
      return 0;
    }
    const bitrate = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][
      bitrateIndex
    ];
    const sampleRate = [44100, 48000, 32000][rateIndex];
    return Math.floor((144000 * bitrate) / sampleRate) + ((bytes[offset + 2] >> 1) & 1);
  };
  let frames = 0;
  while (start < bytes.length) {
    if (
      frames >= 2 &&
      bytes.length - start === 128 &&
      bytes[start] === 84 &&
      bytes[start + 1] === 65 &&
      bytes[start + 2] === 71
    )
      break;
    const length = frame(start);
    if (!length || start + length > bytes.length) return false;
    start += length;
    frames++;
  }
  return frames >= 2;
}

async function downloadAudio(raw: string) {
  const url = secureUrl(raw, (host) => host === "fal.media" || host.endsWith(".fal.media"));
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  const mime = res.headers.get("content-type")?.split(";")[0];
  if (
    !res.ok ||
    !res.body ||
    !["audio/mpeg", "audio/mp3", "application/octet-stream"].includes(mime ?? "")
  ) {
    throw new Error("Provider audio download failed");
  }
  if (Number(res.headers.get("content-length")) > MAX_BYTES)
    throw new Error("Audio file too large");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Audio file too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!isMp3(bytes)) throw new Error("Provider returned invalid MP3 data");
  return bytes;
}

async function update(row: Row, values: Partial<Row>) {
  const { data, error } = await table()
    .update(values)
    .eq("id", row.id)
    .eq("user_id", row.user_id)
    .select()
    .single();
  if (error || !data) throw new AudioServiceError("Could not save audio state", 503);
  return data as Row;
}

async function describe(row: Row): Promise<GeneratedAudio> {
  const result: GeneratedAudio = {
    assetId: row.id,
    track: row.track,
    status: row.status,
    credits: row.credits,
    duration: row.duration,
    error: row.error ?? undefined,
  };
  if (row.status === "ready" && row.storage_path) {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, 900);
    if (error || !data) throw new AudioServiceError("Audio is temporarily unavailable", 503);
    result.url = data.signedUrl;
  }
  return result;
}

async function settle(row: Row, path: string | null, failure: string | null) {
  const { data, error } = await db().rpc("settle_video_audio", {
    owner_id: row.user_id,
    asset: row.id,
    object_path: path,
    failure,
  });
  if (error || !data) throw new AudioServiceError("Audio settlement is pending", 503);
  return describe(data as Row);
}

export async function startAudio(userId: string, input: AudioRequest) {
  if (!audioGenerationEnabled())
    throw new AudioServiceError("Paid audio generation is disabled", 503);
  if (!isFalConfigured()) throw new AudioServiceError("Audio provider is missing FAL_KEY", 503);

  const credits = audioCredits(input.track, input.duration);
  const { data, error } = await db().rpc("admit_video_audio", {
    owner_id: userId,
    job: input.jobId,
    layer: input.track,
    track_slot: input.slot,
    version: input.revision,
    audio_prompt: input.prompt,
    seconds: input.duration,
    credit_amount: credits,
    pricing: AUDIO_PRICING_VERSION,
  });
  if (error || !data) throw new AudioServiceError("Could not create audio request", 503);
  if (data.error) throw new AudioServiceError(data.error, data.error.includes("limit") ? 429 : 409);
  let row = data.row as Row;
  if (!data.created) {
    if (row.prompt !== input.prompt || row.duration !== input.duration) {
      throw new AudioServiceError("Audio slot already has a different request", 409);
    }
    return describe(row);
  }

  let reservation;
  try {
    reservation = await chargeCredits({
      userId,
      action: "video_audio",
      amount: credits,
      description: `Video ${input.track} (${input.duration}s)`,
      idempotencyKey: `video-audio:${row.id}`,
    });
    if (!reservation.ledgerId) throw new Error("Missing ledger reservation");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const insufficient = message.startsWith("insufficient_credits:");
    if (insufficient || message.startsWith("plan_required:")) {
      const reason = insufficient
        ? "Insufficient credits"
        : "Video access is required to generate audio";
      await update(row, { status: "failed", error: reason });
      await db().rpc("discard_unreserved_audio", { asset: row.id, owner_id: userId });
      throw new AudioServiceError(reason, insufficient ? 402 : 403);
    }
    await update(row, { status: "uncertain", error: "Credit reservation requires reconciliation" });
    throw new AudioServiceError("Credit reservation requires reconciliation", 503);
  }

  row = await update(row, { ledger_id: reservation.ledgerId });

  try {
    const provider = await falSubmit(
      AUDIO_MODELS[input.track],
      buildAudioProviderInput(input),
      AbortSignal.timeout(12_000),
    );
    const queueHost = (host: string) => host === "queue.fal.run";
    const saved = await update(row, {
      status: "queued",
      provider_request_id: provider.requestId,
      status_url: secureUrl(provider.statusUrl, queueHost).href,
      response_url: secureUrl(provider.responseUrl, queueHost).href,
    });
    return describe(saved);
  } catch (error) {
    if (
      error instanceof FalSubmissionError &&
      [400, 401, 402, 403, 404, 422, 429].includes(error.status)
    ) {
      return settle(row, null, "Audio provider rejected the request");
    }
    // A timeout or interrupted write may follow an accepted provider request.
    // Never submit this slot again until an operator reconciles the reservation.
    return describe(
      await update(row, {
        status: "uncertain",
        error: "Provider submission requires reconciliation",
      }),
    );
  }
}

const inFlightPolls = new Map<string, Promise<GeneratedAudio>>();

export function pollAudio(userId: string, assetId: string) {
  const key = `${userId}:${assetId}`;
  const existing = inFlightPolls.get(key);
  if (existing) return existing;
  const poll = readAudioStatus(userId, assetId).finally(() => {
    inFlightPolls.delete(key);
  });
  inFlightPolls.set(key, poll);
  return poll;
}

async function readAudioStatus(userId: string, assetId: string) {
  const { data, error } = await table()
    .select()
    .eq("id", assetId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new AudioServiceError("Could not load audio status", 503);
  if (!data) throw new AudioServiceError("Audio asset not found", 404);
  const row = data as Row;
  if (row.status !== "queued" || !row.status_url || !row.response_url || !row.ledger_id)
    return describe(row);

  const queueHost = (host: string) => host === "queue.fal.run";
  const result = await falPoll(
    secureUrl(row.status_url, queueHost).href,
    secureUrl(row.response_url, queueHost).href,
    "audio",
    AbortSignal.timeout(10_000),
  ).catch(() => ({ state: "pending" as const }));
  if (result.state === "pending") return describe(row);

  if (result.state === "failed") return settle(row, null, "Audio generation failed");

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await downloadAudio(result.outputUrl);
  } catch {
    // Storage/network delivery can recover on a subsequent poll. Do not resubmit.
    throw new AudioServiceError("Could not retrieve valid provider audio", 503);
  }
  const path = `${userId}/${row.id}.mp3`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (uploadError) throw new AudioServiceError("Could not store generated audio", 503);

  return settle(row, path, null);
}
