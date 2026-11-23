// Browser-side voiceover requests go through one small queue: at most 3 at a
// time, and a short retry if the provider is busy. Without this, a 12-scene
// video fired 12 requests at once and the provider rejected about half.
import { authFetch } from "@/lib/auth-fetch";

const MAX_CONCURRENT = 3;
let active = 0;
const waiting: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
}
function release() {
  active -= 1;
  waiting.shift()?.();
}

/** POST /api/tts through the shared queue; retries busy/5xx responses twice. */
/** `language`: the voice language (English name, e.g. "Telugu"); omitted = guessed from the text. */
export async function ttsFetch(text: string, voice: string | undefined, language?: string | null): Promise<Response> {
  await acquire();
  try {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await authFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, ...(language ? { language } : {}) }),
      });
      if (![429, 502, 503, 504].includes(res.status)) return res;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
    }
    return res!;
  } finally {
    release();
  }
}
