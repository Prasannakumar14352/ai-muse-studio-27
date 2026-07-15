/**
 * Client-side helper for the streaming `/api/generate-image` endpoint.
 *
 * The endpoint pipes the AI gateway's SSE stream directly to the browser to
 * avoid Cloudflare's 100s buffered-response timeout (524). Callers just want
 * a single final `image` data URL, so this helper consumes the stream and
 * returns the last `image_generation.completed` (or the last partial if the
 * stream ends early) as a `data:image/png;base64,...` string.
 *
 * The returned shape matches what every caller previously read from the
 * non-streaming JSON response, so switching call sites is a one-line change.
 */
export type GenerateImageRequest = {
  prompt: string;
  style?: string;
  ratio?: string;
  background?: "transparent" | "opaque";
  quality?: "low" | "medium" | "high";
  model?: string;
  /** Optional input image (data URL) for edit / restyle operations. Gemini only. */
  image?: string;
  /** Additional subject reference images (data URLs). */
  referenceImages?: string[];
  /** Additional style-only reference images (data URLs). */
  styleImages?: string[];
  /** Negative prompt — things to avoid. Appended as an instruction. */
  negativePrompt?: string;
  /** Optional seed for repeatability (surfaced to model as a hint). */
  seed?: number;
  /** Prompt-adherence hint (analog of CFG scale, 1–20). */
  cfg?: number;
  /** How strongly style images influence output (0–100). */
  styleStrength?: number;
  /** Editing op — the server prepends an instruction the model can follow. */
  operation?: "generate" | "upscale" | "removeBg" | "inpaint" | "outpaint" | "eraser";
  /** For inpaint/eraser: natural-language mask ("the person on the left"). */
  maskHint?: string;
  /** For outpaint: which side(s) to extend. */
  outpaintDirection?: "left" | "right" | "top" | "bottom" | "all";
  /** Optional callback for partial-frame previews (e.g. blurry live preview). */
  onPartial?: (dataUrl: string) => void;
  /** Optional abort signal to cancel the request. */
  signal?: AbortSignal;
};

export type GenerateImageResult = {
  image: string | null;
  error: string | null;
  status: number;
};

type SseFrame =
  | { type: "image_generation.partial_image"; b64_json: string; partial_image_index?: number }
  | { type: "image_generation.completed"; b64_json: string }
  | { type: "error"; error?: { message?: string } };

export async function fetchGeneratedImage(
  req: GenerateImageRequest,
): Promise<GenerateImageResult> {
  const { onPartial, signal, ...body } = req;

  let res: Response;
  try {
    res = await fetch("/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    return {
      image: null,
      error: e instanceof Error ? e.message : "Network error",
      status: 0,
    };
  }

  if (!res.ok || !res.body) {
    // Error responses are still JSON.
    const text = await res.text().catch(() => "");
    let msg = text || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      // keep raw text
    }
    return { image: null, error: msg, status: res.status };
  }

  const contentType = res.headers.get("content-type") ?? "";
  // Backwards-compat: if the server returned a single JSON body (older
  // deploys), decode it directly instead of trying to parse SSE.
  if (contentType.includes("application/json")) {
    const j = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
    return {
      image: j.image ?? null,
      error: j.image ? null : (j.error ?? "No image returned"),
      status: res.status,
    };
  }

  // Stream: parse SSE ourselves (tiny parser; avoids adding a dependency).
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let finalImage: string | null = null;
  let lastPartial: string | null = null;
  let streamError: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE events are separated by a blank line.
      let sepIdx: number;
      // Handle both \n\n and \r\n\r\n.
      while (
        (sepIdx = indexOfDoubleNewline(buffer)) !== -1
      ) {
        const rawEvent = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx).replace(/^(\r?\n){2}/, "");
        const payload = extractDataPayload(rawEvent);
        if (!payload) continue;
        if (payload === "[DONE]") continue;

        let frame: SseFrame | null = null;
        try {
          frame = JSON.parse(payload) as SseFrame;
        } catch {
          continue;
        }
        if (!frame) continue;

        if (frame.type === "error") {
          streamError = frame.error?.message ?? "Image generation failed";
          continue;
        }
        if (frame.type === "image_generation.partial_image" && frame.b64_json) {
          const url = `data:image/png;base64,${frame.b64_json}`;
          lastPartial = url;
          onPartial?.(url);
          continue;
        }
        if (frame.type === "image_generation.completed" && frame.b64_json) {
          finalImage = `data:image/png;base64,${frame.b64_json}`;
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }

  if (streamError && !finalImage) {
    return { image: null, error: streamError, status: res.status };
  }

  const image = finalImage ?? lastPartial;
  if (!image) {
    return { image: null, error: "Image stream ended without a frame", status: res.status };
  }
  return { image, error: null, status: res.status };
}

function indexOfDoubleNewline(s: string): number {
  const a = s.indexOf("\n\n");
  const b = s.indexOf("\r\n\r\n");
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

function extractDataPayload(rawEvent: string): string | null {
  // Concatenate all `data:` lines per the SSE spec.
  const lines = rawEvent.split(/\r?\n/);
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}
