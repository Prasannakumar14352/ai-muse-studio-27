// Persist VideoBlueprint inside projects.metadata (JSONB) OR in localStorage
// when the caller passes a projectId prefixed with `local:` (used by the
// local-only video generation flow which has no projects row yet).

import { supabase } from "@/integrations/supabase/client";
import {
  buildRenderSnapshot, initMetadata, pushVersion,
  type BlueprintSource, type RenderSnapshot,
  type VideoBlueprint, type VideoBlueprintMetadata,
} from "@/lib/video-blueprint";
import type { VideoBrief } from "@/lib/video-agents";

const KEY = "videoBlueprint" as const;
const LOCAL_PREFIX = "local:";
const LS_KEY = (id: string) => `cv:videojob-blueprint:${id.slice(LOCAL_PREFIX.length)}`;

type MetaBag = Record<string, unknown> & { [KEY]?: VideoBlueprintMetadata };

function isLocal(projectId: string): boolean {
  return projectId.startsWith(LOCAL_PREFIX);
}

async function readMetaBag(projectId: string): Promise<MetaBag> {
  if (isLocal(projectId)) {
    try {
      const raw = localStorage.getItem(LS_KEY(projectId));
      return raw ? (JSON.parse(raw) as MetaBag) : {};
    } catch { return {}; }
  }
  const { data, error } = await supabase
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  const raw = (data?.metadata ?? {}) as unknown;
  return (raw && typeof raw === "object" ? raw as MetaBag : {});
}

async function writeMetaBag(projectId: string, bag: MetaBag): Promise<void> {
  if (isLocal(projectId)) {
    try { localStorage.setItem(LS_KEY(projectId), JSON.stringify(bag)); } catch { /* quota */ }
    return;
  }
  const { error } = await supabase
    .from("projects")
    .update({ metadata: bag as unknown as never })
    .eq("id", projectId);
  if (error) throw error;
}

export async function getBlueprintMetadata(
  projectId: string,
): Promise<VideoBlueprintMetadata | null> {
  const bag = await readMetaBag(projectId);
  return bag[KEY] ?? null;
}

/** First-time bootstrap when planning completes. */
export async function initBlueprintMetadata(
  projectId: string,
  original: VideoBlueprint,
): Promise<VideoBlueprintMetadata> {
  const bag = await readMetaBag(projectId);
  const meta = initMetadata(original);
  bag[KEY] = meta;
  await writeMetaBag(projectId, bag);
  return meta;
}

/** Save an edited blueprint. Bumps version + appends to history (cap 10). */
export async function saveBlueprintEdit(
  projectId: string,
  next: VideoBlueprint,
  source: BlueprintSource = "user_edit",
  note?: string,
): Promise<VideoBlueprintMetadata> {
  const bag = await readMetaBag(projectId);
  const existing = bag[KEY];
  if (!existing) {
    const meta = initMetadata(next);
    bag[KEY] = meta;
    await writeMetaBag(projectId, bag);
    return meta;
  }
  const updated = pushVersion(existing, next, source, note);
  bag[KEY] = updated;
  await writeMetaBag(projectId, bag);
  return updated;
}

/** Restore the original AI blueprint. Recorded as a new version. */
export async function restoreOriginalBlueprint(
  projectId: string,
): Promise<VideoBlueprintMetadata | null> {
  const bag = await readMetaBag(projectId);
  const existing = bag[KEY];
  if (!existing) return null;
  const restored = pushVersion(existing, existing.originalAiBlueprint, "restore", "Restored AI original");
  bag[KEY] = restored;
  await writeMetaBag(projectId, bag);
  return restored;
}

/** Restore a specific historical version. Recorded as a new version. */
export async function restoreBlueprintVersion(
  projectId: string,
  version: number,
): Promise<VideoBlueprintMetadata | null> {
  const bag = await readMetaBag(projectId);
  const existing = bag[KEY];
  if (!existing) return null;
  const entry = existing.blueprintVersions.find((v) => v.version === version);
  if (!entry) return null;
  const restored = pushVersion(existing, entry.blueprint, "restore", `Restored v${version}`);
  bag[KEY] = restored;
  await writeMetaBag(projectId, bag);
  return restored;

/** Take an immutable snapshot at render-start. */
export async function saveRenderSnapshot(
  projectId: string,
  brief: VideoBrief,
): Promise<{ snapshot: RenderSnapshot; meta: VideoBlueprintMetadata } | null> {
  const bag = await readMetaBag(projectId);
  const existing = bag[KEY];
  if (!existing) return null;
  const snapshot = buildRenderSnapshot(existing, brief);
  const meta: VideoBlueprintMetadata = {
    ...existing,
    renderSnapshot: snapshot,
    blueprintVersionUsed: snapshot.version,
  };
  bag[KEY] = meta;
  await writeMetaBag(projectId, bag);
  return { snapshot, meta };
}

export function hasEditsSinceSnapshot(meta: VideoBlueprintMetadata): boolean {
  if (!meta.renderSnapshot) return false;
  return meta.blueprintVersion > meta.renderSnapshot.version;
}

/** Stamp explicit user approval on the current blueprint version. */
export async function approveBlueprint(
  projectId: string,
): Promise<VideoBlueprintMetadata | null> {
  const bag = await readMetaBag(projectId);
  const existing = bag[KEY];
  if (!existing) return null;
  const updated: VideoBlueprintMetadata = {
    ...existing,
    blueprintApprovedAt: new Date().toISOString(),
    approvedBlueprintVersion: existing.blueprintVersion,
  };
  bag[KEY] = updated;
  await writeMetaBag(projectId, bag);
  return updated;
}

/** True only when the current blueprint version matches the approved version. */
export function isBlueprintApproved(meta: VideoBlueprintMetadata | null): boolean {
  if (!meta) return false;
  if (!meta.blueprintApprovedAt) return false;
  return meta.approvedBlueprintVersion === meta.blueprintVersion;
}

/** Delete a local blueprint (matches deleteJob lifecycle). */
export function deleteLocalBlueprint(jobId: string): void {
  try { localStorage.removeItem(`cv:videojob-blueprint:${jobId}`); } catch { /* noop */ }
}

/** Helper for callers building the local projectId. */
export function localBlueprintId(jobId: string): string {
  return `${LOCAL_PREFIX}${jobId}`;
}
