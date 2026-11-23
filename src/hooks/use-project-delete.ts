// Shared project-delete hook with:
//  - confirmation dialog (with cascade note)
//  - immediate optimistic UI removal across every cached list that contains the row
//  - 6s Undo window backed by sonner toast
//  - success / error toasts
//  - full cache invalidation on commit so dashboard, sidebar counts, module lists all update
//
// The actual `DELETE FROM projects` runs after the undo window. All child rows
// (project_scenes, carousel_slides, generated_assets, render_jobs, scheduled_posts)
// cascade automatically via foreign keys added by migration.

import { useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";

const UNDO_MS = 6000;

// Every list/counter that could contain (or count) the deleted project.
const INVALIDATION_KEYS: QueryKey[] = [
  ["recent-projects"],
  ["dashboard-recent-projects"],
  ["dashboard-counts"],
  ["stats"],
  ["module-counts"],
  ["projects-section"],
  ["projects"],
  ["admin-recent-projects"],
  ["admin-stats"],
  ["images-library"],
  ["carousels"],
];

type Snapshot = { queryKey: QueryKey; data: unknown };

export type DeletableProject = {
  id: string;
  title?: string | null;
  /** Optional extra cleanup that runs only if the delete actually commits (e.g. IndexedDB blobs). */
  onCommit?: () => Promise<void> | void;
};

export function useProjectDelete() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(async () => {
    await Promise.all(
      INVALIDATION_KEYS.map((key) => qc.invalidateQueries({ queryKey: key })),
    );
  }, [qc]);

  const optimisticHide = useCallback(
    (id: string): Snapshot[] => {
      const snaps: Snapshot[] = [];
      for (const q of qc.getQueryCache().findAll()) {
        const data = q.state.data as unknown;
        if (!Array.isArray(data)) continue;
        const arr = data as Array<Record<string, unknown> | null | undefined>;
        if (arr.some((row) => row && (row as { id?: unknown }).id === id)) {
          snaps.push({ queryKey: q.queryKey, data });
          qc.setQueryData(
            q.queryKey,
            arr.filter((row) => !(row && (row as { id?: unknown }).id === id)),
          );
        }
      }
      return snaps;
    },
    [qc],
  );

  const restore = useCallback(
    (snaps: Snapshot[]) => {
      for (const s of snaps) qc.setQueryData(s.queryKey, s.data);
    },
    [qc],
  );

  return useCallback(
    async (project: DeletableProject): Promise<boolean> => {
      const label = shortLabel(project.title);

      const ok = await confirmDialog({
        title: "Delete this project?",
        description:
          `"${label}" will be removed from your library, the dashboard's Recent Projects, ` +
          `and all related scenes, images, carousels, and thumbnails. ` +
          `You'll have a few seconds to undo.`,
        confirmText: "Delete",
        tone: "destructive",
      });
      if (!ok) return false;

      const snapshots = optimisticHide(project.id);
      let undone = false;

      const toastId = toast.loading(`Deleting "${label}"…`, {
        description: "Related scenes, images and carousels will be removed.",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            if (undone) return;
            undone = true;
            clearTimeout(timer);
            restore(snapshots);
            toast.dismiss(toastId);
            toast.success("Delete undone", { description: `"${label}" is back in your library.` });
          },
        },
      });

      const timer = setTimeout(async () => {
        if (undone) return;
        const { error } = await supabase.from("projects").delete().eq("id", project.id);
        toast.dismiss(toastId);
        if (error) {
          restore(snapshots);
          toast.error("Couldn't delete project", { description: error.message });
          return;
        }
        try {
          await project.onCommit?.();
        } catch (e) {
          console.warn("[useProjectDelete] onCommit cleanup failed", e);
        }
        toast.success(`Deleted "${label}"`, {
          description: "Removed from Recent Projects and all related items.",
        });
        await invalidateAll();
      }, UNDO_MS);

      return true;
    },
    [invalidateAll, optimisticHide, restore],
  );
}

/** Short, toast-friendly name: the title if it's short, else the first few words of the prompt. */
export function shortLabel(title?: string | null, maxWords = 6, maxChars = 48): string {
  const clean = (title ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "Untitled project";
  const words = clean.split(" ");
  let out = words.slice(0, maxWords).join(" ");
  if (out.length > maxChars) out = out.slice(0, maxChars).replace(/\s+\S*$/, "");
  return out.length < clean.length ? `${out.replace(/[\s,.;:]+$/, "")}…` : out;
}
