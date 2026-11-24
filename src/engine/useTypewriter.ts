import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { feel, prepareHaptics } from '../haptics/keyHaptics';
import { makeStamp, type Stamp } from '../ink/stamps';
import {
  FIG_INDEX, keys, layout, LINE_CELLS, paperLeftForCell, SHEET_RATIO, SHIFT_INDEX, SPACE_INDEX, TARGET_COUNT,
} from '../layout';
import { RETURN_LANDS_AT, type PlaySound } from '../sound/useSounds';
import { rowLandsAt, SWAP_MS, TURNING_ROWS } from './keyTurn';

/** Time for a typebar to reach the paper. */
const STRIKE_MS = 38;
/** Time for a typebar to drop back into the basket once its key is let go. */
const FALL_MS = 90;
/**
 * How long after the bar lets go its fall is heard. Shorter than the fall itself: on a quick
 * tap the two sounds of a keystroke must stay one gesture, a tight "tik-tuk".
 */
const FALL_SOUND_MS = 20;
/** Time for a cap to travel down under the finger, and back up once released. */
const PRESS_MS = 22;
const RELEASE_MS = 110;
/** Share of the travel a cap covers at the instant it is touched. */
const TOUCH_TRAVEL = 0.7;
/** How far the ribbon spools turn per strike, in radians. */
const SPOOL_NOTCH = 0.16;
/** Time to throw the carriage back: from a line of one letter, and from a full line. */
const RETURN_SHORTEST_S = 0.16;
const RETURN_LONGEST_S = 0.5;
/** At the right margin the keys lock: they give this much of their travel and stop. */
const LOCK_TRAVEL = 0.22;
/** How far SHIFT lifts the carriage, and how far a strike knocks it back, in points. */
const SHIFT_TRAVEL = 3;
const JOLT_TRAVEL = 0.9;
/** A carriage let go faster than this, in points per second, is thrown back to the margin. */
const THROW_SPEED = 350;
/**
 * The paper only feeds one way, so a sheet is not left hanging half out: pulled up further
 * than this, it leaves the machine by itself, under the finger. A flick faster than
 * TEAR_SPEED does the same from any height.
 */
const TEAR_PULL = 42;
const TEAR_SPEED = 900;
/**
 * A sheet on its way out travels this far, in this time: enough for a whole A4 sheet, most
 * of which was wound round the platen, to come out and clear the top of the screen.
 */
const EJECT_TRAVEL = layout.paper.bottom + layout.paper.width * SHEET_RATIO + 80;
const EJECT_MS = 560;
/** The paper cannot be held further aside than this, in points. */
const SWAY_LIMIT = 150;
/** How far below its place a fresh sheet starts when it is fed in, in points. */
const FEED_IN = 90;
/** The bell rings this many characters before the right margin. */
const BELL_CELLS_LEFT = 5;

/** Keys that print or move the carriage forward: the ones the margin locks. */
const PRINTS = Array.from({ length: TARGET_COUNT }, (_, index) => index === SPACE_INDEX || keys[index].fig !== null);

export interface BarMotion {
  swing: SharedValue<number>;
  keyX: SharedValue<number>;
}

export interface Typewriter {
  /** How far down each key is, 0 to 1. Indexed like the hit targets. */
  press: SharedValue<number[]>;
  /** Left edge of the paper; the carriage follows it. */
  paperLeft: SharedValue<number>;
  /** Line being typed, and the leftover of the last line feed still to scroll, in points. */
  lineIndex: SharedValue<number>;
  feed: SharedValue<number>;
  /**
   * The typebars that can be in motion at once: one going up while the one before it falls
   * back. `swing` is 0 at rest and 1 on the paper, where it stays for as long as its key is
   * held; `keyX` is the centre of the key it belongs to.
   */
  bars: BarMotion[];
  /**
   * How far the carriage and the sheet stand above their rest, in points: a strike knocks
   * them back a little, and SHIFT lifts the whole carriage so that the capitals hit.
   */
  rise: SharedValue<number>;
  /** How far the ribbon spools have turned, in radians. They advance a notch per strike. */
  spoolTurn: SharedValue<number>;
  /** Whether the figures set is in use, and how far the change to it has got (rests at 1). */
  figures: SharedValue<boolean>;
  swap: SharedValue<number>;
  /** How far the sheet has been pulled up by hand, and how far it has flown once out, in points. */
  pull: SharedValue<number>;
  eject: SharedValue<number>;
  /**
   * The hand does not pull straight: `sway` is how far sideways the paper is held, and `grip`
   * how high above the platen the fingers have it. The platen keeps the sheet's foot in place,
   * so the paper bends between the two.
   */
  sway: SharedValue<number>;
  grip: SharedValue<number>;
  stamps: Stamp[];
  keyDown: (target: number) => void;
  keyUp: (target: number) => void;
  /** Dragging the carriage sideways by hand: it follows the finger; thrown right, it returns. */
  carriage: DragHandlers;
  /** Pulling the sheet up by hand: far or fast enough, it comes out of the machine. */
  sheet: SheetHandlers;
  /** Feeds a fresh sheet in, once the one before has been taken out. */
  newSheet: () => void;
  /** 0 while the black half of the ribbon is in use, 1 for the red half. */
  redInk: SharedValue<number>;
  /** Pushes one of the two ribbon knobs. */
  selectInk: (red: boolean) => void;
}

/**
 * A drag, in layout points. `grab` gets where the finger is; `drag` gets how far it has moved
 * since, along the way the thing travels and across it; `release` gets the speed along, in
 * points per second.
 */
export interface DragHandlers {
  grab: (x: number, y: number) => void;
  drag: (along: number, across: number) => void;
  release: (speed: number) => void;
}

export interface SheetHandlers extends DragHandlers {
  /** Whether a point is on the sheet: a finger landing there takes hold of the paper. */
  owns: (x: number, y: number) => boolean;
}

/**
 * @param onSheetOut called with everything typed on a sheet when it is pulled out of the machine
 */
export function useTypewriter(playSound: PlaySound, onSheetOut: (stamps: Stamp[]) => void): Typewriter {
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const stampsNow = useRef(stamps);
  stampsNow.current = stamps;
  const pull = useSharedValue(0);
  const eject = useSharedValue(0);
  const sway = useSharedValue(0);
  const grip = useSharedValue(100);
  // Set once the sheet is on its way out: the hand has let it go, whatever the finger does.
  const leaving = useSharedValue(false);
  // Which half of the ribbon is in use, and how far the selector has moved toward red.
  const inkIsRed = useSharedValue(false);
  const redInk = useSharedValue(0);
  const grabbedAt = useSharedValue(0);
  const grabbedCell = useSharedValue(0);
  const carriageHeld = useSharedValue(false);
  const strikeCount = useRef(0);

  const press = useSharedValue<number[]>(new Array(TARGET_COUNT).fill(0));
  // How many fingers are on each key, and which keys still owe a full press after a tap.
  const held = useSharedValue<number[]>(new Array(TARGET_COUNT).fill(0));
  const mustBottom = useSharedValue<number[]>(new Array(TARGET_COUNT).fill(0));
  const cell = useSharedValue(0);
  const paperLeft = useSharedValue(paperLeftForCell(0));
  const lineIndex = useSharedValue(0);
  const feed = useSharedValue(0);
  const swing0 = useSharedValue(0);
  const swing1 = useSharedValue(0);
  const keyX0 = useSharedValue(layout.printX);
  const keyX1 = useSharedValue(layout.printX);
  // Which key holds each bar on the paper, or -1.
  const owners = useSharedValue<number[]>([-1, -1]);
  const bars = useMemo<BarMotion[]>(
    () => [
      { swing: swing0, keyX: keyX0 },
      { swing: swing1, keyX: keyX1 },
    ],
    [swing0, swing1, keyX0, keyX1],
  );
  const jolt = useSharedValue(0);
  const shiftLift = useSharedValue(0);
  const rise = useDerivedValue(() => JOLT_TRAVEL * jolt.value + SHIFT_TRAVEL * shiftLift.value);
  // Keys stopped by the margin lock on their last press.
  const blocked = useSharedValue<number[]>(new Array(TARGET_COUNT).fill(0));
  const spoolTurn = useSharedValue(0);
  const spoolNotches = useSharedValue(0);
  const shift = useSharedValue(false);
  const figures = useSharedValue(false);
  const swap = useSharedValue(1);

  const addStamp = useCallback(
    (char: string, line: number, atCell: number, red: boolean) => {
      // sound first: it is what the ear notices if it is late
      playSound('hit');
      strikeCount.current += 1;
      const stamp = makeStamp(char, line, atCell, strikeCount.current, red);
      setStamps((previous) => [...previous, stamp]);
    },
    [playSound],
  );

  // The recording is skipped forward so its landing thump falls when the carriage arrives.
  const carriageReturn = useCallback(
    (travelSeconds: number) => {
      playSound('return', Math.max(0, RETURN_LANDS_AT - travelSeconds));
      // Felt when the carriage lands, not when it leaves.
      setTimeout(() => feel('carriage'), travelSeconds * 1000);
    },
    [playSound],
  );

  // A locked key stops dead against the margin stop.
  const marginLock = useCallback(() => {
    playSound('shift');
  }, [playSound]);

  // The caps turn with a soft rub of their own, nothing like a keystroke, and each row
  // reaching its stop is felt in the hand rather than heard.
  const swapKeys = useCallback(() => {
    playSound('turn');
    for (let row = 0; row < TURNING_ROWS; row++) {
      setTimeout(() => feel('click'), rowLandsAt(row));
    }
  }, [playSound]);

  // A key goes down as soon as it is touched and comes back up when the finger leaves.
  // A quick tap still shows a full press: the key must bottom out before it may rise.
  // SHIFT and FIG stay down for as long as their layer is on, like a shift lock.
  useFrameCallback((frame) => {
    'worklet';
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 32);
    const current = press.value;
    const fingers = held.value;
    const owed = mustBottom.value;
    let moved = false;
    let settled = false;
    const next = new Array<number>(current.length);
    const stillOwed = new Array<number>(current.length);
    for (let i = 0; i < current.length; i++) {
      const locked = (i === SHIFT_INDEX && shift.value) || (i === FIG_INDEX && figures.value);
      const full = blocked.value[i] > 0 ? LOCK_TRAVEL : 1;
      const target = fingers[i] > 0 || owed[i] > 0 || locked ? full : 0;
      const gap = target - current[i];
      if (Math.abs(gap) < 0.001) {
        next[i] = target;
      } else {
        const step = dt / (gap > 0 ? PRESS_MS : RELEASE_MS);
        next[i] = current[i] + Math.sign(gap) * Math.min(Math.abs(gap), step);
        moved = true;
      }
      stillOwed[i] = owed[i] > 0 && next[i] < full ? 1 : 0;
      if (stillOwed[i] !== owed[i]) settled = true;
    }
    if (moved) press.value = next;
    if (settled) mustBottom.value = stillOwed;
  });

  // The second half of a keystroke: the bar lands back in the basket.
  const barFalls = useCallback(
    (afterMs: number) => {
      setTimeout(() => {
        playSound('fall');
      }, afterMs);
    },
    [playSound],
  );

  // Lets go of the bar held on the paper: it finishes its blow if it was still on its way up,
  // then falls back, and the carriage steps one cell as it leaves (unless something else is
  // about to move the carriage). Returns how long the print point stays taken, in ms.
  const dropBars = useCallback(
    (stepCarriage: boolean) => {
      'worklet';
      const owned = owners.value;
      if (owned[0] < 0 && owned[1] < 0) return 0;
      let wait = 0;
      for (let channel = 0; channel < owned.length; channel++) {
        if (owned[channel] < 0) continue;
        const swing = channel === 0 ? swing0 : swing1;
        const remaining = STRIKE_MS * (1 - swing.value);
        swing.value = withSequence(
          withTiming(1, { duration: remaining, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: FALL_MS, easing: Easing.out(Easing.quad) }),
        );
        wait = Math.max(wait, remaining);
      }
      owners.value = [-1, -1];
      scheduleOnRN(barFalls, wait + FALL_SOUND_MS);
      if (stepCarriage) {
        paperLeft.value = withDelay(wait, withTiming(paperLeftForCell(cell.value), { duration: 55 }));
      }
      return wait;
    },
    [barFalls, cell, owners, paperLeft, swing0, swing1],
  );

  // Carriage return: back to the left margin from `fromCells` away, and the paper rolls up
  // one line. A longer line takes longer. The recorded ratchet is slower than this: only its
  // end is played, so that its thump still lands with the carriage.
  const throwBack = useCallback(
    (fromCells: number, easing: (t: number) => number) => {
      'worklet';
      cell.value = 0;
      lineIndex.value += 1;
      feed.value = layout.line;
      feed.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      const travelSeconds =
        RETURN_SHORTEST_S + (RETURN_LONGEST_S - RETURN_SHORTEST_S) * Math.min(1, fromCells / LINE_CELLS);
      paperLeft.value = withTiming(paperLeftForCell(0), { duration: travelSeconds * 1000, easing });
      scheduleOnRN(carriageReturn, travelSeconds);
    },
    [carriageReturn, cell, feed, lineIndex, paperLeft],
  );

  const keyDown = useCallback(
    (target: number) => {
      'worklet';
      // Fresh arrays each time: mutating in place would not notify listeners.
      const fingers = [...held.value];
      fingers[target] += 1;
      held.value = fingers;
      const owed = [...mustBottom.value];
      owed[target] = 1;
      mustBottom.value = owed;
      // Most of the travel happens right here, in the frame of the touch itself, so the cap
      // is already down when that frame is drawn; the frame callback only finishes the move.
      // At the right margin the printing keys are locked: they give a little and stop.
      const atMargin = PRINTS[target] && cell.value >= LINE_CELLS;
      // The blow is felt before anything else is worked out: a late one feels like rubber.
      scheduleOnRN(feel, atMargin ? 'lock' : 'strike');
      const stops = [...blocked.value];
      stops[target] = atMargin ? 1 : 0;
      blocked.value = stops;
      const position = [...press.value];
      position[target] = Math.max(position[target], atMargin ? LOCK_TRAVEL : TOUCH_TRAVEL);
      press.value = position;

      const name = target === SPACE_INDEX ? 'SPACE' : keys[target].name;

      if (name === 'SHIFT') {
        // Capitals for the next letter only. The figures layer has no capitals.
        if (!figures.value) shift.value = !shift.value;
        shiftLift.value = withTiming(shift.value ? 1 : 0, { duration: 70 });
        scheduleOnRN(playSound, 'shift');
        return;
      }
      if (name === 'FIG') {
        figures.value = !figures.value;
        shift.value = false;
        shiftLift.value = withTiming(0, { duration: 70 });
        // A change interrupted halfway turns back from where it had got to.
        const start = Math.max(0, 1 - swap.value);
        swap.value = start;
        swap.value = withTiming(1, { duration: SWAP_MS * (1 - start), easing: Easing.linear });
        scheduleOnRN(swapKeys);
        return;
      }

      if (name === 'RETURN') {
        dropBars(false);
        throwBack(cell.value, Easing.inOut(Easing.quad));
        return;
      }

      if (name === 'BACK') {
        dropBars(false);
        // No erasing: the carriage only steps back, so the next strike lands on top.
        cell.value = Math.max(0, cell.value - 1);
        paperLeft.value = withTiming(paperLeftForCell(cell.value), { duration: 60 });
        scheduleOnRN(playSound, 'back');
        return;
      }

      // The carriage stops at the right margin, as on the real machine, and the keys lock.
      if (atMargin) {
        scheduleOnRN(marginLock);
        return;
      }

      if (name === 'SPACE') {
        dropBars(false);
        scheduleOnRN(playSound, 'space');
        cell.value += 1;
        paperLeft.value = withTiming(paperLeftForCell(cell.value), { duration: 55 });
      } else {
        // Only one bar fits at the print point: the one already there lets go first, and
        // this one follows it in. The free bar is the one that was not being held.
        const owned = owners.value;
        const channel = owned[0] < 0 && (owned[1] >= 0 || swing0.value <= swing1.value) ? 0 : 1;
        const wait = dropBars(true);
        const figure = figures.value ? keys[target].fig : null;
        const char = figure ?? (shift.value ? name : name.toLowerCase());
        shift.value = false;
        // The carriage comes back down once the capital has been struck.
        shiftLift.value = withDelay(wait + STRIKE_MS + 30, withTiming(0, { duration: 70 }));
        scheduleOnRN(addStamp, char, lineIndex.value, cell.value, inkIsRed.value);

        // The bar swings up and stays on the paper until the key is let go (see keyUp).
        const swing = channel === 0 ? swing0 : swing1;
        (channel === 0 ? keyX0 : keyX1).value = keys[target].x;
        swing.value = 0;
        swing.value = withDelay(wait, withTiming(1, { duration: STRIKE_MS, easing: Easing.in(Easing.quad) }));
        const holding = [-1, -1];
        holding[channel] = target;
        owners.value = holding;

        // The blow shakes the carriage, and the ribbon advances a notch.
        jolt.value = withDelay(
          wait + STRIKE_MS,
          withSequence(withTiming(1, { duration: 14 }), withTiming(0, { duration: 110, easing: Easing.out(Easing.quad) })),
        );
        spoolNotches.value += 1;
        spoolTurn.value = withDelay(wait + STRIKE_MS, withTiming(spoolNotches.value * SPOOL_NOTCH, { duration: 120 }));
        // The carriage steps when the bar leaves the paper, not before.
        cell.value += 1;
      }

      if (cell.value === LINE_CELLS - BELL_CELLS_LEFT) scheduleOnRN(playSound, 'bell');
    },
    [
      addStamp, carriageReturn, playSound, cell, feed, figures, held, inkIsRed, jolt, lineIndex, mustBottom,
      blocked, marginLock, owners, throwBack, paperLeft, press, shift, shiftLift, spoolNotches, spoolTurn, swap, swapKeys, swing0, swing1, keyX0, keyX1, dropBars,
    ],
  );

  const keyUp = useCallback(
    (target: number) => {
      'worklet';
      const fingers = [...held.value];
      fingers[target] = Math.max(0, fingers[target] - 1);
      held.value = fingers;
      scheduleOnRN(feel, 'release');
      // Letting go of a key lets its typebar fall back.
      if (owners.value[0] === target || owners.value[1] === target) dropBars(true);
    },
    [held, owners, dropBars],
  );

  const ratchetTick = useCallback(() => {
    feel('click');
  }, []);

  const carriage = useMemo<DragHandlers>(
    () => ({
      grab: () => {
        'worklet';
        dropBars(false);
        cancelAnimation(paperLeft);
        grabbedAt.value = paperLeft.value;
        grabbedCell.value = cell.value;
        carriageHeld.value = true;
      },
      drag: (distance: number) => {
        'worklet';
        // Once let go, the carriage is on its own: a late move must not stop its return.
        if (!carriageHeld.value) return;
        const home = paperLeftForCell(0);
        const next = Math.min(home, Math.max(paperLeftForCell(LINE_CELLS), grabbedAt.value + distance));
        // One click of the ratchet per character passed.
        if (Math.round((home - next) / layout.cell) !== Math.round((home - paperLeft.value) / layout.cell)) {
          scheduleOnRN(ratchetTick);
        }
        paperLeft.value = next;
      },
      release: (speed: number) => {
        'worklet';
        carriageHeld.value = false;
        const away = (paperLeftForCell(0) - paperLeft.value) / layout.cell;
        if (grabbedCell.value > 0 && (speed > THROW_SPEED || away < 1.5)) {
          throwBack(away, Easing.out(Easing.quad));
          return;
        }
        // Left where it is: it settles on the nearest character, and no line is fed.
        const settled = Math.min(LINE_CELLS, Math.max(0, Math.round(away)));
        cell.value = settled;
        paperLeft.value = withTiming(paperLeftForCell(settled), { duration: 60 });
      },
    }),
    [carriageHeld, cell, dropBars, grabbedAt, grabbedCell, paperLeft, ratchetTick, throwBack],
  );

  const sheetLeaves = useCallback(() => {
    playSound('pull');
    feel('release');
    onSheetOut(stampsNow.current);
  }, [onSheetOut, playSound]);

  const sheet = useMemo<SheetHandlers>(
    () => ({
      owns: (x: number, y: number) => {
        'worklet';
        const top = layout.printLineTop - lineIndex.value * layout.line + feed.value - pull.value - layout.paper.topMargin;
        return x >= paperLeft.value && x <= paperLeft.value + layout.paper.width && y >= top && y <= layout.paper.bottom;
      },
      grab: (_x: number, y: number) => {
        'worklet';
        dropBars(false);
        cancelAnimation(sway);
        grip.value = Math.max(30, layout.paper.bottom - y);
      },
      drag: (along: number, across: number) => {
        'worklet';
        // Up only: the platen's ratchet does not let the paper back down. Sideways, freely.
        if (leaving.value) return;
        const next = Math.max(pull.value, -along, 0);
        if (Math.floor(next / 9) !== Math.floor(pull.value / 9)) scheduleOnRN(ratchetTick);
        pull.value = next;
        sway.value = Math.min(SWAY_LIMIT, Math.max(-SWAY_LIMIT, across));
        if (next > TEAR_PULL) {
          // Far enough: it comes free and goes, leaning the way it was being pulled.
          leaving.value = true;
          eject.value = withTiming(EJECT_TRAVEL, { duration: EJECT_MS, easing: Easing.in(Easing.quad) });
          scheduleOnRN(sheetLeaves);
        }
      },
      release: (speed: number) => {
        'worklet';
        if (leaving.value) return;
        if (-speed > TEAR_SPEED) {
          leaving.value = true;
          eject.value = withTiming(EJECT_TRAVEL, { duration: EJECT_MS, easing: Easing.in(Easing.quad) });
          scheduleOnRN(sheetLeaves);
        } else {
          pull.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) });
          sway.value = withSpring(0, { damping: 14, stiffness: 220 });
        }
      },
    }),
    [dropBars, eject, feed, grip, leaving, lineIndex, paperLeft, pull, ratchetTick, sheetLeaves, sway],
  );

  const inkKnobPushed = useCallback(() => {
    playSound('back');
  }, [playSound]);

  const selectInk = useCallback(
    (red: boolean) => {
      'worklet';
      // Felt at once, whichever knob it is; only a knob that was out makes the selector move.
      scheduleOnRN(feel, inkIsRed.value === red ? 'knobIdle' : 'knob');
      if (inkIsRed.value === red) return;
      inkIsRed.value = red;
      redInk.value = withTiming(red ? 1 : 0, { duration: 90 });
      scheduleOnRN(inkKnobPushed);
    },
    [inkIsRed, inkKnobPushed, redInk],
  );

  useEffect(() => {
    prepareHaptics();
  }, []);

  const newSheet = useCallback(() => {
    setStamps([]);
    strikeCount.current = 0;
    playSound('pull', 0.35);
    scheduleOnUI(() => {
      'worklet';
      cell.value = 0;
      lineIndex.value = 0;
      paperLeft.value = withTiming(paperLeftForCell(0), { duration: 220 });
      pull.value = 0;
      eject.value = 0;
      sway.value = 0;
      leaving.value = false;
      // The fresh sheet comes up from behind the platen.
      feed.value = FEED_IN;
      feed.value = withTiming(0, { duration: 480, easing: Easing.out(Easing.cubic) });
    });
  }, [cell, eject, feed, leaving, lineIndex, paperLeft, playSound, pull, sway]);

  return {
    press, paperLeft, lineIndex, feed, bars, rise, spoolTurn, figures, swap, pull, eject, sway, grip, stamps,
    keyDown, keyUp, carriage, sheet, newSheet, redInk, selectInk,
  };
}
