// One-click "Build" for content-plan drafts (admin, browser-side).
//
// Runs the same Video Studio pipeline (plan → scenes + voice → render) without
// the studio screens, then uploads the file and attaches it to the day's
// drafts so they're ready for approval. Rendering happens in this tab, so it
// must stay open; builds run one at a time from a queue that survives moving
// between pages inside the app (but not a reload or closing the tab).

import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createPlanMediaUpload, attachPlanMedia } from "@/lib/social-plan.functions";
import { CONTENT_LANGUAGES, resolveContentLanguage } from "@/lib/content-language";
import type { AspectRatio, DurationSec, JobEvent, VideoBrief, VideoType } from "@/lib/video-agents";

export type AutoBuildRef = {
  platform?: string;
  format?: string;
  build?: string;
  build_topic?: string;
  build_language?: string | null;
  build_angle?: string | null;
  build_duration?: number | null;
};

export type AutoBuildStatus = {
  taskId: string;
  title: string;
  long: boolean;
  state: "queued" | "running" | "done" | "failed";
  step: string;
  progress: number; // 0..1, rough
  error?: string;
  startedAt?: number;
  finishedAt?: number;
};

type Job = { taskId: string; title: string; ref: AutoBuildRef; long: boolean };

const statuses = new Map<string, AutoBuildStatus>();
const queue: Job[] = [];
let running = false;
let controller: AbortController | null = null;
const listeners = new Set<() => void>();
let snapshot: AutoBuildStatus[] = [];

function emit() {
  snapshot = [...statuses.values()];
  listeners.forEach((l) => l());
}
function set(taskId: string, patch: Partial<AutoBuildStatus>) {
  const cur = statuses.get(taskId);
  if (!cur) return;
  statuses.set(taskId, { ...cur, ...patch });
  emit();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function isLongYoutubeRef(ref: AutoBuildRef): boolean {
  return ref.platform === "youtube" && /long/i.test(ref.format ?? "");
}

/** Only video drafts can be built automatically; images/carousels/thumbnails still open their studio. */
export function canAutoBuild(ref: AutoBuildRef): boolean {
  return (ref.build ?? "video") === "video";
}

function nearest<T extends number>(target: number, options: readonly T[]): T {
  return options.reduce(
    (best, d) => (Math.abs(d - target) < Math.abs(best - target) ? d : best),
    options[0],
  );
}

/** Plan draft → the same brief the Video Studio form would produce. */
export function briefFromRef(ref: AutoBuildRef, fallbackTitle: string): VideoBrief {
  const long = isLongYoutubeRef(ref);
  const title = (ref.build_topic ?? fallbackTitle).trim();
  const videoType: VideoType = long
    ? "youtube_long"
    : ref.platform === "youtube"
      ? "shorts"
      : "reels";
  const aspectRatio: AspectRatio = long ? "16:9" : "9:16";
  const duration: DurationSec = long
    ? nearest<DurationSec>(ref.build_duration ?? 480, [180, 300, 540, 720])
    : nearest<DurationSec>(
        ref.build_duration && ref.build_duration <= 90 ? ref.build_duration : 30,
        [30, 60],
      );
  const known = CONTENT_LANGUAGES.some((l) => l.id === ref.build_language);
  const language =
    known && ref.build_language !== "auto"
      ? ref.build_language!
      : resolveContentLanguage("auto", title);
  return {
    title,
    videoType,
    duration,
    aspectRatio,
    language,
    style: "cinematic",
    voice: "documentary_narrator",
    // Off: same-person scenes cost extra credits; motion clips cost far more.
    sameCharacter: false,
    motionMode: "off",
  };
}

/** Rough time the user should keep the tab open. */
export function estimateMinutes(ref: AutoBuildRef): string {
  if (!isLongYoutubeRef(ref)) return "3–5";
  const d = briefFromRef(ref, "x").duration;
  return d >= 540 ? "15–20" : "8–12";
}

const PHASE_LABEL: Record<string, [string, number]> = {
  planning: ["Writing the script", 0.05],
  review: ["Script ready", 0.12],
  generating_shots: ["Making the scenes", 0.15],
  voiceover: ["Recording the voiceover", 0.55],
  subtitles: ["Adding subtitles", 0.6],
  timeline: ["Assembling", 0.62],
  asset_review: ["Scenes ready", 0.65],
  rendering: ["Rendering the video", 0.66],
  validating: ["Checking the video", 0.92],
  complete: ["Finishing", 0.94],
};

function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
  e.returnValue = "A video is still building. Leaving now stops it.";
  return e.returnValue;
}

export function queueAutoBuild(job: { taskId: string; title: string; ref: AutoBuildRef }) {
  const cur = statuses.get(job.taskId);
  if (cur && (cur.state === "queued" || cur.state === "running")) return;
  const long = isLongYoutubeRef(job.ref);
  statuses.set(job.taskId, {
    taskId: job.taskId,
    title: job.ref.build_topic ?? job.title,
    long,
    state: "queued",
    step: "Waiting in line",
    progress: 0,
  });
  queue.push({ ...job, long });
  emit();
  void pump();
}

export function cancelAutoBuild(taskId: string) {
  const i = queue.findIndex((j) => j.taskId === taskId);
  if (i >= 0) {
    queue.splice(i, 1);
    statuses.delete(taskId);
    emit();
    return;
  }
  if (statuses.get(taskId)?.state === "running") controller?.abort();
}

export function clearAutoBuild(taskId: string) {
  const s = statuses.get(taskId);
  if (s && (s.state === "done" || s.state === "failed")) {
    statuses.delete(taskId);
    emit();
  }
}

async function pump() {
  if (running) return;
  running = true;
  if (typeof window !== "undefined") window.addEventListener("beforeunload", onBeforeUnload);
  try {
    while (queue.length) {
      const job = queue.shift()!;
      await runOne(job);
    }
  } finally {
    running = false;
    if (typeof window !== "undefined") window.removeEventListener("beforeunload", onBeforeUnload);
  }
}

async function runOne(job: Job) {
  const { taskId, ref, long } = job;
  controller = new AbortController();
  const signal = controller.signal;
  set(taskId, { state: "running", step: "Starting", progress: 0.02, startedAt: Date.now() });
  try {
    const { runPlanningPhase, runAssetGenerationPhase, runRenderPhase } =
      await import("@/lib/video-agents");
    const brief = briefFromRef(ref, job.title);
    const onEvent = (ev: JobEvent) => {
      const prev = statuses.get(taskId)?.progress ?? 0;
      if (ev.type === "phase") {
        if (ev.phase === "failed") return;
        const [label, p] = PHASE_LABEL[ev.phase] ?? [String(ev.phase), prev];
        set(taskId, { step: label, progress: Math.max(p, prev) });
      } else if (ev.type === "shot" && ev.total) {
        set(taskId, {
          step: `Making the scenes (${ev.done}/${ev.total})`,
          progress: Math.max(prev, 0.15 + 0.4 * (ev.done / ev.total)),
        });
      } else if (ev.type === "voiceover" && ev.total) {
        set(taskId, {
          step: `Recording the voiceover (${ev.done}/${ev.total})`,
          progress: Math.max(prev, 0.55 + 0.08 * (ev.done / ev.total)),
        });
      } else if (ev.type === "render") {
        set(taskId, {
          step: `Rendering the video (${Math.round(ev.progress * 100)}%)`,
          progress: Math.max(prev, 0.66 + 0.26 * ev.progress),
        });
      }
    };
    const runOpts = { niche: "CreatorFlow content plan", topic: brief.title, onEvent, signal };

    const { job: planned } = await runPlanningPhase(brief, runOpts);
    // No review gates here: the admin reviews the finished video at approval.
    const { bundle } = await runAssetGenerationPhase(planned.id, brief, runOpts);
    const { result } = await runRenderPhase(planned.id, bundle, { onEvent, signal, skipMp4: long });

    const blob = result.render.blob;
    if (!blob || blob.size === 0) throw new Error("The render came out empty");
    const mime = (result.render.mime || blob.type || "video/webm").split(";")[0].trim() as
      "video/mp4" | "video/webm";

    set(taskId, { step: `Uploading (${Math.round(blob.size / 1048576)} MB)`, progress: 0.96 });
    const { path, token } = await createPlanMediaUpload({ data: { taskId, mime } });
    const { error } = await supabase.storage
      .from("renders")
      .uploadToSignedUrl(path, token, blob, { contentType: mime });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    // Reels go on every post for that day; a long YouTube video stays on its own draft.
    const r = await attachPlanMedia({ data: { taskId, path, mime, sameDay: !long } });

    // Also keep reels in the Video Studio library. Skipped for long videos —
    // they can fill the browser's storage.
    if (!long) {
      try {
        const { saveGeneratedVideo } = await import("@/lib/videoLocalStore");
        await saveGeneratedVideo({
          title: brief.title,
          niche: "Content plan",
          topic: brief.title,
          styleId: brief.style,
          styleLabel: "Cinematic",
          videoType: brief.videoType,
          aspectRatio: brief.aspectRatio,
          duration_sec: result.render.duration_sec,
          extension: result.render.extension,
          mime: result.render.mime,
          youtube_title: result.seo.youtube_title,
          youtube_description: result.seo.youtube_description,
          hashtags: result.seo.hashtags,
          tags: result.seo.tags,
          pinned_comment: result.seo.pinned_comment,
          chapters: result.seo.chapters,
          subtitles_vtt: result.subtitles.content,
          video_blob: blob,
          thumbnail: result.thumbnail.url,
        });
      } catch (e) {
        console.warn("[plan-autobuild] library save skipped", e);
      }
    }

    set(taskId, {
      state: "done",
      progress: 1,
      finishedAt: Date.now(),
      step:
        r.attached > 1 ? `Ready for approval · added to ${r.attached} posts` : "Ready for approval",
    });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    const msg = aborted ? "Stopped" : e instanceof Error ? e.message : "Build failed";
    console.warn("[plan-autobuild] failed", e);
    set(taskId, { state: "failed", step: msg, error: msg, finishedAt: Date.now() });
  } finally {
    controller = null;
  }
}

export function useAutoBuilds(): AutoBuildStatus[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

export function useAutoBuild(taskId: string): AutoBuildStatus | undefined {
  return useAutoBuilds().find((s) => s.taskId === taskId);
}
