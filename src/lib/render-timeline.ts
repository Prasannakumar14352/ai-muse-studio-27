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
