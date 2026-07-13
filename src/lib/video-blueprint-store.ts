// Persist VideoBlueprint inside projects.metadata (JSONB). No new tables.
// Autosaves are debounced by the caller; this module just does raw reads/writes.

import { supabase } from "@/integrations/supabase/client";
import {
  buildRenderSnapshot, initMetadata, pushVersion,
  type BlueprintSource, type RenderSnapshot,
  type VideoBlueprint, type VideoBlueprintMetadata,
} from "@/lib/video-blueprint";
import type { VideoBrief } from "@/lib/video-agents";

const KEY = "videoBlueprint" as const;

type MetaBag = Record<string, unknown> & { [KEY]?: VideoBlueprintMetadata };

async function readMetaBag(projectId: string): Promise<MetaBag> {
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
  const { error } = await supabase
    .from("projects")
    .update({ metadata: bag })
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
    // Bootstrap on the fly if planning meta was never written.
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

/** Take an immutable snapshot at render-start. Called by the render entrypoint. */
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

/** True when the current blueprint has advanced past the snapshot used to render. */
export function hasEditsSinceSnapshot(meta: VideoBlueprintMetadata): boolean {
  if (!meta.renderSnapshot) return false;
  return meta.blueprintVersion > meta.renderSnapshot.version;
}
