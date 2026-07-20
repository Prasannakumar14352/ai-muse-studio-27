// Provider abstraction for lip-sync.
// Foundation ships with a dev-only mock provider. Real providers (Sync.so,
// D-ID, Hedra, etc.) plug in behind the same interface without changing
// callers. Never accept API keys from the client — production providers
// read secrets server-side.

import type { DialogueLine } from "./types";

export type LipSyncMode = "mock" | "production";

export type LipSyncInput = {
  dialogue: DialogueLine;
  characterImageUrl?: string | null;
  characterVideoUrl?: string | null;
  audioUrl: string;                 // final approved VO
  aspectRatio: "16:9" | "9:16" | "1:1";
};

export type LipSyncResult = {
  ok: true;
  provider: string;
  mode: LipSyncMode;
  outputUrl: string;
  durationSec: number;
  /** True when output is a real lip-sync render; false for mock previews. */
  synthetic: boolean;
  note?: string;
} | {
  ok: false;
  provider: string;
  mode: LipSyncMode;
  error: string;
  code:
    | "no_face" | "multiple_faces" | "provider_unavailable"
    | "invalid_audio" | "unsupported_language"
    | "dialogue_too_long" | "timeout" | "unknown";
};

export interface LipSyncProvider {
  id: string;
  mode: LipSyncMode;
  supportsImageToVideo: boolean;
  supportsVideoToVideo: boolean;
  supportsMultipleFaces: boolean;
  supportedLanguages: string[];
  maxDurationSeconds: number;
  generate(input: LipSyncInput): Promise<LipSyncResult>;
}

// ---------- Mock provider (development only) ----------

export const MockLipSyncProvider: LipSyncProvider = {
  id: "mock",
  mode: "mock",
  supportsImageToVideo: true,
  supportsVideoToVideo: false,
  supportsMultipleFaces: false,
  supportedLanguages: ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn"],
  maxDurationSeconds: 60,
  async generate(input) {
    if (!input.audioUrl) {
      return { ok: false, provider: "mock", mode: "mock", error: "Missing audio.", code: "invalid_audio" };
    }
    const dur = Math.max(0.5, input.dialogue.endTime - input.dialogue.startTime);
    if (dur > 60) {
      return { ok: false, provider: "mock", mode: "mock", error: "Dialogue > 60s.", code: "dialogue_too_long" };
    }
    // Mock never renders real lip movement. It returns the character image URL
    // (or a placeholder) alongside the audio. Callers must show a "Mock Preview"
    // label and must not deduct production credits.
    return {
      ok: true,
      provider: "mock",
      mode: "mock",
      outputUrl: input.characterVideoUrl || input.characterImageUrl || "",
      durationSec: dur,
      synthetic: true,
      note: "Mock Preview — real lip-sync provider not configured.",
    };
  },
};

// ---------- Registry ----------

const registry = new Map<string, LipSyncProvider>();
registry.set(MockLipSyncProvider.id, MockLipSyncProvider);

export function registerLipSyncProvider(p: LipSyncProvider) {
  registry.set(p.id, p);
}

export function getLipSyncProvider(id: string): LipSyncProvider | null {
  return registry.get(id) ?? null;
}

export function listLipSyncProviders(): LipSyncProvider[] {
  return Array.from(registry.values());
}

/**
 * Pick the active provider. Foundation build always returns the mock; when
 * a real provider is registered later this is where the routing lives.
 */
export function resolveActiveLipSyncProvider(): LipSyncProvider {
  const real = listLipSyncProviders().find((p) => p.mode === "production");
  return real ?? MockLipSyncProvider;
}
