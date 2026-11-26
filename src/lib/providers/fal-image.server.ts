/**
 * Raw synchronous fal call (https://fal.run/<endpoint>). Server-only.
 *
 * This is ONLY the transport: no auth, no plan check, no credit charging, no
 * budget. Every caller must do those first:
 *   - the paid image route (generate-image.ts) reserves user credits before calling it.
 *   - src/lib/promo-studio/** reserves company budget (withSpend) before calling it.
 * Never import this from a route component, a component, or a *.functions.ts
 * module that isn't behind requireAdmin / a credit charge.
 */

export type FalOut = { images?: Array<{ url?: string; content_type?: string }>; detail?: unknown };

export type FalRunOptions = {
  /** Abort signal (e.g. AbortSignal.timeout(20_000)). Omitted = no timeout, the original route behaviour. */
  signal?: AbortSignal;
};

/**
 * POST the input to fal's sync endpoint. Returns the raw Response plus the
 * parsed JSON body ({} when the body isn't JSON). Network errors throw.
 */
export async function falRunSync(
  endpoint: string,
  body: Record<string, unknown>,
  opts: FalRunOptions = {},
): Promise<{ res: Response; out: FalOut }> {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("Image generation is not configured (missing FAL_KEY).");
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  return { res, out: (await res.json().catch(() => ({}))) as FalOut };
}
