import { supabase } from "@/integrations/supabase/client";
import { authFetch } from "./auth-fetch";
import { describeStudioRender, type AssetGenerationBundle } from "./video-agents";
import { loadShotObjectURL } from "./video-job-store";
import { proRenderManifest, type ProRenderManifest } from "./pro-render-manifest";
import { DEFAULT_AUDIO_SETTINGS } from "./audio-generation";
import { isAudioTrackEnabled } from "./audio-plan";
import { requestAudio } from "./audio-client";
import { mixWindows, audioPlacements } from "./audio-mixer";
import type { VideoExportSettings } from "./video-export";

export function frameBoundaries(durations: number[], fps: number) {
  let elapsed = 0;
  return [0, ...durations.map((seconds) => Math.round((elapsed += seconds) * fps))];
}

export async function renderControl(input: unknown, signal?: AbortSignal) {
  const result = await authFetch("/api/professional-render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error ?? "Render service unavailable");
  return data as {
    id: string;
    status: string;
    progress?: number;
    error?: string;
    url?: string;
    output_metadata?: {
      width: number;
      height: number;
      fps: number;
      duration: number;
      quality?: { peakDbfs?: number; blackIntervals: number; freezeCandidates: number };
    };
  };
}

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
};
const movements: Record<string, ProRenderManifest["scenes"][number]["movement"]> = {
  zoomIn: "push",
  pushIn: "push",
  zoomOut: "pull",
  panLeft: "pan-left",
  panRight: "pan-right",
};

export async function submitStudioRender(
  jobId: string,
  bundle: AssetGenerationBundle,
  settings: Omit<VideoExportSettings, "resolution"> & { resolution: "720p" | "1080p" | "4k" },
  signal: AbortSignal,
) {
  const { job, scenes, beats, beatAudio, beatRates, beatCut } = await describeStudioRender(
    jobId,
    bundle,
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to submit an export");
  const { fps } = settings;
  const frames = frameBoundaries(
    scenes.map((scene) => Number.parseFloat(scene.duration)),
    fps,
  );
  const total = frames.at(-1)!;
  if (
    total > fps * 180 ||
    scenes.length > 40 ||
    frames.slice(1).some((end, i) => end <= frames[i] || end - frames[i] > 900)
  ) {
    throw new Error("The worker supports 40 shots, 30 seconds per shot and 180 seconds total.");
  }
  if (settings.subtitles && scenes.some((scene) => (scene.on_screen_text?.length ?? 0) > 240)) {
    throw new Error(
      "At least one overlay is longer than the worker's 240-character limit. Shorten it or use browser render.",
    );
  }
  const prefix = `${user.id}/${jobId}/${crypto.randomUUID()}`;
  let index = 0;
  const upload = async (url: string) => {
    signal.throwIfAborted();
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error("Could not retrieve a source asset");
    const blob = await response.blob();
    const mime = blob.type.split(";")[0];
    const ext = extensions[mime];
    if (!ext || !blob.size || blob.size > 50 * 1024 * 1024)
      throw new Error("The worker source is unsupported or exceeds 50 MiB.");
    signal.throwIfAborted();
    const path = `${prefix}/${index++}.${ext}`;
    const { error } = await supabase.storage
      .from("professional-render-inputs")
      .upload(path, blob, { contentType: mime });
    if (error) throw new Error("Could not upload an original render asset");
    return path;
  };
  const source = bundle.brief.sceneAudioSource ?? "separate";
  const audioSettings = { ...DEFAULT_AUDIO_SETTINGS, ...bundle.brief.audio };
  const audio: ProRenderManifest["audio"] = [];
  const soundtrack: Array<{
    track: (typeof bundle.audioTracks)[number];
    gain: number;
    placements: Array<{ startFrame: number; frames: number }>;
  }> = [];
  const windows = mixWindows(
    scenes.map((_, i) => (frames[i + 1] - frames[i]) / fps),
    scenes.map((scene) => scene.audioSceneId),
  );
  if (source !== "native") {
    const levels = {
      music: audioSettings.musicVolume,
      ambience: audioSettings.ambienceVolume,
      sfx: audioSettings.sfxVolume,
    };
    for (const track of bundle.audioTracks) {
      const kind = track.request.track;
      const gain = levels[kind] * (track.gain ?? 1);
      if (!isAudioTrackEnabled(audioSettings, kind) || !gain) continue;
      const placements = audioPlacements(kind, track.sceneIds, track.offset, windows, total / fps)
        .map(({ start, end }) => ({
          startFrame: Math.round(start * fps),
          frames: Math.round(end * fps) - Math.round(start * fps),
        }))
        .filter((placement) => placement.frames > 0);
      if (placements.length) soundtrack.push({ track, gain, placements });
    }
    const narrationCount =
      audioSettings.voiceoverEnabled && audioSettings.narrationVolume
        ? beatAudio.filter(Boolean).length
        : 0;
    if (narrationCount + soundtrack.reduce((sum, item) => sum + item.placements.length, 0) > 48) {
      throw new Error("The worker supports at most 48 audio placements.");
    }
  }
  const visuals: ProRenderManifest["scenes"] = [];
  for (const [i, shot] of job.shots.entries()) {
    const url = await loadShotObjectURL(shot.blobKey!);
    if (!url) throw new Error(`Missing local source for shot ${i + 1}`);
    try {
      visuals.push({
        path: await upload(url),
        kind: shot.kind === "clip" ? "clip" : "image",
        sceneId: shot.id,
        frames: frames[i + 1] - frames[i],
        trimFrame: 0,
        movement:
          shot.kind === "image" && settings.fit === "crop"
            ? (movements[shot.motion] ?? "static")
            : "static",
        overlay: settings.subtitles ? scenes[i].on_screen_text : undefined,
        entrance: scenes[i].transition === "flash" ? "flash" : "cut",
        nativeGain:
          source !== "separate" &&
          shot.kind === "clip" &&
          !bundle.brief.nativeAudioMutedShotIds?.includes(shot.id)
            ? (bundle.brief.nativeAudioVolume ?? 0.5)
            : 0,
      });
    } finally {
      URL.revokeObjectURL(url);
    }
    if (
      source !== "native" &&
      audioSettings.voiceoverEnabled &&
      audioSettings.narrationVolume &&
      beatAudio[i]
    ) {
      const clip = bundle.voiceover[beats[i].sceneIndex];
      if (!clip?.url) throw new Error(`Narration source missing for shot ${i + 1}`);
      const length = beatCut[i] ?? beatAudio[i]!.duration / beatRates[i];
      audio.push({
        path: await upload(clip.url),
        track: "narration",
        startFrame: frames[i],
        frames: Math.min(total - frames[i], Math.max(1, Math.round(length * fps))),
        gain: audioSettings.narrationVolume,
        loop: false,
        fadeFrames: beatCut[i] ? Math.round(0.18 * fps) : 0,
        rate: beatRates[i],
      });
    }
  }
  for (const { track, gain, placements } of soundtrack) {
    const kind = track.request.track;
    if (track.asset?.status !== "ready")
      throw new Error(`A requested ${kind} asset is unavailable.`);
    const { url } = await requestAudio({ assetId: track.asset.assetId }, signal);
    if (!url) throw new Error(`Could not download ${kind} source`);
    const path = await upload(url);
    for (const placement of placements) {
      audio.push({
        path,
        track: kind,
        ...placement,
        gain,
        rate: 1,
        loop: kind === "ambience" || (kind === "music" && audioSettings.loopMusic),
        fadeFrames: Math.min(
          150,
          Math.round(
            (kind === "music"
              ? Math.min(audioSettings.fadeInSeconds, audioSettings.fadeOutSeconds)
              : kind === "ambience"
                ? 0.35
                : 0) * fps,
          ),
        ),
      });
    }
  }
  const manifest = proRenderManifest.parse({
    version: 2,
    projectId: jobId,
    projectScope: "studio",
    resolution: settings.resolution,
    fps,
    aspectRatio: settings.aspectRatio,
    quality: settings.quality,
    fit: settings.fit,
    audioSource: source,
    duckMusic: audioSettings.autoDucking,
    scenes: visuals,
    audio,
  });
  return renderControl(manifest, signal);
}
