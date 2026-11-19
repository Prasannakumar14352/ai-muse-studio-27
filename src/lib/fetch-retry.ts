// Retries provider calls that were rate-limited or briefly unavailable.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 4,
): Promise<Response> {
  let res: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    res = await fetch(url, init).catch(() => null);
    if (res && !RETRYABLE.has(res.status)) return res;
    if (i === attempts - 1) break;
    const retryAfter = Number(res?.headers.get("retry-after"));
    const wait =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 8000)
        : 800 * 2 ** i + Math.random() * 400; // ~0.8s, 1.6s, 3.2s + jitter
    await new Promise((r) => setTimeout(r, wait));
  }
  return res ?? new Response(JSON.stringify({ detail: "network error" }), { status: 502 });
}
