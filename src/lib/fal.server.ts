// fal.ai queue adapter (server-only). One API key gives access to Seedance,
// FLUX, ElevenLabs and hundreds of other models.
//   submit  → POST https://queue.fal.run/<endpoint>      → { request_id, status_url, response_url }
//   status  → GET  status_url                            → { status: IN_QUEUE | IN_PROGRESS | COMPLETED }
//   result  → GET  response_url                          → model output JSON
import type { CatalogModel } from "@/lib/model-catalog";

export type GenerationInput = {
  prompt: string;
  durationSec?: number;
  aspectRatio?: string;
  voice?: string;
};

function falKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("Model Studio is not configured yet (missing FAL_KEY).");
  return key;
}

export function isFalConfigured(): boolean {
  return Boolean(process.env.FAL_KEY);
}

const IMAGE_SIZE: Record<string, string> = {
  "1:1": "square_hd",
  "9:16": "portrait_16_9",
  "16:9": "landscape_16_9",
};

export function buildFalInput(
  model: CatalogModel,
  input: GenerationInput,
): Record<string, unknown> {
  if (model.kind === "video") {
    return {
      prompt: input.prompt,
      duration: String(input.durationSec ?? 5),
      aspect_ratio: input.aspectRatio ?? "16:9",
      resolution: "720p",
    };
  }
  if (model.kind === "image") {
    return {
      prompt: input.prompt,
      image_size: IMAGE_SIZE[input.aspectRatio ?? "1:1"] ?? "square_hd",
      num_images: 1,
      enable_safety_checker: true,
    };
  }
  return { text: input.prompt, voice: input.voice ?? "Aria" };
}

async function falFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Key ${falKey()}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(url, { ...init, headers, ...(init.signal ? { redirect: "error" as const } : {}) });
}

export class FalSubmissionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function falSubmit(
  endpoint: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const res = await falFetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    signal,
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: unknown;
  };
  if (!res.ok || !body.request_id || !body.status_url || !body.response_url) {
    throw new FalSubmissionError(
      res.status,
      `Provider rejected the request (${res.status}): ${JSON.stringify(body.detail ?? body).slice(0, 300)}`,
    );
  }
  return { requestId: body.request_id, statusUrl: body.status_url, responseUrl: body.response_url };
}

export type FalPoll =
  | { state: "pending" }
  | { state: "completed"; outputUrl: string }
  | { state: "failed"; error: string };

export async function falPoll(
  statusUrl: string,
  responseUrl: string,
  kind: CatalogModel["kind"],
  signal?: AbortSignal,
): Promise<FalPoll> {
  const sRes = await falFetch(statusUrl, { signal });
  const s = (await sRes.json().catch(() => ({}))) as { status?: string };
  if (!sRes.ok) return { state: "pending" }; // transient — try again next poll
  if (s.status !== "COMPLETED") return { state: "pending" };

  const rRes = await falFetch(responseUrl, { signal });
  const r = (await rRes.json().catch(() => ({}))) as {
    video?: { url?: string };
    audio?: { url?: string };
    images?: Array<{ url?: string }>;
    detail?: unknown;
  };
  if (rRes.status === 429 || rRes.status >= 500) return { state: "pending" };
  if (!rRes.ok) {
    return {
      state: "failed",
      error: `Generation failed (${rRes.status}): ${JSON.stringify(r.detail ?? r).slice(0, 300)}`,
    };
  }
  const url =
    kind === "video" ? r.video?.url : kind === "audio" ? r.audio?.url : r.images?.[0]?.url;
  if (!url) return { state: "failed", error: "Provider returned no output file" };
  return { state: "completed", outputUrl: url };
}
