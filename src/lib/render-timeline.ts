/**
 * Render timeline: how long each beat stays on screen and how fast the
 * narration plays. Pure (no DOM) so it can be unit-tested.
 *
 * Rules
 *  - A narration clip sits on the first beat of its "segment" (that beat and
 *    the following beats that have no clip of their own). The segment lasts
 *    at least as long as its clip plays, plus a short breath — so the next
 *    clip can never start while this one is still talking.
 *  - To get close to the requested length, narration may speed up to 1.15×.
 *    If it is still too long, the video runs a little over the target rather
 *    than overlapping or cutting words. If it is shorter, the extra time is
 *    spread as slightly longer holds (the voice is never slowed down).
 *  - Without any narration, the old behaviour stays: scale beats to the target.
 */
export const SCENE_GAP_SEC = 0.15;
export const MAX_SPEEDUP = 1.15;

export function computeRenderTimeline(
  rawDurations: number[],
  audioDurations: Array<number | null | undefined>,
  targetSec?: number | null,
): { durations: number[]; rate: number } {
  const n = rawDurations.length;
  const hasAudio = audioDurations.some((a) => (a ?? 0) > 0);
  const rawTotal = rawDurations.reduce((a, b) => a + b, 0);

  if (!hasAudio) {
    if (targetSec && targetSec > 0 && rawTotal > 0) {
      const s = targetSec / rawTotal;
      return { durations: rawDurations.map((d) => d * s), rate: 1 };
    }
    return { durations: [...rawDurations], rate: 1 };
  }

  // Segments: [start, end) — a clip on `start`, beats after it without a clip.
  type Seg = { start: number; end: number; audio: number; raw: number };
  const segs: Seg[] = [];
  let i = 0;
  while (i < n) {
    const start = i;
    const audio = audioDurations[i] ?? 0;
    i++;
    while (i < n && !((audioDurations[i] ?? 0) > 0)) i++;
    const raw = rawDurations.slice(start, i).reduce((a, b) => a + b, 0);
    segs.push({ start, end: i, audio, raw });
  }

  // Speed-up needed to fit the target (never slower than normal speech).
  const natural = segs.reduce((a, s) => a + Math.max(s.audio + SCENE_GAP_SEC, s.raw), 0);
  let rate = 1;
  if (targetSec && targetSec > 0 && natural > targetSec) {
    const gaps = segs.length * SCENE_GAP_SEC;
    const speech = segs.reduce((a, s) => a + Math.max(s.audio, s.raw - SCENE_GAP_SEC), 0);
    rate = Math.min(MAX_SPEEDUP, Math.max(1, speech / Math.max(0.1, targetSec - gaps)));
  }

  let lens = segs.map((s) => Math.max(s.audio / rate + SCENE_GAP_SEC, s.raw / rate));
  const total = lens.reduce((a, b) => a + b, 0);
  if (targetSec && targetSec > 0 && total < targetSec) {
    const grow = targetSec / total;
    lens = lens.map((l) => l * grow);
  }

  const durations = new Array<number>(n).fill(0);
  segs.forEach((s, k) => {
    const rawSeg = s.raw > 0 ? s.raw : s.end - s.start;
    for (let b = s.start; b < s.end; b++) {
      const share = s.raw > 0 ? rawDurations[b] / rawSeg : 1 / (s.end - s.start);
      durations[b] = lens[k] * share;
    }
  });
  return { durations, rate };
}

/** Most a single scene's narration is sped up to fit its slot before the tail is trimmed. */
export const MAX_FIT_SPEEDUP = 1.3;

export type NarrationFit = {
  /** Playback rate for this scene's clip (1 = natural). */
  rate: number;
  /** Seconds of the timeline the clip occupies (≤ slot − gap). */
  playSec: number;
  /** True when even at MAX_FIT_SPEEDUP the clip was longer than its slot and its end is faded out. */
  trimmed: boolean;
};

/**
 * Fixed-length mode: every scene keeps its planned slot (slots sum to the
 * requested length), and each scene's narration is fitted INTO its slot —
 * sped up to at most 1.3×, and only if that still isn't enough, its tail is
 * faded out at the slot end. So narration never overlaps the next scene and
 * audio and video end together at exactly the requested length.
 */
export function fitNarrationToSlots(
  slotSecs: number[],
  audioSecs: Array<number | null | undefined>,
): NarrationFit[] {
  return slotSecs.map((slot, i) => {
    const audio = audioSecs[i] ?? 0;
    if (!(audio > 0)) return { rate: 1, playSec: 0, trimmed: false };
    const room = Math.max(0.3, slot - SCENE_GAP_SEC);
    const rate = Math.min(MAX_FIT_SPEEDUP, Math.max(1, audio / room));
    const natural = audio / rate;
    return natural <= room + 1e-6
      ? { rate, playSec: natural, trimmed: false }
      : { rate, playSec: room, trimmed: true };
  });
}

/** Scale planned scene lengths so they add up to exactly `targetSec`. */
export function slotsForTarget(plannedSecs: number[], targetSec: number): number[] {
  const total = plannedSecs.reduce((a, b) => a + Math.max(0, b), 0);
  if (!(targetSec > 0) || total <= 0) return plannedSecs.map((p) => Math.max(0.5, p));
  return plannedSecs.map((p) => (Math.max(0, p) / total) * targetSec);
}
