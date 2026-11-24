import { Group, Rect, rect } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { BarMotion } from '../engine/useTypewriter';
import { layout } from '../layout';
import { RISE, slotFor, Typebar } from './Typebar';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  bar: BarMotion;
}

/** The bar moves too fast to see sharp: fainter copies trail it on either side of its reach. */
const BLUR_SPREAD = 0.08;
/** Where the bar's shadow falls when the bar is at its highest, in points: away from the lamp. */
const BAR_SHADOW = { dx: 8, dy: 11 };
/** What shows where a bar has left the basket: the dark under it. */
const EMPTY_SLOT = 'rgba(6, 5, 4, 0.92)';

/**
 * One typebar out of the basket: the empty slot it leaves, its shadow, the blur of its
 * swing, and the bar itself. On the paper it stays put for as long as its key is held.
 */
export function StrikingBar({ images, bar }: Props) {
  const { typebar } = layout;
  const { swing, keyX } = bar;

  const slot = useDerivedValue(() => slotFor(keyX.value));
  const trailBehind = useDerivedValue(() => Math.max(0, swing.value - BLUR_SPREAD));
  const trailAhead = useDerivedValue(() => Math.min(1, swing.value + BLUR_SPREAD));
  // At rest the bar is the one in the basket image. The moment it moves, that place is
  // covered by an empty slot and the moving bar takes over, starting exactly where it lay.
  const away = useDerivedValue<number>(() => (swing.value > 0.001 ? 1 : 0));
  const emptySlot = useDerivedValue(() => {
    const { x, width, bottom } = slot.value;
    return rect(x - width / 2, typebar.slotTop, width, bottom - typebar.slotTop);
  });
  const trailOpacity = useDerivedValue<number>(() => (swing.value > RISE && swing.value < 0.98 ? 0.3 : 0));
  const shadowOpacity = useDerivedValue<number>(() => 0.8 * away.value);

  return (
    <Group>
      <Rect rect={emptySlot} color={EMPTY_SLOT} opacity={away} />
      <Typebar
        image={images.typebarShadow}
        imageWidth={typebar.shadowWidth}
        swing={swing}
        slot={slot}
        opacity={shadowOpacity}
        cast={BAR_SHADOW}
      />
      <Typebar image={images.typebar} imageWidth={typebar.width} swing={trailBehind} slot={slot} opacity={trailOpacity} />
      <Typebar image={images.typebar} imageWidth={typebar.width} swing={trailAhead} slot={slot} opacity={trailOpacity} />
      <Typebar image={images.typebar} imageWidth={typebar.width} swing={swing} slot={slot} opacity={away} />
    </Group>
  );
}
