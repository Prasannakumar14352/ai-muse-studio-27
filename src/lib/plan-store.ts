// Local persistence for wizard drafts (originalPrompt, aiPlan, editedPlan, result, exports).
// Keeps in-progress work across refreshes. Server-side history lives in project_memory.
import type { ContentPlan, PlanModule } from "@/lib/content-plan.functions";

export type WizardDraft = {
  module: PlanModule;
  projectId?: string | null;
  originalPrompt: string;
  aiPlan: ContentPlan | null;
  editedPlan: ContentPlan | null;
  result: unknown;
  exports: Array<{ at: number; kind: string; ref?: string }>;
  updatedAt: number;
};

function key(module: PlanModule, projectId?: string | null) {
  return `wizard:${module}:${projectId ?? "default"}`;
}

export function loadDraft(module: PlanModule, projectId?: string | null): WizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(module, projectId));
    return raw ? (JSON.parse(raw) as WizardDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: WizardDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(draft.module, draft.projectId), JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch {
    /* quota; ignore */
  }
}

export function clearDraft(module: PlanModule, projectId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(module, projectId));
  } catch { /* ignore */ }
}

export function listHistory(module: PlanModule): WizardDraft[] {
  if (typeof window === "undefined") return [];
  const out: WizardDraft[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(`wizard:${module}:`)) continue;
      const v = window.localStorage.getItem(k);
      if (!v) continue;
      try { out.push(JSON.parse(v) as WizardDraft); } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
