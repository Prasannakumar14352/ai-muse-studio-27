// Async video job persistence. Job metadata lives in localStorage, per-shot
// media blobs live in IndexedDB via blob-store.ts. Used to power resumable
// generation: if the tab closes mid-run, on next mount we can enumerate
// in-progress jobs and skip shots already stored.

import { supabase } from "@/integrations/supabase/client";
import { putBlob, deleteBlob, deleteBlobsByPrefix, getObjectURL, makeBlobKey } from "@/lib/blob-store";

export type JobPhase =
  | "planning"
  | "generating_shots"
  | "voiceover"
  | "rendering"
  | "complete"
  | "failed"
  | "paused";

export type ShotStatus = "pending" | "running" | "done" | "failed";
export type ShotKind = "clip" | "image";

export type ShotRecord = {
  id: string;
  index: number;
  sceneIndex: number;
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
    // Blow away every shot blob for this job.
    await deleteBlobsByPrefix(`shot:${uid}:${id}:`).catch(() => {});
    for (const s of rec.shots) {
      if (s.blobKey) await deleteBlob(s.blobKey).catch(() => {});
    }
  }
  localStorage.removeItem(jobKey(uid, id));
  const idx = readJson<string[]>(indexKey(uid), []);
  writeJson(indexKey(uid), idx.filter((x) => x !== id));
}

export function isResumable(rec: JobRecord): boolean {
  return rec.phase !== "complete" && rec.phase !== "failed";
}
