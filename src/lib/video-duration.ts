// Duration is the SOURCE OF TRUTH for the entire video pipeline.
// Everything downstream — word count, scene count, storyboard density,
// voiceover length, timeline, and final render — is derived from these
// targets. If any output falls under 95% of the requested duration the
// pipeline auto-extends until it does.
//
// Rules table (from product spec):
//   30s   → 65–80 words     · 8–12 scenes
//   60s   → 140–170 words   · 18–25 scenes
//   3min  → 420–500 words   · 55–75 scenes
//   5min  → 700–850 words   · 90–120 scenes
//   9min  → 1300–1500 words · 160–220 scenes
//   12min → 1800–2200 words · 220–300 scenes

export type DurationTargets = {
  seconds: number;
  words: { min: number; max: number; target: number };
  scenes: { min: number; max: number; target: number };
  wordsPerScene: { min: number; max: number; target: number };
};

type Row = { sec: number; wMin: number; wMax: number; sMin: number; sMax: number };

const TABLE: Row[] = [
  { sec: 30,  wMin: 65,   wMax: 80,   sMin: 8,   sMax: 12  },
  { sec: 60,  wMin: 140,  wMax: 170,  sMin: 18,  sMax: 25  },
  { sec: 180, wMin: 420,  wMax: 500,  sMin: 55,  sMax: 75  },
  { sec: 300, wMin: 700,  wMax: 850,  sMin: 90,  sMax: 120 },
  { sec: 540, wMin: 1300, wMax: 1500, sMin: 160, sMax: 220 },
  { sec: 720, wMin: 1800, wMax: 2200, sMin: 220, sMax: 300 },
];

const round = (n: number) => Math.max(1, Math.round(n));

/** Get word / scene targets for an arbitrary duration in seconds. */
export function getDurationTargets(sec: number): DurationTargets {
  const s = Math.max(10, Math.min(1800, Math.round(sec)));

  // Below/above table: scale linearly from the nearest endpoint.
  const first = TABLE[0];
  const last = TABLE[TABLE.length - 1];
  let wMin: number, wMax: number, sMin: number, sMax: number;

  if (s <= first.sec) {
    const r = s / first.sec;
    wMin = round(first.wMin * r);
    wMax = round(first.wMax * r);
    sMin = Math.max(3, round(first.sMin * r));
    sMax = Math.max(4, round(first.sMax * r));
  } else if (s >= last.sec) {
    const r = s / last.sec;
    wMin = round(last.wMin * r);
    wMax = round(last.wMax * r);
    sMin = round(last.sMin * r);
    sMax = round(last.sMax * r);
  } else {
    let lo = TABLE[0], hi = TABLE[1];
    for (let i = 0; i < TABLE.length - 1; i++) {
      if (s >= TABLE[i].sec && s <= TABLE[i + 1].sec) { lo = TABLE[i]; hi = TABLE[i + 1]; break; }
    }
    const t = (s - lo.sec) / (hi.sec - lo.sec);
    const lerp = (a: number, b: number) => round(a + (b - a) * t);
    wMin = lerp(lo.wMin, hi.wMin);
    wMax = lerp(lo.wMax, hi.wMax);
    sMin = lerp(lo.sMin, hi.sMin);
    sMax = lerp(lo.sMax, hi.sMax);
  }

  const wordsTarget = Math.round((wMin + wMax) / 2);
  const scenesTarget = Math.round((sMin + sMax) / 2);
  const wpsTarget = Math.max(4, Math.round(wordsTarget / Math.max(1, scenesTarget)));

  return {
    seconds: s,
    words: { min: wMin, max: wMax, target: wordsTarget },
    scenes: { min: sMin, max: sMax, target: scenesTarget },
    wordsPerScene: {
      min: Math.max(3, Math.floor(wpsTarget * 0.7)),
      max: Math.max(6, Math.ceil(wpsTarget * 1.4)),
      target: wpsTarget,
    },
  };
}

export function countWords(text: string): number {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

/** Given an array of scenes with `voiceover`, return total narration words. */
export function totalVoiceoverWords(scenes: Array<{ voiceover?: string }>): number {
  return scenes.reduce((a, s) => a + countWords(s.voiceover ?? ""), 0);
}

/** Speaking rate used to convert word count → seconds (≈150 wpm ≈ 2.5 wps). */
export const WORDS_PER_SECOND = 2.5;

export function estimateSecondsFromWords(words: number): number {
  return words / WORDS_PER_SECOND;
}

/** Duration validation result — pipeline uses this to decide auto-extend. */
export type DurationCheck = {
  requestedSec: number;
  actualSec: number;
  ratio: number;   // actual / requested
  pass: boolean;   // ratio >= 0.95
  shortfallSec: number;
  shortfallWords: number;
};

export function checkDuration(requestedSec: number, actualSec: number): DurationCheck {
  const ratio = requestedSec > 0 ? actualSec / requestedSec : 1;
  const shortfallSec = Math.max(0, requestedSec - actualSec);
  return {
    requestedSec,
    actualSec,
    ratio,
    pass: ratio >= 0.95,
    shortfallSec,
    shortfallWords: Math.ceil(shortfallSec * WORDS_PER_SECOND),
  };
}
