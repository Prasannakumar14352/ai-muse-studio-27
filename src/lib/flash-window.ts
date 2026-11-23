// Per-visitor flash-offer window. Shared by the banner (browser) and checkout
// (server) so both agree on when a visitor's window started and ends.
// The deadline is real: refreshing never restarts it. A new window only opens
// when the admin restarts the timer for everyone, or after the admin-set
// repeat period has passed.

export type FlashConfig = { minutes: number; repeatDays: number | null; epoch: string };
export type FlashRecord = { startedAt: number; epoch: number } | null;

/** When this visitor's window started (ms). `isNew` = a fresh window was opened now. */
export function flashStart(
  cfg: FlashConfig,
  rec: FlashRecord,
  now: number,
  hint?: number | null,
): { startedAt: number; isNew: boolean } {
  const epoch = new Date(cfg.epoch).getTime();
  const repeatMs = cfg.repeatDays ? cfg.repeatDays * 864e5 : null;
  const stale = !rec || rec.epoch !== epoch || (repeatMs !== null && now >= rec.startedAt + repeatMs);
  if (!stale) return { startedAt: rec!.startedAt, isNew: false };
  // A start the browser already showed may be honoured, but only if it is in the
  // past, belongs to the current period and is newer than the old record.
  // (An earlier start only shortens the window, so it can't be abused.)
  const floor = rec && rec.epoch === epoch ? Math.max(epoch, rec.startedAt + (repeatMs ?? 0)) : epoch;
  const start = hint && hint <= now && hint >= floor ? hint : now;
  return { startedAt: start, isNew: true };
}

export function flashEnd(cfg: FlashConfig, startedAt: number): number {
  return startedAt + cfg.minutes * 60e3;
}
