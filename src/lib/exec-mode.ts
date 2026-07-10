// Execution mode router.
//
// The platform runs every generation through one of three modes:
//   - production: real Lovable AI / videogen providers configured, real output.
//   - fallback:   real provider failed for this run; use best-effort placeholders
//                 but keep the workflow moving.
//   - development: no real provider available; deterministic demo assets so the
//                 UI is fully testable end-to-end.
//
// Normal users must NEVER see raw provider errors, secret keys, or stack traces.
// Use `safeErrorMessage(err)` to convert anything thrown by a provider into a
// short, friendly line suitable for the UI and for `render_jobs.safe_error_message`.

export type ExecMode = "production" | "fallback" | "development";

export type RunResult<T> =
  | { mode: "production"; ok: true; data: T }
  | { mode: "fallback"; ok: true; data: T; note: string }
  | { mode: "development"; ok: true; data: T; note: string }
  | { ok: false; mode: ExecMode; safeMessage: string };

/** Run `real()` in production. On throw, try `fallback()`. If both fail, degrade
 *  to `demo()` (dev mode) and return a user-safe message on hard failure. */
export async function runWithFallback<T>(opts: {
  real: () => Promise<T>;
  fallback?: () => Promise<T>;
  demo?: () => Promise<T> | T;
  /** Skip `real()` entirely — e.g. when a required provider key is missing. */
  forceDev?: boolean;
}): Promise<RunResult<T>> {
  if (!opts.forceDev) {
    try {
      const data = await opts.real();
      return { mode: "production", ok: true, data };
    } catch (err) {
      console.warn("[exec-mode] production failed, trying fallback", err);
      if (opts.fallback) {
        try {
          const data = await opts.fallback();
          return { mode: "fallback", ok: true, data, note: "Used fallback provider." };
        } catch (err2) {
          console.warn("[exec-mode] fallback failed", err2);
        }
      }
    }
  }
  if (opts.demo) {
    const data = await opts.demo();
    return {
      mode: "development", ok: true, data,
      note: "Generation completed using demo assets. You can retry the final render later.",
    };
  }
  return {
    ok: false, mode: "development",
    safeMessage: "Generation is temporarily unavailable. Please try again in a moment.",
  };
}

/** Convert any thrown value into a short, user-safe line. */
export function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const lower = raw.toLowerCase();
  if (lower.includes("rate") && lower.includes("limit")) return "We're a little busy — please retry in a moment.";
  if (lower.includes("credit") || lower.includes("quota") || lower.includes("billing") || lower.includes("402"))
    return "This generation couldn't complete. Please try again shortly.";
  if (lower.includes("timeout") || lower.includes("timed out")) return "Generation took too long. Please retry.";
  if (lower.includes("api key") || lower.includes("unauthorized") || lower.includes("401"))
    return "Generation is temporarily unavailable.";
  if (lower.includes("network") || lower.includes("fetch failed")) return "Network hiccup — please retry.";
  return "Something went wrong. Please try again.";
}
