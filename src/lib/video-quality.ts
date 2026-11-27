export type QualityFinding = {
  id: string;
  stage:
    "script" | "storyboard" | "character" | "visual" | "motion" | "audio" | "export" | "publishing";
  assetId?: string;
  severity: "info" | "warning" | "critical";
  result:
    | "passed"
    | "warning"
    | "failed"
    | "not checked"
    | "provider unavailable"
    | "requires human review";
  evidence: string;
  repair: string;
  blocksApproval: boolean;
};

type Scene = { n: number; voiceover: string; visual: string };
type Shot = {
  id: string;
  status: string;
  kind: string | null;
  previewUrl?: string | null;
  error?: string | null;
};

export function assessVideoAssets(input: {
  scenes: Scene[];
  shots: Shot[];
  duration: number;
  language?: string;
  narration: Array<{ n: number; duration?: number }>;
  narrationEnabled: boolean;
  characterRequested: boolean;
  fullMotion: boolean;
  audio: Array<{ id: string; label: string; status?: string; error?: string }>;
}): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const add = (
    stage: QualityFinding["stage"],
    id: string,
    result: QualityFinding["result"],
    evidence: string,
    repair: string,
    assetId?: string,
  ) =>
    findings.push({
      stage,
      id,
      result,
      evidence,
      repair,
      assetId,
      severity: result === "failed" ? "critical" : result === "warning" ? "warning" : "info",
      blocksApproval: result === "failed",
    });

  const seen = new Set<string>();
  let narrationSeconds = 0;
  const telugu = /^(te|telugu)(?:-|$)/i.test(input.language ?? "");
  for (const scene of input.scenes) {
    const id = String(scene.n);
    const line = scene.voiceover.trim().replace(/\s+/g, " ");
    const key = line.toLocaleLowerCase();
    if (!scene.visual.trim())
      add(
        "storyboard",
        `visual-description-${id}`,
        "warning",
        "Scene has no visual description.",
        "Add explicit scene direction.",
        id,
      );
    if (key && seen.has(key))
      add(
        "script",
        `repeat-${id}`,
        "warning",
        "The same narration appears in an earlier scene.",
        "Confirm intentional repetition or edit this scene.",
        id,
      );
    if (key) seen.add(key);
    if (telugu && line && !/[\u0C00-\u0C7F]/u.test(line))
      add(
        "script",
        `telugu-${id}`,
        "warning",
        "No Telugu characters in this scene’s narration.",
        "Review language or intentional transliteration.",
        id,
      );
    if (input.narrationEnabled && line) {
      const clip = input.narration.find((entry) => entry.n === scene.n);
      if (!clip?.duration)
        add(
          "audio",
          `narration-${id}`,
          "failed",
          "The scene has text but no decoded narration.",
          "Retry narration generation or explicitly turn narration off.",
          id,
        );
      narrationSeconds += clip?.duration ?? 0;
    }
  }
  if (narrationSeconds > input.duration)
    add(
      "audio",
      "narration-duration",
      "warning",
      `Decoded narration totals ${narrationSeconds.toFixed(1)}s in a ${input.duration}s video.`,
      "Listen for narration that needs shortening or may be cut.",
    );
  for (const shot of input.shots) {
    if (shot.status !== "done" || !shot.previewUrl)
      add(
        "visual",
        `asset-${shot.id}`,
        "failed",
        shot.error ?? "No ready preview for this shot.",
        "Retry the shot or replace its source.",
        shot.id,
      );
    else if (input.fullMotion && shot.kind !== "clip")
      add(
        "motion",
        `still-${shot.id}`,
        "warning",
        "This Full Motion shot is a still.",
        "Regenerate motion or accept this still before export.",
        shot.id,
      );
    else
      add(
        "visual",
        `asset-${shot.id}`,
        "passed",
        "Generation produced a preview reference.",
        "Inspect source integrity and content in preview.",
        shot.id,
      );
  }
  for (const track of input.audio) {
    if (track.error || track.status !== "ready")
      add(
        "audio",
        `track-${track.id}`,
        "failed",
        `${track.label}: ${track.error ?? track.status ?? "missing"}`,
        "Recover or mute this track.",
        track.id,
      );
  }
  if (input.characterRequested)
    add(
      "character",
      "character-identity",
      "not checked",
      "No automated reference-to-scene identity comparison ran.",
      "Compare face, costume and attributes with the approved reference.",
    );
  add(
    "script",
    "script-subjective",
    "requires human review",
    "Story progression, requested details and factual claims require editorial review.",
    "Read the script against the brief.",
  );
  add(
    "visual",
    "visual-subjective",
    "requires human review",
    "Anatomy, relevance, watermarks and intended motion require preview.",
    "Inspect scene images and video clips.",
  );
  add(
    "export",
    "export-pending",
    "not checked",
    "There is no final export in this review.",
    "Verify the exported file and listen to the final mix.",
  );
  return findings;
}

export function durationFinding(actual: number, expected: number, fps = 30) {
  const tolerance = Math.max(0.5, 3 / fps, expected * 0.02);
  return { tolerance, passed: Math.abs(actual - expected) <= tolerance };
}
