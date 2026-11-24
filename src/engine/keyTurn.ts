/** Time for the letter caps to spin on their stems, one row after the other, to show the other set. */
export const SWAP_MS = 440;
/** Rows of letter keys. */
export const TURNING_ROWS = 3;
/** Each row starts this much later than the one before, as a share of one row's turn. */
const STAGGER = 0.3;
/** Share of a row's time spent turning; the rest is the rebound against the stop. */
const TURN_SHARE = 0.78;
/** How far a cap swings back off its stop, in radians. */
const REBOUND = 0.24;

/** A row's own time span, stretched over the whole change. */
const SPAN = 1 + STAGGER * (TURNING_ROWS - 1);

/**
 * How far a row has turned, 0 to pi, when the whole change has got to `swap` (0 to 1).
 * A row gathers speed, stops dead against its stop, and swings back a little before settling.
 */
export function rowTurn(swap: number, order: number): number {
  'worklet';
  const local = Math.min(1, Math.max(0, swap * SPAN - STAGGER * order));
  if (local < TURN_SHARE) {
    const turn = local / TURN_SHARE;
    return Math.PI * (0.25 * turn + 0.75 * turn * turn);
  }
  const settle = (local - TURN_SHARE) / (1 - TURN_SHARE);
  return Math.PI - REBOUND * Math.sin(Math.PI * settle) * (1 - settle);
}

/** When a row hits its stop, in milliseconds after the change began. */
export function rowLandsAt(order: number): number {
  return (SWAP_MS * (TURN_SHARE + STAGGER * order)) / SPAN;
}
