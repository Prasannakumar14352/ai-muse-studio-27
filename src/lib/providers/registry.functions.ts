/**
 * Public shape of the provider registry — no secrets ever cross this boundary.
 */
import { createServerFn } from "@tanstack/react-start";

export type CapabilityStatusPublic = {
  capability: string;
  configured: boolean;
  production: boolean;
  provider: string | null;
  reason: string | null;
};

const CAPS = [
  "image_generation",
  "image_editing",
  "background_removal",
  "generative_fill",
  "video_generation",
  "voiceover_generation",
  "transcription",
  "seo_writing",
] as const;

export const listCapabilitiesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getCapability } = await import("./registry.server");
  const out: CapabilityStatusPublic[] = CAPS.map((c) => {
    const s = getCapability(c);
    return { capability: c, ...s };
  });
  return out;
});
