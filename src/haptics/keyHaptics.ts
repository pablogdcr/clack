import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';

interface ClackHaptics {
  prepare(): void;
  /** intensity and sharpness from 0 to 1; body is the length of the buzz that follows, in seconds. */
  tap(intensity: number, sharpness: number, body: number): void;
}

/** Missing on a build made before the module was added: the system presets are used then. */
const native = requireOptionalNativeModule<ClackHaptics>('ClackHaptics');

/**
 * What each event feels like: [intensity, sharpness, body in seconds]. Sharp and short reads
 * as metal on metal; low sharpness with some body reads as a dull knock.
 */
const FEEL = {
  /** A key bottoming out as its type hits the platen: the hardest, crispest blow there is. */
  strike: [1, 1, 0.022],
  /** The key coming back up against its stop: lighter, and duller than the strike. */
  release: [0.5, 0.45, 0],
  /** A key stopped short by the margin lock. */
  lock: [1, 0.15, 0.05],
  /** The carriage landing against the margin stop. */
  carriage: [1, 0.3, 0.06],
  /** One tooth of a ratchet, one row of keys landing. */
  click: [0.45, 0.8, 0],
  /** A ribbon knob going in against its catch: a small, slightly dull snap. */
  knob: [0.8, 0.55, 0.012],
  /** A ribbon knob that is already in: it only gives a little. */
  knobIdle: [0.45, 0.3, 0],
} as const;

/** The system preset closest to each, for builds without the module. */
const PRESET = {
  strike: Haptics.ImpactFeedbackStyle.Heavy,
  release: Haptics.ImpactFeedbackStyle.Light,
  lock: Haptics.ImpactFeedbackStyle.Heavy,
  carriage: Haptics.ImpactFeedbackStyle.Heavy,
  click: Haptics.ImpactFeedbackStyle.Light,
  knob: Haptics.ImpactFeedbackStyle.Medium,
  knobIdle: Haptics.ImpactFeedbackStyle.Light,
} as const;

export type Feel = keyof typeof FEEL;

/** Starts the haptic engine ahead of the first key. */
export function prepareHaptics() {
  native?.prepare();
}

export function feel(kind: Feel) {
  if (native) {
    const [intensity, sharpness, body] = FEEL[kind];
    native.tap(intensity, sharpness, body);
  } else {
    Haptics.impactAsync(PRESET[kind]);
  }
}
