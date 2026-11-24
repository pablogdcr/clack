export interface Stamp {
  char: string;
  line: number;
  cell: number;
  /** Offset from the ideal position, in points. Fixed for a given letter. */
  dx: number;
  dy: number;
  /** How hard this strike landed, 0 to 1. */
  pressure: number;
  /** A clogged typebar prints fatter, with its bowls filling in. Fixed for a given letter. */
  clogged: boolean;
  /** Identity of the letter's typebar, 0 to 1. The shader derives its uneven hit from it. */
  seed: number;
  /** Struck through the red half of the ribbon. */
  red: boolean;
}

function hash(a: number, salt: number): number {
  const x = Math.sin((a + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const PUNCTUATION = '.,;:!?-';
const BOWLS = 'aeo';

/**
 * One strike of a letter. Its flaws come from the letter itself (a typebar is always off in
 * the same way); only the pressure changes from one strike to the next.
 */
export function makeStamp(char: string, line: number, cell: number, strikeCount: number, red: boolean): Stamp {
  const code = char.charCodeAt(0);
  const softBar = hash(code, 3) < 0.18;

  let pressure = 0.76 + 0.2 * hash(strikeCount, 11);
  // every so often a strike lands light
  if (softBar || hash(strikeCount, 12) < 0.12) pressure -= 0.2;
  // small type concentrates the blow, so punctuation always punches through
  if (PUNCTUATION.includes(char)) pressure = 1;

  return {
    char,
    line,
    cell,
    dx: (hash(code, 2) - 0.5) * 1.3,
    dy: (hash(code, 1) - 0.5) * 1.6,
    pressure,
    clogged: BOWLS.includes(char.toLowerCase()) || hash(code, 4) < 0.1,
    seed: hash(code, 5),
    red,
  };
}
