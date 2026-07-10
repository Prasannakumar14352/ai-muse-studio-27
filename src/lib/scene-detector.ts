// Dynamic Scene Detection Engine
//
// Classifies every beat/scene as either STATIC or DYNAMIC *before* media
// generation. Dynamic scenes must be produced by an AI video model — an
// animated still is not acceptable. Static scenes stay on the image path
// (image + Motion Director camera move).
//
// This module is intentionally deterministic + client-side: it runs during
// beat expansion so shot planning is fast, predictable, and testable.

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/** Every scene resolves to one of two media kinds. */
export type SceneKind = "static" | "dynamic";

/** Concrete static subjects — helpful for prompt shaping but not required. */
export type StaticSubject =
  | "product" | "landscape" | "building" | "document"
  | "logo" | "diagram" | "skyline" | "still_life" | "generic_static";

/** Continuous human/creature activities that REQUIRE motion in-frame. */
export type DynamicActivity =
  | "walking" | "running" | "talking" | "cooking" | "teaching"
  | "driving" | "swimming" | "flying" | "dancing" | "working"
  | "typing" | "writing" | "playing" | "laughing" | "crying"
  | "hugging" | "opening" | "closing" | "turning" | "pointing"
  | "looking" | "breathing" | "gesturing" | "generic_dynamic";

export type SceneDetection = {
  kind: SceneKind;
  /** Populated when kind === "dynamic". */
  activity: DynamicActivity | null;
  /** Populated when kind === "static". */
  subject: StaticSubject | null;
  /** Matched keyword responsible for the classification (debug). */
  matched: string | null;
};

// ---------------------------------------------------------------------------
// Keyword tables
// ---------------------------------------------------------------------------

// Order matters — first match wins. Verb-form roots keep the table small; the
// matcher scans for the root inside longer words (e.g. "running" hits "run").
const DYNAMIC_TABLE: Array<[DynamicActivity, string[]]> = [
  ["walking",   ["walk", "strolling", "pacing", "stepping"]],
  ["running",   ["running", "jogging", "sprint", "chasing"]],
  ["talking",   ["talking", "speaking", "conversation", "chatting", "interview", "monologue", "narrating on-camera"]],
  ["cooking",   ["cooking", "stirring", "chopping", "frying", "baking", "kneading", "grilling"]],
  ["teaching",  ["teaching", "lecturing", "presenting", "demonstrating", "explaining on-camera"]],
  ["driving",   ["driving", "steering", "accelerating"]],
  ["swimming",  ["swimming", "diving", "surfing", "paddling"]],
  ["flying",    ["flying", "soaring", "gliding", "hovering"]],
  ["dancing",   ["dancing", "swaying", "twirling"]],
  ["typing",    ["typing", "keyboarding"]],
  ["writing",   ["writing", "scribbling", "signing", "handwriting"]],
  ["playing",   ["playing", "kicking", "throwing", "catching", "juggling"]],
  ["laughing",  ["laughing", "giggling", "chuckling"]],
  ["crying",    ["crying", "weeping", "sobbing", "tears streaming"]],
  ["hugging",   ["hugging", "embracing", "cuddling"]],
  ["opening",   ["opening", "unwrapping", "unboxing", "unfolding"]],
  ["closing",   ["closing", "shutting", "sealing"]],
  ["turning",   ["turning", "rotating", "spinning around"]],
  ["pointing",  ["pointing", "gesturing at"]],
  ["looking",   ["looking around", "gazing", "watching", "glancing"]],
  ["breathing", ["breathing", "inhaling", "exhaling"]],
  ["gesturing", ["gesturing", "waving", "nodding", "shrugging"]],
  ["working",   ["working", "assembling", "building", "hammering", "sawing", "welding", "painting a wall"]],
];

const STATIC_TABLE: Array<[StaticSubject, string[]]> = [
  ["logo",      ["logo", "wordmark", "brand mark", "monogram"]],
  ["document",  ["document", "pdf", "worksheet", "printable", "invoice", "letter", "receipt", "certificate"]],
  ["diagram",   ["diagram", "chart", "graph", "infographic", "flowchart", "schematic"]],
  ["skyline",   ["skyline", "cityscape"]],
  ["building",  ["building", "architecture", "facade", "storefront", "monument", "temple"]],
  ["landscape", ["landscape", "mountain", "valley", "forest", "desert", "ocean view", "sunset", "vista", "horizon"]],
  ["product",   ["product shot", "packaging", "mockup", "bottle", "box on a", "flat lay of"]],
  ["still_life",["still life", "flat lay", "arrangement of"]],
];

// Strong signals that a HUMAN is on-frame doing something → dynamic even if
// no verb from the table is present. "A chef in a kitchen" reads as dynamic;
// "an empty kitchen" reads as static.
const HUMAN_SUBJECT_TOKENS = [
  "person", "man", "woman", "kid", "child", "children", "boy", "girl",
  "chef", "teacher", "student", "athlete", "dancer", "driver", "worker",
  "presenter", "host", "family", "crowd", "audience", "protagonist",
];

// Signals the frame is deliberately static (product/architecture/etc.) —
// beats the human-subject heuristic when both fire.
const STATIC_INTENT_TOKENS = [
  "product hero", "hero shot", "flat lay", "top-down layout",
  "architectural photograph", "empty room", "no people", "unmanned",
  "still life", "logo reveal on plain",
];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function findMatch(text: string, table: Array<[string, string[]]>): { key: string; keyword: string } | null {
  for (const [key, keywords] of table) {
    for (const kw of keywords) {
      if (text.includes(kw)) return { key, keyword: kw };
    }
  }
  return null;
}

/** Classify a beat by narration + visual prompt. */
export function detectScene(beatText: string, imagePrompt: string): SceneDetection {
  const t = `${beatText}\n${imagePrompt}`.toLowerCase();

  // Static-intent override wins — a designer explicitly asked for a still.
  if (STATIC_INTENT_TOKENS.some((k) => t.includes(k))) {
    const s = findMatch(t, STATIC_TABLE as unknown as Array<[string, string[]]>);
    return {
      kind: "static",
      activity: null,
      subject: (s?.key as StaticSubject) ?? "generic_static",
      matched: s?.keyword ?? "static_intent",
    };
  }

  // Dynamic activity verb wins next.
  const dyn = findMatch(t, DYNAMIC_TABLE as unknown as Array<[string, string[]]>);
  if (dyn) {
    return {
      kind: "dynamic",
      activity: dyn.key as DynamicActivity,
      subject: null,
      matched: dyn.keyword,
    };
  }

  // Human subject present but no explicit verb → treat as dynamic
  // (talking/breathing/looking are all continuous motion).
  const human = HUMAN_SUBJECT_TOKENS.find((k) => t.includes(k));
  if (human) {
    return {
      kind: "dynamic",
      activity: "generic_dynamic",
      subject: null,
      matched: human,
    };
  }

  // Otherwise static.
  const stat = findMatch(t, STATIC_TABLE as unknown as Array<[string, string[]]>);
  return {
    kind: "static",
    activity: null,
    subject: (stat?.key as StaticSubject) ?? "generic_static",
    matched: stat?.keyword ?? null,
  };
}

// ---------------------------------------------------------------------------
// Dynamic video prompt builder
// ---------------------------------------------------------------------------
//
// A dynamic scene must specify how EVERY layer of the frame moves so the
// clip reads as live-action cinematography, not an animated photograph.

const ACTIVITY_MOTION: Record<DynamicActivity, {
  bodyMechanics: string;
  cameraMotion: string;
  envMotion: string;
  facial: string;
  timing: string;
}> = {
  walking:   { bodyMechanics: "natural gait, arms swinging in counter-rhythm, weight shifting hip-to-hip, feet rolling heel-to-toe", cameraMotion: "steadicam tracking alongside at walking pace, subtle handheld float", envMotion: "background parallax, distant figures crossing, leaves drifting", facial: "relaxed jaw, eyes scanning forward, occasional micro-blinks", timing: "steady 100-110 bpm cadence, natural stride" },
  running:   { bodyMechanics: "explosive push-off, arms pumping, torso leaning forward, hair bouncing", cameraMotion: "aggressive lateral dolly or drone track, shallow depth of field", envMotion: "wind-driven grass, dust kicked up, dappled light streaking past", facial: "focused brow, breath visible, jaw set", timing: "fast 8-12 frame stride cycle, motion blur on limbs" },
  talking:   { bodyMechanics: "shoulders squared, subtle hand gestures, weight rocking slightly", cameraMotion: "slow push in on the eyes, locked interview framing", envMotion: "soft bokeh in background, ambient light drift", facial: "articulated lip sync, natural eye contact, brows lifting on emphasis", timing: "conversational pacing, pauses between phrases" },
  cooking:   { bodyMechanics: "hands chopping/stirring in rhythm, forearms flexing, wrists articulating", cameraMotion: "macro push over the pan, overhead crane on the cutting board", envMotion: "steam rising, oil shimmering, flame flickering", facial: "concentrated gaze on the food, quick glances to the camera", timing: "knife strikes 2 per second, stir every 1.5s" },
  teaching:  { bodyMechanics: "hand gestures underscoring words, occasional turn to the board", cameraMotion: "slow arc around the teacher, cut to student POV", envMotion: "students subtly moving, chalk dust in the air, natural window light shifting", facial: "expressive eyebrows, warm smile between beats, direct eye contact", timing: "measured cadence, emphasis every 3-4 seconds" },
  driving:   { bodyMechanics: "hands on the wheel, subtle steering corrections, head turning to mirrors", cameraMotion: "dashcam POV, over-the-shoulder from back seat, exterior tracking pass", envMotion: "road markings streaking by, trees blurring, reflections sliding across windshield", facial: "focused eyes on road, quick glance to camera", timing: "constant motion blur, mirror check every 4s" },
  swimming:  { bodyMechanics: "alternating arm strokes, kick pattern, breathing turn", cameraMotion: "underwater dolly alongside, split-level over/under shot", envMotion: "bubbles trailing, caustic light patterns rippling", facial: "eyes closed on stroke, mouth exhaling underwater", timing: "smooth 2-second stroke cycle" },
  flying:    { bodyMechanics: "arms extended, wingsuit/glider surfaces flexing", cameraMotion: "chase drone, sweeping crane, POV first-person", envMotion: "clouds streaking past, wind ripples on fabric, ground scrolling below", facial: "wind-pressed features, focused gaze forward", timing: "smooth acceleration, no jerks" },
  dancing:   { bodyMechanics: "full-body articulation, hips leading, arms carving space", cameraMotion: "orbit around the dancer, low-angle wide, matching sway", envMotion: "hair whipping, clothing flowing, stage lights strobing", facial: "expression synced to the music, eyes closed on peaks", timing: "on-tempo to the implied beat" },
  typing:    { bodyMechanics: "fingers striking keys in flurries, wrists floating, occasional pause", cameraMotion: "macro overhead on keyboard, side push toward screen glow", envMotion: "monitor light flickering on face, cursor blinking, coffee steam", facial: "concentrated stare at screen, blink cadence, small nods", timing: "burst-pause rhythm, 6-8 keystrokes per burst" },
  writing:   { bodyMechanics: "pen articulating letters, forearm sliding, other hand steadying paper", cameraMotion: "macro top-down, slow push in on the tip of the pen", envMotion: "paper texture catching light, ink glistening as it dries", facial: "eyes tracking the pen, small mouth movements", timing: "smooth cursive rhythm, pen lifts between words" },
  playing:   { bodyMechanics: "full body engaged, quick weight shifts, arm swings, laughter shakes", cameraMotion: "handheld follow, low-angle hero, match cut on peak action", envMotion: "grass/toys/ball moving, ambient participants reacting", facial: "big smiles, wide eyes, mouth open in laughter", timing: "burst-and-rest rhythm, peaks every 2-3s" },
  laughing:  { bodyMechanics: "shoulders shaking, head tilting back, hand possibly covering mouth", cameraMotion: "slow push in, locked medium close-up", envMotion: "hair bouncing, earrings swinging, background bokeh soft", facial: "eyes squeezing shut, cheeks lifting, teeth showing", timing: "3-5 second laugh burst then breath" },
  crying:    { bodyMechanics: "shoulders quivering, hand rising to face, body curling inward", cameraMotion: "slow push in, dutch tilt for emotion, soft focus", envMotion: "background muted, single practical light source, tear glistening", facial: "trembling lip, eyes wet, brow furrowed, occasional blink releasing tears", timing: "rising sob rhythm, breath hitching" },
  hugging:   { bodyMechanics: "arms wrapping, hands pressing into the other's back, gentle sway", cameraMotion: "slow orbit around the embrace, over-shoulder close-up", envMotion: "hair moving in the embrace, clothing folding", facial: "eyes closed, small smile, cheek pressed", timing: "hold 4-6 seconds, subtle rocking" },
  opening:   { bodyMechanics: "fingers gripping edge, wrist articulating, controlled reveal motion", cameraMotion: "macro push on the seam, cut to reaction, overhead follow", envMotion: "wrapping paper crinkling, ribbon falling, tissue puffing out", facial: "widening eyes, mouth opening in anticipation", timing: "slow build, quick reveal at 2.5s" },
  closing:   { bodyMechanics: "hand pushing/pressing, subtle body weight leaning in", cameraMotion: "macro on the closing edge, side profile push", envMotion: "seal clicking into place, dust puff, light dimming behind", facial: "focused, then satisfied release", timing: "deliberate final second" },
  turning:   { bodyMechanics: "head leading, shoulders following, hips swiveling last", cameraMotion: "matching arc around the subject, whip pan on the peak", envMotion: "hair fanning out, coat flaring, background streaking on the whip", facial: "eyes locking to new focal point", timing: "smooth 1.2-second rotation" },
  pointing:  { bodyMechanics: "arm extending, index finger leading, torso rotating slightly", cameraMotion: "cut to what's being pointed at, over-shoulder from behind", envMotion: "background context shifting into focus", facial: "eyes on target, brow raised, mouth mid-word", timing: "quick point-and-hold" },
  looking:   { bodyMechanics: "head slowly panning, eyes leading each move, subtle breath rise", cameraMotion: "slow dolly matching the gaze, rack focus on the new subject", envMotion: "environment blurred then sharp as focus racks", facial: "eyes tracking, micro-blinks, brow curious", timing: "unhurried 3-4 second sweep" },
  breathing: { bodyMechanics: "chest rising and falling, shoulders lifting subtly, nostrils flaring", cameraMotion: "locked close-up on chest/face, no camera move", envMotion: "candle flame flickering with breath, hair strand moving", facial: "eyes calm or closed, jaw relaxed, lips parted", timing: "4-count inhale, 6-count exhale" },
  gesturing: { bodyMechanics: "arms and hands leading each phrase, palms opening/closing", cameraMotion: "medium wide, subtle push in on emphasis", envMotion: "background stable, focus on the speaker", facial: "expressive brows, mouth articulating, eyes meeting camera", timing: "gesture per phrase, natural rhythm" },
  working:   { bodyMechanics: "tools in hand, repetitive skilled motion, body weight anchored", cameraMotion: "macro on the tool tip, wide of the workspace, over-the-shoulder", envMotion: "sparks/sawdust/paint flowing, ambient tool noise implied", facial: "focused stare, occasional wipe of the brow", timing: "steady work rhythm, pause every few seconds" },
  generic_dynamic: { bodyMechanics: "natural continuous motion — breath, subtle body sway, blinks", cameraMotion: "slow push in or handheld float — never a locked-off still", envMotion: "background parallax, ambient particulates (dust, steam, leaves), light flickering", facial: "articulated micro-expressions, natural blinking and lip movement", timing: "live-action pacing, no frozen frames" },
};

export type DynamicVideoPromptInput = {
  activity: DynamicActivity;
  /** The already-composed cinematic still prompt (Visual Director output). */
  basePrompt: string;
  /** Duration in seconds the clip should target. */
  durationSec: number;
  aspectRatio: string;
};

/** Build a rich AI-video prompt describing motion at every layer. */
export function buildDynamicVideoPrompt(input: DynamicVideoPromptInput): string {
  const m = ACTIVITY_MOTION[input.activity] ?? ACTIVITY_MOTION.generic_dynamic;
  return [
    input.basePrompt.trim(),
    "",
    `LIVE-ACTION MOTION BRIEF (${input.activity}, ${input.durationSec}s, ${input.aspectRatio}):`,
    `• Character motion / body mechanics: ${m.bodyMechanics}.`,
    `• Facial animation: ${m.facial}. Natural eye movement and blinking throughout.`,
    `• Breathing: visible chest/shoulder rise and fall — never frozen.`,
    `• Hair + clothing physics: individual strands and fabric responding to motion, wind, and gravity.`,
    `• Camera motion: ${m.cameraMotion}. No locked static frame.`,
    `• Environmental motion: ${m.envMotion}. Continuous ambient life in every corner of the frame.`,
    `• Object motion: any props in-frame should have physically plausible motion (weight, inertia, contact).`,
    `• Lighting changes: subtle exposure and highlight shifts over the shot — practical sources flicker, sun/cloud shifts, catchlights move with the eyes.`,
    `• Natural timing: ${m.timing}. The result must resemble real cinematography, not an animated photograph.`,
    `• Forbidden: parallax-only stills, Ken Burns pans on a frozen subject, cardboard-cutout characters, motion applied only to the background.`,
  ].join("\n");
}
