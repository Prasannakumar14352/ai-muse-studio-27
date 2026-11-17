/**
 * Provider capability registry — server-only.
 *
 * Maps abstract capabilities (image_editing, video_generation, etc.) to
 * concrete provider configurations. Presence + `production === true` here
 * is the *only* signal the app uses to decide whether a module may leave
 * Beta. Credentials are read from `process.env` inside the handler; nothing
 * from this file ever crosses to the browser.
 */

export type Capability =
  | "image_generation"
  | "image_editing"
  | "background_removal"
  | "generative_fill"
  | "video_generation"
  | "voiceover_generation"
  | "transcription"
  | "seo_writing";

export type ProviderConfig = {
  provider: string;
  model?: string;
  envKey: string;
  enabled: boolean;
  production: boolean;
  timeoutMs: number;
  maxRetries: number;
  notes?: string;
};

const REGISTRY: Record<Capability, ProviderConfig[]> = {
  image_generation: [
    { provider: "fal", model: "fal-ai/nano-banana", envKey: "FAL_KEY", enabled: true, production: true, timeoutMs: 60_000, maxRetries: 2 },
  ],
  image_editing: [
    { provider: "fal", model: "fal-ai/nano-banana", envKey: "FAL_KEY", enabled: true, production: true, timeoutMs: 60_000, maxRetries: 2, notes: "Prompt-based edits, generative fill, extend, transform." },
  ],
  background_removal: [
    { provider: "fal", model: "fal-ai/nano-banana", envKey: "FAL_KEY", enabled: true, production: true, timeoutMs: 60_000, maxRetries: 2, notes: "Best-effort via prompt; not a dedicated matte cutout." },
  ],
  generative_fill: [
    { provider: "fal", model: "fal-ai/nano-banana", envKey: "FAL_KEY", enabled: true, production: true, timeoutMs: 60_000, maxRetries: 2 },
  ],
  seo_writing: [
    { provider: "openrouter", model: "google/gemini-2.5-flash", envKey: "OPENROUTER_API_KEY", enabled: true, production: true, timeoutMs: 60_000, maxRetries: 1 },
  ],
  video_generation: [
    // No production render provider is wired. Module stays Beta.
    { provider: "none", envKey: "VIDEO_RENDER_PROVIDER", enabled: false, production: false, timeoutMs: 0, maxRetries: 0, notes: "Requires hosted render worker (Shotstack / Remotion Lambda / self-hosted FFmpeg)." },
  ],
  voiceover_generation: [
    { provider: "fal", model: "fal-ai/elevenlabs/tts/turbo-v2.5", envKey: "FAL_KEY", enabled: true, production: true, timeoutMs: 60_000, maxRetries: 1 },
  ],
  transcription: [
    { provider: "none", envKey: "STT_PROVIDER", enabled: false, production: false, timeoutMs: 0, maxRetries: 0 },
  ],
};

export function getCapability(cap: Capability): {
  configured: boolean;
  production: boolean;
  provider: string | null;
  reason: string | null;
} {
  const candidates = REGISTRY[cap] ?? [];
  const usable = candidates
    .filter((c) => c.enabled && c.production)
    .sort((a, b) => a.maxRetries - b.maxRetries);
  for (const c of usable) {
    const secret = process.env[c.envKey];
    if (secret && secret.length > 0) {
      return { configured: true, production: true, provider: c.provider, reason: null };
    }
  }
  return {
    configured: false,
    production: false,
    provider: null,
    reason: candidates[0]?.notes ?? `No production provider configured for ${cap}.`,
  };
}

export function getProviderConfig(cap: Capability): ProviderConfig | null {
  const candidates = REGISTRY[cap] ?? [];
  for (const c of candidates) {
    if (!c.enabled) continue;
    if (!process.env[c.envKey]) continue;
    return c;
  }
  return null;
}

export function requireCapability(cap: Capability): ProviderConfig {
  const cfg = getProviderConfig(cap);
  if (!cfg || !cfg.production) {
    const err = new Error(`provider_not_configured:${cap}`);
    (err as { code?: string }).code = "provider_not_configured";
    throw err;
  }
  return cfg;
}
