import { useCallback, useEffect, useRef } from 'react';
import { scheduleOnUI } from 'react-native-worklets';
import { keysFor, typed } from './keyScript';
import type { Typewriter } from './useTypewriter';

/** What the machine types by itself when it opens. */
const OPENING_LINE = 'Dear internet,\n';
/** Time for images and sounds to be ready before the first key. */
const START_DELAY_MS = 1100;

/**
 * On launch the machine types one line by itself, at a human rhythm, through the same key
 * handlers a finger uses. A few seconds show everything it does: keys sink, typebars fly,
 * the key sets change, the carriage steps and returns. Returns a function that stops it, for
 * the first real touch.
 */
export function useIntro(typewriter: Typewriter, ready: boolean) {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { keyDown, keyUp } = typewriter;

  const cancel = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    if (!ready) return;
    for (const { target, at, hold } of typed(keysFor(OPENING_LINE), START_DELAY_MS).presses) {
      timers.current.push(setTimeout(() => scheduleOnUI(keyDown, target), at));
      timers.current.push(setTimeout(() => scheduleOnUI(keyUp, target), at + hold));
    }
    return cancel;
  }, [ready, keyDown, keyUp, cancel]);

  return cancel;
}
