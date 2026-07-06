// Per-user browser-local storage for generated content.
// Nothing here touches the database — all data is scoped to the signed-in
// user's browser and lost on logout / clear / other device.

import { supabase } from "@/integrations/supabase/client";

export type Scene = { n: number; visual: string; voiceover: string; duration: string };
export type Prompt = { n: number; prompt: string; style: string };

export type LocalOutput = {
  id: string;
  project_id: string;
  title: string;
  hook: string;
  script: string;
  captions: string;
  hashtags: string[];
  scenes: Scene[];
  image_prompts: Prompt[];
  thumbnail_ideas: string[];
  carousel_images?: (string | null)[] | null;
  video_url?: string | null;
  render_diagnostics?: unknown;
  updated_at: string;
};

export type ImageGenLog = {
  id: string;
  created_at: string;
  prompt: string;
  style: string;
  ratio: string;
  full_prompt: string;
  request: unknown;
  response: unknown;
  errors: string[];
  success_count: number;
  failure_count: number;
  duration_ms: number;
};

export type SavedAsset = {
  id: string;
  created_at: string;
  asset_type: "image" | "video" | "carousel";
  prompt: string;
  style: string;
  aspect_ratio: string;
  image?: string;
};

let cachedUserId: string | null = null;

export async function currentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const { data } = await supabase.auth.getUser();
  cachedUserId = data.user?.id ?? null;
  return cachedUserId;
}

// Wipe cache when auth changes so the next call re-reads.
supabase.auth.onAuthStateChange(() => { cachedUserId = null; });

function base(userId: string) {
  return `cv:${userId}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function safeWrite(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ---------- outputs (per project) ----------

export async function getOutput(projectId: string): Promise<LocalOutput | null> {
  const uid = await currentUserId(); if (!uid) return null;
  return safeParse<LocalOutput | null>(localStorage.getItem(`${base(uid)}:output:${projectId}`), null);
}

export async function saveOutput(projectId: string, patch: Partial<LocalOutput>): Promise<LocalOutput> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const existing = await getOutput(projectId);
  const next: LocalOutput = {
    id: existing?.id ?? crypto.randomUUID(),
    project_id: projectId,
    title: existing?.title ?? "",
    hook: existing?.hook ?? "",
    script: existing?.script ?? "",
    captions: existing?.captions ?? "",
    hashtags: existing?.hashtags ?? [],
    scenes: existing?.scenes ?? [],
    image_prompts: existing?.image_prompts ?? [],
    thumbnail_ideas: existing?.thumbnail_ideas ?? [],
    carousel_images: existing?.carousel_images ?? null,
    video_url: existing?.video_url ?? null,
    render_diagnostics: existing?.render_diagnostics,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  safeWrite(`${base(uid)}:output:${projectId}`, next);
  // Track index for gallery queries.
  const idxKey = `${base(uid)}:outputs-index`;
  const idx = safeParse<string[]>(localStorage.getItem(idxKey), []);
  if (!idx.includes(projectId)) safeWrite(idxKey, [projectId, ...idx]);
  return next;
}

export async function deleteOutput(projectId: string): Promise<void> {
  const uid = await currentUserId(); if (!uid) return;
  localStorage.removeItem(`${base(uid)}:output:${projectId}`);
  const idxKey = `${base(uid)}:outputs-index`;
  const idx = safeParse<string[]>(localStorage.getItem(idxKey), []);
  safeWrite(idxKey, idx.filter((x) => x !== projectId));
}

export async function listOutputs(): Promise<LocalOutput[]> {
  const uid = await currentUserId(); if (!uid) return [];
  const idx = safeParse<string[]>(localStorage.getItem(`${base(uid)}:outputs-index`), []);
  const results: LocalOutput[] = [];
  for (const pid of idx) {
    const o = safeParse<LocalOutput | null>(localStorage.getItem(`${base(uid)}:output:${pid}`), null);
    if (o) results.push(o);
  }
  return results;
}

// ---------- image generation debug logs ----------

export async function pushImageGenLog(entry: Omit<ImageGenLog, "id" | "created_at">): Promise<void> {
  const uid = await currentUserId(); if (!uid) return;
  const key = `${base(uid)}:image-gens`;
  const list = safeParse<ImageGenLog[]>(localStorage.getItem(key), []);
  const full: ImageGenLog = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...entry };
  safeWrite(key, [full, ...list].slice(0, 50)); // cap to 50 logs
}

export async function listImageGenLogs(): Promise<ImageGenLog[]> {
  const uid = await currentUserId(); if (!uid) return [];
  return safeParse<ImageGenLog[]>(localStorage.getItem(`${base(uid)}:image-gens`), []);
}

// ---------- saved library assets ----------

export async function addAsset(entry: Omit<SavedAsset, "id" | "created_at">): Promise<void> {
  const uid = await currentUserId(); if (!uid) return;
  const key = `${base(uid)}:assets`;
  const list = safeParse<SavedAsset[]>(localStorage.getItem(key), []);
  const full: SavedAsset = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...entry };
  safeWrite(key, [full, ...list].slice(0, 200));
}

export async function listAssets(type?: SavedAsset["asset_type"]): Promise<SavedAsset[]> {
  const uid = await currentUserId(); if (!uid) return [];
  const list = safeParse<SavedAsset[]>(localStorage.getItem(`${base(uid)}:assets`), []);
  return type ? list.filter((a) => a.asset_type === type) : list;
}
