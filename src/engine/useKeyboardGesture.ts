import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { keys, layout, SPACE_INDEX } from '../layout';
import type { DragHandlers, SheetHandlers } from './useTypewriter';

interface Options {
  /** Screen points per layout point, and where layout y = 0 sits on screen. */
  scale: number;
  offsetY: number;
  keyDown: (target: number) => void;
  keyUp: (target: number) => void;
  /** Called on the JS thread whenever a finger lands on the keyboard. */
  onTouch: () => void;
  /**
   * Drags above the keyboard. A finger that lands on the sheet takes the paper and may pull it
   * any way it likes; anywhere else, a sideways drag moves the carriage.
   */
  carriage: DragHandlers;
  sheet: SheetHandlers;
  /** Pushes one of the two ribbon knobs. */
  selectInk: (red: boolean) => void;
  /** False while something lies over the machine: no touch reaches it then. */
  enabled: boolean;
}

/** The one finger dragging above the keyboard. Positions are in layout points. */
interface Drag {
  id: number;
  startX: number;
  startY: number;
  /** What the finger has hold of; 'undecided' until it has moved far enough to tell. */
  kind: 'undecided' | 'carriage' | 'sheet' | 'none';
  /** Whether it landed on the sheet. */
  onSheet: boolean;
  lastX: number;
  lastY: number;
  lastTime: number;
  speedX: number;
  speedY: number;
}

/** A touch this close to the centre of a ribbon knob pushes it: generous, the knobs are small. */
const KNOB_REACH = 22;
const KNOB_REACH_BELOW = 14;
/** A finger has to travel this far before its drag is taken as sideways or upward. */
const DRAG_SLOP = 8;

/** Touches above this line belong to the mechanism, not the keyboard. */
const KEYBOARD_TOP = layout.band.y + layout.band.height;

/**
 * Every finger on the machine, handled on the UI thread. A touch goes to the nearest key,
 * so the gaps between the round caps are not dead zones, and several fingers can be down at once.
 */
export function useKeyboardGesture({ scale, offsetY, keyDown, keyUp, onTouch, carriage, sheet, selectInk, enabled }: Options) {
  // Which target each finger is holding, by touch id.
  const held = useSharedValue<Record<number, number>>({});
  const drag = useSharedValue<Drag | null>(null);

  return useMemo(() => {
    const targetAt = (screenX: number, screenY: number): number => {
      'worklet';
      const x = screenX / scale;
      const y = (screenY - offsetY) / scale;
      if (y < KEYBOARD_TOP) return -1;

      const bar = layout.spaceBar;
      const onBarRow = Math.abs(y - bar.y) < 26;
      if (onBarRow && Math.abs(x - bar.x) < bar.width / 2 + 6) return SPACE_INDEX;

      let best = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < keys.length; i++) {
        const dx = x - keys[i].x;
        const dy = y - keys[i].y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
      return best;
    };

    const endDrag = (touchId: number) => {
      'worklet';
      const current = drag.value;
      if (!current || current.id !== touchId) return;
      if (current.kind === 'carriage') carriage.release(current.speedX);
      if (current.kind === 'sheet') sheet.release(current.speedY);
      drag.value = null;
    };

    return Gesture.Manual()
      .enabled(enabled)
      .onTouchesDown((event) => {
        'worklet';
        // If these are the only fingers down, anything still recorded as held is left over
        // from touches whose end was never delivered (a page came up over the machine while
        // a finger was down): let go of it all before starting afresh.
        let next = { ...held.value };
        if (event.allTouches.length === event.changedTouches.length) {
          for (const id in next) keyUp(next[id]);
          next = {};
          if (drag.value) endDrag(drag.value.id);
        }
        let touched = false;
        for (const touch of event.changedTouches) {
          // The ribbon knobs sit among the keys and are small: they are tried first.
          const knobX = touch.x / scale;
          const knobY = (touch.y - offsetY) / scale;
          let knob = -1;
          let nearest = KNOB_REACH;
          for (let i = 0; i < layout.inkKnobs.length; i++) {
            // Below a knob its reach is short: that is where the top row of keys begins.
            if (knobY - layout.inkKnobs[i].y > KNOB_REACH_BELOW) continue;
            const distance = Math.hypot(knobX - layout.inkKnobs[i].x, knobY - layout.inkKnobs[i].y);
            if (distance < nearest) {
              nearest = distance;
              knob = i;
            }
          }
          if (knob >= 0) {
            selectInk(layout.inkKnobs[knob].name === 'red');
            touched = true;
            continue;
          }
          const target = targetAt(touch.x, touch.y);
          if (target < 0) {
            // Above the keyboard: the first finger down may turn into a drag.
            if (!drag.value) {
              const x = touch.x / scale;
              const y = (touch.y - offsetY) / scale;
              drag.value = {
                id: touch.id, startX: x, startY: y, kind: 'undecided', onSheet: sheet.owns(x, y),
                lastX: x, lastY: y, lastTime: Date.now(), speedX: 0, speedY: 0,
              };
            }
            continue;
          }
          next[touch.id] = target;
          keyDown(target);
          touched = true;
        }
        held.value = next;
        if (touched) scheduleOnRN(onTouch);
      })
      .onTouchesMove((event) => {
        'worklet';
        const current = drag.value;
        if (!current) return;
        for (const touch of event.changedTouches) {
          if (touch.id !== current.id) continue;
          const x = touch.x / scale;
          const y = (touch.y - offsetY) / scale;
          const dx = x - current.startX;
          const dy = y - current.startY;
          let kind = current.kind;
          if (kind === 'undecided' && Math.max(Math.abs(dx), Math.abs(dy)) > DRAG_SLOP) {
            if (current.onSheet) kind = 'sheet';
            else kind = Math.abs(dx) > Math.abs(dy) ? 'carriage' : 'none';
            if (kind === 'carriage') carriage.grab(current.startX, current.startY);
            if (kind === 'sheet') sheet.grab(current.startX, current.startY);
          }
          if (kind === 'carriage') carriage.drag(dx, dy);
          if (kind === 'sheet') sheet.drag(dy, dx);
          // Speed over the last stretch, smoothed, in points per second.
          const now = Date.now();
          const seconds = Math.max(now - current.lastTime, 1) / 1000;
          drag.value = {
            ...current,
            kind,
            lastX: x,
            lastY: y,
            lastTime: now,
            speedX: 0.5 * current.speedX + (0.5 * (x - current.lastX)) / seconds,
            speedY: 0.5 * current.speedY + (0.5 * (y - current.lastY)) / seconds,
          };
        }
      })
      .onTouchesUp((event) => {
        'worklet';
        const next = { ...held.value };
        for (const touch of event.changedTouches) {
          endDrag(touch.id);
          const target = next[touch.id];
          if (target === undefined) continue;
          delete next[touch.id];
          keyUp(target);
        }
        held.value = next;
      })
      .onTouchesCancelled((event) => {
        'worklet';
        const next = { ...held.value };
        for (const touch of event.changedTouches) {
          endDrag(touch.id);
          const target = next[touch.id];
          if (target === undefined) continue;
          delete next[touch.id];
          keyUp(target);
        }
        held.value = next;
      });
  }, [scale, offsetY, keyDown, keyUp, onTouch, carriage, sheet, selectInk, enabled, held, drag]);
}
