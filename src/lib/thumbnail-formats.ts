// Extensible aspect-ratio / format registry for the Thumbnail Studio.
//
// Adding a new platform format (Instagram 1:1, Facebook 1.91:1, LinkedIn,
// Pinterest 2:3, …) means adding ONE entry here — every prompt, composition
// rule, and dimension flows from this file. No prompt logic is duplicated.

export type ThumbnailFormatId =
  | "youtube_16_9"
  | "youtube_shorts_9_16"
  | "instagram_1_1"
  | "facebook_1_91_1"
  | "linkedin_1_91_1"
  | "pinterest_2_3";

export type SupportedGenRatio = "16:9" | "9:16" | "1:1";

export type ThumbnailFormat = {
  id: ThumbnailFormatId;
  label: string;              // "YouTube Thumbnail (16:9)"
  shortLabel: string;         // "YouTube"
  ratio: string;              // "16:9"
  /** Ratio value we send to the image generator (must be one it supports). */
  generatorRatio: SupportedGenRatio;
  /** Real output dimensions, in pixels — used for downloads / canvas resize. */
  outputWidth: number;
  outputHeight: number;
  /** One-line description of composition + subject % + text placement rules. */
  compositionRule: string;
  /** ~% of frame the subject should occupy. */
  subjectCoverage: number;
  /** Where text should sit (never over the face). */
  textPlacement: string;
  /** Optimized for mobile viewing? */
  mobileOptimized: boolean;
  /** Primary / secondary. Primary formats surface as big cards in the UI. */
  primary: boolean;
  description: string;
};

export const THUMBNAIL_FORMATS: ThumbnailFormat[] = [
  {
    id: "youtube_16_9",
    label: "YouTube Thumbnail (16:9)",
    shortLabel: "YouTube",
    ratio: "16:9",
    generatorRatio: "16:9",
    outputWidth: 1280,
    outputHeight: 720,
    compositionRule:
      "Landscape composition. Subject occupies ~60–70% of the frame, positioned off-center to leave a bold negative-space area for large thumbnail text. Rule of thirds.",
    subjectCoverage: 65,
    textPlacement: "Leave open space on the opposite side of the subject for a large headline added later — never draw it.",
    mobileOptimized: false,
    primary: true,
    description: "Standard YouTube video thumbnail — 1280×720.",
  },
  {
    id: "youtube_shorts_9_16",
    label: "YouTube Shorts Thumbnail (9:16)",
    shortLabel: "Shorts",
    ratio: "9:16",
    generatorRatio: "9:16",
    outputWidth: 1080,
    outputHeight: 1920,
    compositionRule:
      "Vertical composition. Subject occupies ~70% of the frame with the face centered and highly prominent. Optimized for mobile viewing — critical elements inside the safe central column, away from top/bottom UI overlays.",
    subjectCoverage: 70,
    textPlacement: "Leave open space above or below the face for a headline added later — never draw it. Keep key content away from the top and bottom edges (UI overlay zones).",
    mobileOptimized: true,
    primary: true,
    description: "YouTube Shorts / Reels vertical thumbnail — 1080×1920.",
  },
  {
    id: "instagram_1_1",
    label: "Instagram Post (1:1)",
    shortLabel: "Instagram",
    ratio: "1:1",
    generatorRatio: "1:1",
    outputWidth: 1080,
    outputHeight: 1080,
    compositionRule:
      "Square, centered composition. Subject occupies ~65% of the frame with balanced negative space on all sides.",
    subjectCoverage: 65,
    textPlacement: "Leave open space above or below the subject for a headline added later — never draw it.",
    mobileOptimized: true,
    primary: false,
    description: "Square Instagram post — 1080×1080.",
  },
  {
    id: "facebook_1_91_1",
    label: "Facebook Link (1.91:1)",
    shortLabel: "Facebook",
    ratio: "1.91:1",
    generatorRatio: "16:9",
    outputWidth: 1200,
    outputHeight: 630,
    compositionRule:
      "Wide landscape composition. Subject occupies ~60% of the frame with clear space for headline text.",
    subjectCoverage: 60,
    textPlacement: "Leave open space on the opposite side of the subject for a headline added later — never draw it.",
    mobileOptimized: false,
    primary: false,
    description: "Facebook shared-link preview — 1200×630.",
  },
  {
    id: "linkedin_1_91_1",
    label: "LinkedIn Post (1.91:1)",
    shortLabel: "LinkedIn",
    ratio: "1.91:1",
    generatorRatio: "16:9",
    outputWidth: 1200,
    outputHeight: 627,
    compositionRule:
      "Professional landscape composition. Subject occupies ~60% of the frame with editorial polish.",
    subjectCoverage: 60,
    textPlacement: "Leave open space on the opposite side of the subject for a headline added later — never draw it.",
    mobileOptimized: false,
    primary: false,
    description: "LinkedIn shared-link preview — 1200×627.",
  },
  {
    id: "pinterest_2_3",
    label: "Pinterest Pin (2:3)",
    shortLabel: "Pinterest",
    ratio: "2:3",
    generatorRatio: "9:16",
    outputWidth: 1000,
    outputHeight: 1500,
    compositionRule:
      "Tall vertical composition. Subject occupies ~65% of the frame with editorial styling.",
    subjectCoverage: 65,
    textPlacement: "Leave open space at the top or bottom for a stacked headline added later — never draw it, never over the face.",
    mobileOptimized: true,
    primary: false,
    description: "Pinterest pin — 1000×1500.",
  },
];

export function getFormat(id: ThumbnailFormatId | string | undefined): ThumbnailFormat {
  return THUMBNAIL_FORMATS.find((f) => f.id === id) ?? THUMBNAIL_FORMATS[0];
}

/** Best-effort mapping from legacy `AspectRatioId` values to a format id. */
export function formatFromAspectRatio(ratio: string, platform?: string): ThumbnailFormatId {
  if (platform === "youtube_shorts" || platform === "tiktok") return "youtube_shorts_9_16";
  if (platform === "instagram") return "instagram_1_1";
  if (platform === "facebook") return "facebook_1_91_1";
  if (platform === "linkedin") return "linkedin_1_91_1";
  if (platform === "pinterest") return "pinterest_2_3";
  switch (ratio) {
    case "9:16": return "youtube_shorts_9_16";
    case "1:1":  return "instagram_1_1";
    case "2:3":  return "pinterest_2_3";
    case "16:9":
    default:     return "youtube_16_9";
  }
}

// ---------------- Universal prompt template ----------------

/**
 * Variables filled into the universal prompt template. Any variable left
 * empty is replaced with a neutral fallback so a single prompt template works
 * across every niche.
 */
export type UniversalPromptVars = {
  TOPIC: string;
  SUBJECT_ACTION: string;
  SUBJECT_EXPRESSION: string;
  BACKGROUND_DESCRIPTION: string;
  THUMBNAIL_TEXT: string;
  ASPECT_RATIO: string;             // e.g. "16:9"
  /** Set when the user uploaded a primary subject image — adds preserve clause. */
  hasUploadedSubject?: boolean;
  /** App draws the text itself (regional-language topic or text): the model must draw none. */
  textOverlay?: boolean;
};

// The topic is NOT quoted: image models tend to typeset any quoted string into the picture.
const UNIVERSAL_TEMPLATE = `Create a highly clickable thumbnail background image in EXACT {ASPECT_RATIO} aspect ratio. Scene (never write any words in the image): {TOPIC}.

COMPOSITION RULES ({ASPECT_RATIO}):
{COMPOSITION_RULE}
Headline space: {TEXT_PLACEMENT}
Subject coverage: approximately {SUBJECT_COVERAGE}% of the frame.

SUBJECT:
- Action / pose: {SUBJECT_ACTION}
- Facial expression: {SUBJECT_EXPRESSION}
{PRESERVE_SUBJECT}

BACKGROUND:
{BACKGROUND_DESCRIPTION}

TEXT:
{TEXT_SECTION}

QUALITY STANDARDS (non-negotiable):
Photorealistic, HDR, DSLR quality, ultra-detailed, premium color grading, high contrast, bold eye-catching composition. Sharp focus, cinematic lighting, rich saturation.

STRICT: Output MUST be in {ASPECT_RATIO} aspect ratio. The image contains NO text of any kind: no words, letters, numbers, captions, titles, signs, labels, watermarks, logos or UI. The headline is added later by the app as an editable layer.`;

/** Non-Latin scripts image models can't spell (Indic, Arabic). Keep in sync with text-overlay.ts. */
const OVERLAY_SCRIPT = /[\u0600-\u06FF\u0900-\u0D7F]/;

export function needsOverlayScript(s: string | null | undefined): boolean {
  return !!s && OVERLAY_SCRIPT.test(s);
}

function textSection(_text: string, _overlay = false): string {
  // Every headline is drawn by the app afterwards with a real font (editable,
  // always spelled right, any script). The model never draws text.
  return (
    "Do NOT draw any text, letters, numbers, captions or logos anywhere in the image. " +
    "Keep the top 18% and bottom 18% of the frame clean and uncluttered (simple background only, no faces or key objects there) " +
    "so the headline can be placed over them later."
  );
}

const PRESERVE_CLAUSE =
  "- IMPORTANT: The uploaded reference image is the primary subject — preserve facial identity EXACTLY. Do not alter facial features, hairstyle, or skin tone. Additional uploaded images are references for objects, environments, or context only.";

/** Build the single universal prompt for any format + variable set. */
export function buildUniversalThumbnailPrompt(
  format: ThumbnailFormat,
  vars: UniversalPromptVars,
): string {
  const fill = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);
  return UNIVERSAL_TEMPLATE
    .replaceAll("{ASPECT_RATIO}", format.ratio)
    .replace("{COMPOSITION_RULE}", format.compositionRule)
    .replace("{TEXT_PLACEMENT}", format.textPlacement)
    .replace("{SUBJECT_COVERAGE}", String(format.subjectCoverage))
    .replace("{TOPIC}", fill(vars.TOPIC, "the video topic"))
    .replace("{SUBJECT_ACTION}", fill(vars.SUBJECT_ACTION, "confident hero pose"))
    .replace("{SUBJECT_EXPRESSION}", fill(vars.SUBJECT_EXPRESSION, "intense, engaging expression"))
    .replace("{BACKGROUND_DESCRIPTION}", fill(vars.BACKGROUND_DESCRIPTION, "cinematic, on-topic environment with dramatic lighting"))
    .replace("{TEXT_SECTION}", textSection(fill(vars.THUMBNAIL_TEXT, "").toUpperCase(), vars.textOverlay))
    .replace("{PRESERVE_SUBJECT}", vars.hasUploadedSubject ? PRESERVE_CLAUSE : "");
}
