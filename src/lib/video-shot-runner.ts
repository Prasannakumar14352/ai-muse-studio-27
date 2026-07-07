// Concurrency-limited worker pool for generating video shots (clip or image)
// in parallel, with per-shot retry and cooperative cancellation.
//
// The pool never awaits sequentially: it keeps `concurrency` workers busy at
// all times and yields shots to the caller as soon as each one resolves so
// the UI can render them live.

export type ShotJob<T> = {
  id: string;
  run: (signal: AbortSignal) => Promise<T>;
};

export type ShotOutcome<T> =
  | { id: string; ok: true; value: T; attempts: number }
  | { id: string; ok: false; error: string; attempts: number };

export type ShotRunnerOptions<T> = {
  concurrency?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  /** Fires as each shot resolves (success or terminal failure). */
  onShotSettled?: (outcome: ShotOutcome<T>) => void;
};

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_ATTEMPTS = 2;

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export async function runShotPool<T>(
  jobs: ShotJob<T>[],
  opts: ShotRunnerOptions<T> = {},
): Promise<ShotOutcome<T>[]> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const signal = opts.signal;
  const results = new Array<ShotOutcome<T>>(jobs.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      if (signal?.aborted) return;
      const idx = cursor++;
      if (idx >= jobs.length) return;
      const job = jobs[idx];
      let attempts = 0;
      let lastErr: unknown = null;
      while (attempts < maxAttempts) {
        if (signal?.aborted) return;
        attempts += 1;
        try {
          const value = await job.run(signal ?? new AbortController().signal);
          const outcome: ShotOutcome<T> = { id: job.id, ok: true, value, attempts };
          results[idx] = outcome;
          opts.onShotSettled?.(outcome);
          lastErr = null;
          break;
        } catch (err) {
          if (isAbort(err)) return;
          lastErr = err;
          // Small exponential backoff between retries.
          if (attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 300 * attempts));
          }
        }
      }
      if (lastErr) {
        const outcome: ShotOutcome<T> = {
          id: job.id,
          ok: false,
          error: lastErr instanceof Error ? lastErr.message : String(lastErr),
          attempts,
        };
        results[idx] = outcome;
        opts.onShotSettled?.(outcome);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
