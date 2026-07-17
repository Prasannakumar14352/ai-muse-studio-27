import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGenerationJobFn, type GenerationJob } from "@/lib/generation-jobs.functions";

/**
 * Polls a generation job until it reaches a terminal state.
 * Returns the latest snapshot for progress UI.
 */
export function useGenerationJob(jobId: string | null, intervalMs = 2000) {
  const get = useServerFn(getGenerationJobFn);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) { setJob(null); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const j = await get({ data: { id: jobId } });
        if (cancelled) return;
        setJob(j);
        const terminal = j && ["completed", "failed", "cancelled"].includes(j.status);
        if (!terminal) timer = setTimeout(tick, intervalMs);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [jobId, intervalMs, get]);

  return { job, error, isTerminal: !!job && ["completed", "failed", "cancelled"].includes(job.status) };
}
