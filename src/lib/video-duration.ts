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

/**
 * Natural narration speed (words per second) by language. Indian languages
 * are agglutinative — one Telugu/Tamil/Malayalam "word" carries what English
 * says in 2-3 words — so the same number of words takes much longer to speak.
 * The table above is for English (≈2.5 w/s); other languages scale by this.
 */
const SPEECH_WPS: Record<string, number> = {
  English: 2.5,
  Hindi: 2.3,
  Marathi: 1.9,
  Bengali: 2.0,
  Gujarati: 2.0,
  Telugu: 1.7,
  Kannada: 1.7,
  Tamil: 1.6,
  Malayalam: 1.5,
};

export function speechWordsPerSecond(language?: string | null): number {
  if (!language) return SPEECH_WPS.English;
  return SPEECH_WPS[language] ?? SPEECH_WPS.English;
}

/** Most words a scene of `durationSec` can hold in `language` without running over. */
export function maxWordsForScene(durationSec: number, language?: string | null): number {
  return Math.max(2, Math.floor(durationSec * speechWordsPerSecond(language) * 0.95));
}

/** Get word / scene targets for an arbitrary duration in seconds (and narration language). */
export function getDurationTargets(sec: number, language?: string | null): DurationTargets {
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

  // The table is English; scale word counts to how fast this language is spoken.
  const langScale = speechWordsPerSecond(language) / SPEECH_WPS.English;
  if (langScale !== 1) {
    wMin = round(wMin * langScale);
    wMax = round(wMax * langScale);
  }

  const scenesTarget = Math.round((sMin + sMax) / 2);
  // Never ask for more words than the scenes can physically hold.
  const avgSceneSec = s / Math.max(1, scenesTarget);
  const sceneCap = maxWordsForScene(avgSceneSec, language);
  wMax = Math.min(wMax, sceneCap * scenesTarget);
  wMin = Math.min(wMin, wMax);
  const wordsTarget = Math.round((wMin + wMax) / 2);
  const wpsTarget = Math.max(2, Math.round(wordsTarget / Math.max(1, scenesTarget)));

  return {
    seconds: s,
    words: { min: wMin, max: wMax, target: wordsTarget },
    scenes: { min: sMin, max: sMax, target: scenesTarget },
    wordsPerScene: {
      min: Math.max(2, Math.min(sceneCap, Math.floor(wpsTarget * 0.7))),
      max: Math.max(2, Math.min(sceneCap, Math.ceil(wpsTarget * 1.2))),
      target: Math.min(sceneCap, wpsTarget),
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

/** Shortest scene the planner may produce: below this, a line of narration can't fit (≈5 Telugu words at 3s). */
export const MIN_SCENE_SEC = 3;
const MAX_SCENE_SEC = 8;

type TimedScene = {
  n: number;
  duration: string;
  time_range?: string;
  voiceover: string;
  on_screen_text?: string;
};

const secOf = (d: string) => {
  const m = /([\d.]+)/.exec(d ?? "");
  const n = m ? parseFloat(m[1]) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
};

/**
 * Make scene timing consistent and speakable:
 *  - merges the shortest scenes into a neighbour until every scene can get ≥ MIN_SCENE_SEC,
 *  - rescales durations to sum to `lenSec` (each between MIN and MAX, 0.5s steps),
 *  - rewrites `time_range` to match — the blueprint reads time_range first, so a stale
 *    "28-29 sec" from the model used to produce 1-second scenes.
 */
export function normalizeSceneTiming<T extends TimedScene>(scenes: T[], lenSec: number, minSec = MIN_SCENE_SEC): T[] {
  if (!scenes.length || !(lenSec > 0)) return scenes;
  let list = scenes.map((s) => ({ ...s }));
  const maxScenes = Math.max(1, Math.floor(lenSec / minSec));
  while (list.length > maxScenes) {
    // Merge the shortest scene (never the hook, scene 1, unless it's all that's left) into its neighbour.
    let idx = 1;
    for (let i = 1; i < list.length; i++) if (secOf(list[i].duration) < secOf(list[idx].duration)) idx = i;
    if (list.length === 1) break;
    const into = idx === list.length - 1 ? idx - 1 : idx + 1;
    const [a, b] = into < idx ? [list[into], list[idx]] : [list[idx], list[into]];
    const merged = {
      ...(secOf(a.duration) >= secOf(b.duration) ? a : b),
      voiceover: [a.voiceover, b.voiceover].map((v) => v.trim()).filter(Boolean).join(" "),
      on_screen_text: a.on_screen_text || b.on_screen_text,
      duration: `${secOf(a.duration) + secOf(b.duration)}s`,
    };
    const lo = Math.min(idx, into);
    list = [...list.slice(0, lo), merged, ...list.slice(lo + 2)];
  }
  // Proportional durations clamped to [min, max], re-normalized until stable.
  const n = list.length;
  const hi = Math.max(MAX_SCENE_SEC, Math.ceil(lenSec / n));
  let durs = list.map((s) => secOf(s.duration));
  for (let iter = 0; iter < 8; iter++) {
    const fixed = durs.map((d) => d <= minSec || d >= hi);
    const fixedSum = durs.reduce((s, d, i) => s + (fixed[i] ? Math.min(hi, Math.max(minSec, d)) : 0), 0);
    const freeSum = durs.reduce((s, d, i) => s + (fixed[i] ? 0 : d), 0);
    const target = lenSec - fixedSum;
    durs = durs.map((d, i) => {
      const v = fixed[i] ? d : freeSum > 0 ? (d * target) / freeSum : target / n;
      return Math.min(hi, Math.max(minSec, v));
    });
  }
  durs = durs.map((d) => Math.max(minSec, Math.round(d * 2) / 2));
  // Put any rounding remainder on the longest scene.
  const diff = lenSec - durs.reduce((a, b) => a + b, 0);
  const longest = durs.indexOf(Math.max(...durs));
  durs[longest] = Math.max(minSec, durs[longest] + diff);
  let t = 0;
  return list.map((s, i) => {
    const start = t;
    t += durs[i];
    return { ...s, n: i + 1, duration: `${durs[i]}s`, time_range: `${start}-${t} sec` };
  });
}
