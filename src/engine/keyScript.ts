import { FIG_INDEX, keys, SHIFT_INDEX, SPACE_INDEX } from '../layout';

/** Time left for the keys to change sets after FIG, before the next key is struck. */
const SWAP_PAUSE_MS = 500;

export interface Press {
  /** Which key, as a hit target. */
  target: number;
  /** When it goes down, in ms, and how long it stays down. */
  at: number;
  hold: number;
}

function keyNamed(name: string): number {
  return keys.findIndex((key) => key.name === name);
}

/**
 * The keys to press, in order, to type a text: SHIFT before each capital, FIG to reach the
 * figures and punctuation and FIG again to come back, RETURN for a line break. The keyboard
 * is taken to start on its letters, and is left on them.
 */
export function keysFor(text: string): number[] {
  const presses: number[] = [];
  let onFigures = false;
  const leaveFigures = () => {
    if (onFigures) presses.push(FIG_INDEX);
    onFigures = false;
  };
  for (const char of text) {
    if (char === ' ') {
      presses.push(SPACE_INDEX);
      continue;
    }
    if (char === '\n') {
      leaveFigures();
      presses.push(keyNamed('RETURN'));
      continue;
    }
    const figureKey = keys.findIndex((key) => key.fig === char);
    if (figureKey >= 0) {
      if (!onFigures) presses.push(FIG_INDEX);
      onFigures = true;
      presses.push(figureKey);
      continue;
    }
    leaveFigures();
    if (char !== char.toLowerCase()) presses.push(SHIFT_INDEX);
    presses.push(keyNamed(char.toUpperCase()));
  }
  leaveFigures();
  return presses.filter((target) => target >= 0);
}

/**
 * When to press each of those keys so that it reads as a person typing: an uneven rhythm, a
 * longer beat after a word, and a pause while the key sets change. `pace` below 1 is a faster
 * typist. Returns the presses and the time at which the last one is over.
 */
export function typed(targets: number[], startAt: number, pace = 1): { presses: Press[]; end: number } {
  const presses: Press[] = [];
  let at = startAt;
  for (const target of targets) {
    presses.push({ target, at, hold: (55 + Math.random() * 40) * pace });
    at += (105 + Math.random() * 85) * pace;
    if (target === SPACE_INDEX) at += 90 * pace;
    if (target === FIG_INDEX) at += SWAP_PAUSE_MS;
  }
  return { presses, end: at };
}
