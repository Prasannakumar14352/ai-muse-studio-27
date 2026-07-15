// Local-only prompt history for the Image Studio.
// Stores the last N prompt/settings snapshots per browser.

export type ImagePromptHistoryEntry = {
  id: string;
  at: number;
  prompt: string;
  negativePrompt?: string;
  style?: string;
  ratio?: string;
  seed?: number;
  cfg?: number;
  styleStrength?: number;
  batch?: number;
};

const KEY = "creatorflow:images:prompt-history:v1";
const MAX = 40;

export function readPromptHistory(): ImagePromptHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ImagePromptHistoryEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function pushPromptHistory(entry: Omit<ImagePromptHistoryEntry, "id" | "at">): void {
  try {
    const list = readPromptHistory();
    const next: ImagePromptHistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
    };
    // Skip duplicate immediately-previous prompt.
    if (list[0]?.prompt === next.prompt && list[0]?.style === next.style) return;
    const trimmed = [next, ...list].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function clearPromptHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
