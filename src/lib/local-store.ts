// Per-user browser-local storage for generated content.
// Nothing here touches the database — all data is scoped to the signed-in
// user's browser and lost on logout / clear / other device.

import { supabase } from "@/integrations/supabase/client";

export type Scene = { n: number; visual: string; voiceover: string; duration: string; on_screen_text?: string };
export type Prompt = { n: number; prompt: string; style: string };
export type CarouselSlide = {
  n: number;
  role: string;           // e.g. "Cover", "Point 1", "CTA"
  headline: string;
  body: string;
  visual: string;
  // Optional richer fields (populated by AI-generated carousels).
  label?: string;
  emoji?: string;
  bullets?: string[];
  bottom_highlight?: string;
};

export type SlideTextOverlay = {
  id: string;
  kind: "text";
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  fontSize: number;
  color: string;
  bg: string;
  weight: 400 | 600 | 700 | 800 | 900;
  align: "left" | "center" | "right";
  fontFamily: string;
};
export type SlideLogoOverlay = {
  id: string;
  kind: "logo";
  src: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  opacity: number;
  rounded: boolean;
};
export type SlideOverlay = SlideTextOverlay | SlideLogoOverlay;
export type SlideOverlaySet = { overlays: SlideOverlay[] };

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
  /** Blob-store keys of the reel's scene images (saved on this device). */
  scene_images?: (string | null)[] | null;
  carousel_slides?: CarouselSlide[] | null;
  slide_overlays?: Record<number, SlideOverlaySet> | null;
  aspect_ratio?: string | null;
  slide_count?: number | null;
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

let cachedUserId: string | null = null;

export async function currentUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const { data } = await supabase.auth.getUser();
  cachedUserId = data.user?.id ?? null;
  return cachedUserId;
}

supabase.auth.onAuthStateChange(() => { cachedUserId = null; });

function base(userId: string) { return `cv:${userId}`; }

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function safeWrite(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ---------- outputs ----------

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
    scene_images: existing?.scene_images ?? null,
    carousel_slides: existing?.carousel_slides ?? null,
    slide_overlays: existing?.slide_overlays ?? null,
    aspect_ratio: existing?.aspect_ratio ?? null,
    slide_count: existing?.slide_count ?? null,
    video_url: existing?.video_url ?? null,
    render_diagnostics: existing?.render_diagnostics,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  safeWrite(`${base(uid)}:output:${projectId}`, next);
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

// ---------- image gen logs ----------

export async function pushImageGenLog(entry: Omit<ImageGenLog, "id" | "created_at">): Promise<void> {
  const uid = await currentUserId(); if (!uid) return;
  const key = `${base(uid)}:image-gens`;
  const list = safeParse<ImageGenLog[]>(localStorage.getItem(key), []);
  const full: ImageGenLog = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...entry };
  safeWrite(key, [full, ...list].slice(0, 50));
}

export async function listImageGenLogs(): Promise<ImageGenLog[]> {
  const uid = await currentUserId(); if (!uid) return [];
  return safeParse<ImageGenLog[]>(localStorage.getItem(`${base(uid)}:image-gens`), []);
}

// ---------- export / import / clear ----------

export type LocalExportBundle = {
  version: 1;
  exported_at: string;
  user_id: string;
  outputs: LocalOutput[];
  image_gens: ImageGenLog[];
};

export async function exportAll(): Promise<LocalExportBundle> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    user_id: uid,
    outputs: await listOutputs(),
    image_gens: await listImageGenLogs(),
  };
}

export async function importAll(bundle: LocalExportBundle): Promise<{ outputs: number; logs: number }> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  if (!bundle || bundle.version !== 1) throw new Error("Unsupported bundle version");
  let outCount = 0;
  for (const o of bundle.outputs ?? []) {
    await saveOutput(o.project_id, o);
    outCount++;
  }
  const existingLogs = await listImageGenLogs();
  const merged = [...(bundle.image_gens ?? []), ...existingLogs].slice(0, 100);
  safeWrite(`${base(uid)}:image-gens`, merged);
  return { outputs: outCount, logs: (bundle.image_gens ?? []).length };
}

export async function clearAll(): Promise<void> {
  const uid = await currentUserId(); if (!uid) return;
  const prefix = `${base(uid)}:`;
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) toDelete.push(k);
  }
  // Only this browser's copy is cleared — the account copy stays, and comes
  // back on the next load.
  const { withoutCloudSync } = await import("@/lib/cloud-sync");
  await withoutCloudSync(() => toDelete.forEach((k) => localStorage.removeItem(k)));
  try { localStorage.removeItem(`cvsync:hydrated:${uid}`); } catch { /* ignore */ }
}
