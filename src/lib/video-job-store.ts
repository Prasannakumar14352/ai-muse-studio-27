import type { VideoExportSettings } from "./video-export";
import type { SceneAudioSource } from "./advanced-video-models";
import type { PlannedAudio } from "./audio-plan";
import type { AudioSettings } from "./audio-generation";
// Async video job persistence. Job metadata lives in localStorage, per-shot
// media blobs live in IndexedDB via blob-store.ts. Used to power resumable
// generation: if the tab closes mid-run, on next mount we can enumerate
// in-progress jobs and skip shots already stored.

import { supabase } from "@/integrations/supabase/client";
import {
  putBlob,
  getBlob,
  deleteBlob,
  deleteBlobsByPrefix,
  getObjectURL,
  makeBlobKey,
} from "@/lib/blob-store";

export type JobPhase =
  | "planning"
  | "review"
  | "generating_shots"
  | "voiceover"
  | "asset_review"
  | "rendering"
  | "validating"
  | "complete"
  | "failed"
  | "paused";

export type ShotStatus = "pending" | "running" | "done" | "failed";
export type ShotKind = "clip" | "image";

export type ShotRecord = {
  id: string;
  index: number;
  sceneIndex: number;
  motionRevision?: number;
  previousAsset?: { blobKey: string; kind: ShotKind; mime: string | null };
  audioSceneId?: string;
  beatIndex: number;
  isFirstOfScene: boolean;
  text: string;
  words: number;
  prompt: string;
  motion: string;
  transition?: string;
  sceneType?: string;
  /** Dynamic Scene Detection classification. */
  sceneKind?: "static" | "dynamic";
  /** Activity name when sceneKind === "dynamic". */
  activity?: string | null;
  /** Rich AI-video prompt for dynamic beats (null for static). */
  videoPrompt?: string | null;
  /** False for b-roll shots with no person (no character reference needed). Missing = true. */
  hasCharacter?: boolean;
  status: ShotStatus;
  kind: ShotKind | null;
  blobKey: string | null;
  mime: string | null;
  attempts: number;
  error: string | null;
};

export type JobRecord = {
  id: string;
  title: string;
  niche: string;
  topic: string;
  briefJson: string;         // JSON.stringify(brief)
  phase: JobPhase;
  shotsDone: number;
  shotsFailed: number;
  shotsTotal: number;
  renderProgress: number;    // 0..1
  createdAt: string;
  updatedAt: string;
  error: string | null;
  shots: ShotRecord[];
  /** Blob key of the main character's reference portrait (same face in every scene). */
  characterRefKey?: string | null;
  audioTracks?: PlannedAudio[];
  audioMixSettings?: AudioSettings;
  exportSettings?: VideoExportSettings;
  qualityReview?: { reason: string; reviewedAt: string; warningIds: string[] };
  nativeAudioSettings?: {
    sceneAudioSource?: SceneAudioSource;
    nativeAudioVolume?: number;
    nativeAudioMutedShotIds?: string[];
  };
  audioPlanSettings?: string;
};

let cachedUserId: string | null = null;
async function currentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const { data } = await supabase.auth.getUser();
  cachedUserId = data.user?.id ?? null;
  return cachedUserId;
}
supabase.auth.onAuthStateChange(() => { cachedUserId = null; });

function base(uid: string) { return `cv:${uid}`; }
function indexKey(uid: string) { return `${base(uid)}:videojobs-index`; }
function jobKey(uid: string, id: string) { return `${base(uid)}:videojob:${id}`; }
function shotBlobKey(uid: string, jobId: string, shotId: string) {
  return `shot:${uid}:${jobId}:${shotId}`;
}

function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; }
  catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

export async function snapshotShot(jobId: string, shot: ShotRecord) {
  if (!shot.blobKey || !shot.kind) return;
  const blob = await getBlob(shot.blobKey, { localOnly: true });
  if (!blob) throw new Error("Current shot could not be saved for rollback");
  const blobKey = await saveShotBlob(jobId, `${shot.id}-history-${crypto.randomUUID()}`, blob);
  return { blobKey, kind: shot.kind, mime: shot.mime };
}

export async function removeShotSnapshot(snapshot: ShotRecord["previousAsset"]) {
  if (snapshot) await deleteBlob(snapshot.blobKey).catch(() => {});
}

export async function saveQualityReview(jobId: string, reason: string, warningIds: string[]) {
  const job = await getJob(jobId);
  if (!job) throw new Error("Video job not found");
  job.qualityReview = {
    reason: reason.trim().slice(0, 240),
    reviewedAt: new Date().toISOString(),
    warningIds,
  };
  await saveJob(job);
}

export async function motionSourceObjectURL(jobId: string, shotId: string) {
  const user = await currentUserId();
  return user ? loadShotObjectURL(shotBlobKey(user, jobId, shotId)) : null;
}

export async function createJob(
  input: Omit<JobRecord, "id" | "createdAt" | "updatedAt" | "shots" | "shotsDone" | "shotsFailed" | "shotsTotal" | "renderProgress" | "phase" | "error"> & { shots: ShotRecord[] },
): Promise<JobRecord> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rec: JobRecord = {
    id,
    title: input.title,
    niche: input.niche,
    topic: input.topic,
    briefJson: input.briefJson,
    phase: "planning",
    shots: input.shots,
    shotsDone: 0,
    shotsFailed: 0,
    shotsTotal: input.shots.length,
    renderProgress: 0,
    createdAt: now,
    updatedAt: now,
    error: null,
  };
  writeJson(jobKey(uid, id), rec);
  const idx = readJson<string[]>(indexKey(uid), []);
  writeJson(indexKey(uid), [id, ...idx.filter((x) => x !== id)]);
  return rec;
}

export async function getJob(id: string): Promise<JobRecord | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  return readJson<JobRecord | null>(jobKey(uid, id), null);
}

export async function listJobs(): Promise<JobRecord[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const idx = readJson<string[]>(indexKey(uid), []);
  const out: JobRecord[] = [];
  for (const id of idx) {
    const j = readJson<JobRecord | null>(jobKey(uid, id), null);
    if (j) out.push(j);
  }
  return out;
}

export async function saveJob(rec: JobRecord): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  rec.updatedAt = new Date().toISOString();
  writeJson(jobKey(uid, rec.id), rec);
  const idx = readJson<string[]>(indexKey(uid), []);
  if (!idx.includes(rec.id)) writeJson(indexKey(uid), [rec.id, ...idx]);
}

export async function saveShotBlob(
  jobId: string,
  shotId: string,
  blob: Blob,
): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const key = shotBlobKey(uid, jobId, shotId);
  await putBlob(key, blob);
  return makeBlobKey(key);
}

export async function loadShotObjectURL(blobKey: string): Promise<string | null> {
  return getObjectURL(blobKey);
}

export async function deleteJob(id: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const rec = readJson<JobRecord | null>(jobKey(uid, id), null);
  if (rec) {
    await deleteBlobsByPrefix(`shot:${uid}:${id}:`).catch(() => {});
    for (const s of rec.shots) {
      if (s.blobKey) await deleteBlob(s.blobKey).catch(() => {});
    }
  }
  localStorage.removeItem(jobKey(uid, id));
  // Drop any locally-saved blueprint tied to this job.
  try { localStorage.removeItem(`cv:videojob-blueprint:${id}`); } catch { /* noop */ }
  const idx = readJson<string[]>(indexKey(uid), []);
  writeJson(indexKey(uid), idx.filter((x) => x !== id));
}

export function isResumable(rec: JobRecord): boolean {
  return rec.phase !== "complete" && rec.phase !== "failed";
}

/**
 * A job left in "rendering" / "validating" after its tab was closed or
 * reloaded would show "Validating output" forever. On page load, jobs stuck
 * there for longer than any real render could take are moved back to the
 * asset-review step (their shots are kept) with a note, so Resume renders again.
 */
export async function recoverInterruptedJobs(): Promise<number> {
  const jobs = await listJobs();
  let n = 0;
  for (const j of jobs) {
    if (j.phase !== "rendering" && j.phase !== "validating") continue;
    let durationSec = 60;
    try { durationSec = Number((JSON.parse(j.briefJson) as { duration?: number }).duration) || 60; } catch { /* keep default */ }
    // Rendering runs in real time; allow 2× the video length + 10 min before calling it stuck.
    const staleAfterMs = (durationSec * 2 + 600) * 1000;
    if (Date.now() - new Date(j.updatedAt).getTime() < staleAfterMs) continue;
    j.phase = "asset_review";
    j.renderProgress = 0;
    j.error = "The last render was interrupted (the tab was closed or reloaded). Your shots are kept — resume to render again.";
    await saveJob(j);
    n++;
  }
  return n;
}
