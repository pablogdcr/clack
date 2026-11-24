import { useCallback, useRef } from 'react';
import { scheduleOnUI } from 'react-native-worklets';
import { keysFor, typed } from './keyScript';
import type { Typewriter } from './useTypewriter';

/**
 * What the demo types: a first page, pulled out, then a second one. The second line of each
 * page is exactly 24 characters long, so the bell rings on its last key.
 */
const PAGE_ONE = {
  greeting: 'Dear internet,',
  /** The start of the second line in black, and its end in red. */
  black: 'I am an ',
  red: 'Underwood No. 5.',
};
const PAGE_TWO = ['Born in 1900.', 'Rebuilt in React Native.'];
/** A quick typist: the demo is meant to be watched, not waited for. */
const PACE = 0.8;
/** One step of a hand movement, in ms. */
const FRAME_MS = 16;

/**
 * A short film of the machine, played through the same handlers fingers use. In about
 * twenty-five seconds it shows capitals lifting the carriage, the keys turning over for
 * figures, the carriage thrown back by hand, the red half of the ribbon, the bell, a sheet
 * pulled straight out and laid on the pile, a fresh sheet, and a last page held up at the end.
 *
 * Returns `start` and `stop`. `closePage` puts away the page that is being shown.
 */
export function useDemo(typewriter: Typewriter, closePage: () => void) {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { keyDown, keyUp, carriage, sheet, newSheet, selectInk } = typewriter;

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const start = useCallback(() => {
    stop();
    const later = (at: number, run: () => void) => timers.current.push(setTimeout(run, at));
    /** Types a text starting at `at`; returns when it is done. */
    const type = (text: string, at: number) => {
      const { presses, end } = typed(keysFor(text), at, PACE);
      for (const { target, at: when, hold } of presses) {
        later(when, () => scheduleOnUI(keyDown, target));
        later(when + hold, () => scheduleOnUI(keyUp, target));
      }
      return end;
    };
    /** Moves a hand from one place to another over `ms`, easing in and out. */
    const glide = (at: number, ms: number, move: (progress: number) => void) => {
      const steps = Math.ceil(ms / FRAME_MS);
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        later(at + step * FRAME_MS, () => move(t * t * (3 - 2 * t)));
      }
      // The time of the last step, not `at + ms`: whatever follows must come after it.
      return at + steps * FRAME_MS;
    };
    /** Takes the sheet and pulls it straight up until it comes free. */
    const pullSheet = (at: number) => {
      later(at, () => scheduleOnUI(sheet.grab, 220, 440));
      let end = glide(at, 520, (progress) => scheduleOnUI(sheet.drag, -30 * progress, 0));
      end = glide(end + 220, 200, (progress) => scheduleOnUI(sheet.drag, -30 - 16 * progress, 0));
      later(end, () => scheduleOnUI(sheet.release, 0));
      return end;
    };

    // A fresh sheet and the black half of the ribbon, whatever state the machine was in.
    newSheet();
    later(0, () => scheduleOnUI(selectInk, false));
    let at = 900;

    // Page one. A capital and a comma: the carriage lifts, the keys turn over and back.
    at = type(PAGE_ONE.greeting, at) + 200;
    // The carriage is thrown back by hand.
    later(at, () => scheduleOnUI(carriage.grab, 0, 0));
    at = glide(at, 200, (progress) => scheduleOnUI(carriage.drag, 110 * progress, 0));
    later(at, () => scheduleOnUI(carriage.release, 900));
    at += 600;

    // The machine's name in red; the bell rings on the last key of the line.
    at = type(PAGE_ONE.black, at) + 100;
    later(at, () => scheduleOnUI(selectInk, true));
    at = type(PAGE_ONE.red, at + 300) + 500;

    // The page is pulled out, read, and laid on the pile; a fresh sheet goes in.
    at = pullSheet(at);
    later(at + 2500, closePage);
    later(at + 3150, () => scheduleOnUI(selectInk, false));
    at += 3900;

    // Page two, back in black, with the RETURN key this time.
    at = type(`${PAGE_TWO[0]}\n`, at) + 450;
    at = type(PAGE_TWO[1], at) + 700;

    // It is pulled out too, and stays held up: the last picture of the film.
    pullSheet(at);
  }, [carriage, closePage, keyDown, keyUp, newSheet, selectInk, sheet, stop]);

  return { start, stop };
}
