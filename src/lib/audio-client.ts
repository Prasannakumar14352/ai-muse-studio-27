import { scheduleAudioMix } from "./audio-mixer";
import { authFetch } from "./auth-fetch";
import type { AudioRequest, GeneratedAudio } from "./audio-generation";

export async function requestAudio(
  input: AudioRequest | { assetId: string },
  signal?: AbortSignal,
) {
  const response = await authFetch("/api/generate-audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  const result = (await response.json()) as GeneratedAudio;
  if (!response.ok) throw new Error(result.error ?? "Audio request failed");
  return result;
}

export async function generateAudio(input: AudioRequest, signal?: AbortSignal) {
  return waitForAudio(await requestAudio(input, signal), signal);
}

export async function waitForAudio(asset: GeneratedAudio, signal?: AbortSignal) {
  for (
    let attempt = 0;
    attempt < 90 && ["queued", "submitting"].includes(asset.status);
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 1000 * (attempt + 1))));
    signal?.throwIfAborted();
    try {
      asset = await requestAudio({ assetId: asset.assetId }, signal);
    } catch {
      signal?.throwIfAborted();
    }
  }
  return asset;
}

export async function decodeAudioAssets<T extends { asset?: GeneratedAudio; error?: string }>(
  tracks: T[],
): Promise<Array<T & { buffer: AudioBuffer }>> {
  if (!tracks.length) return [];
  const context = new OfflineAudioContext(1, 1, 48000);
  return Promise.all(
    tracks.map(async (track) => {
      if (track.error || track.asset?.status !== "ready") {
        throw new Error(track.error ?? track.asset?.error ?? "An enabled audio track is pending");
      }
      const refreshed = await requestAudio({ assetId: track.asset.assetId });
      if (!refreshed.url) throw new Error("Generated audio is unavailable");
      const response = await fetch(refreshed.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error("Generated audio download failed");
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (!buffer.length) throw new Error("Generated audio is empty");
      return { ...track, buffer };
    }),
  );
}

export async function previewAudioMix(
  input: Omit<Parameters<typeof scheduleAudioMix>[0], "context" | "destination" | "time">,
) {
  const rate = 44100;
  const duration = input.durations.reduce((sum, seconds) => sum + seconds, 0);
  if (duration <= 0 || duration > 300)
    throw new Error("Combined previews support up to five minutes");
  const context = new OfflineAudioContext(2, Math.ceil(duration * rate), rate);
  scheduleAudioMix({ ...input, context, destination: context.destination, time: 0 });
  const buffer = await context.startRendering();
  const data = new ArrayBuffer(44 + buffer.length * 4);
  const view = new DataView(data);
  const text = (offset: number, value: string) => {
    [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  };
  text(0, "RIFF");
  view.setUint32(4, data.byteLength - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data.byteLength - 44, true);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let i = 0; i < buffer.length; i++) {
    view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, left[i])) * 32767, true);
    view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, right[i])) * 32767, true);
  }
  return new Blob([data], { type: "audio/wav" });
}
