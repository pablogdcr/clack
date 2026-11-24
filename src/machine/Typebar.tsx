import { Group, Image, type SkImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout } from '../layout';

export interface BarSlot {
  /** Centre of the bar where it lies in the basket, and how wide it looks there. */
  x: number;
  width: number;
  /** How far down it can be seen before a lever lying over the basket hides it. */
  bottom: number;
}

interface Props {
  /** The bar itself, or its shadow, drawn pivot at the top. */
  image: SkImage;
  /** Width of that image in points; a shadow's is wider than the bar's. */
  imageWidth: number;
  /** Swing: 0 lying in the basket, 1 on the paper. */
  swing: SharedValue<number>;
  /** The slot the bar belongs to. */
  slot: SharedValue<BarSlot>;
  opacity: SharedValue<number>;
  /** How far the bar's head is pushed aside, per unit of height: set for a shadow. */
  cast?: { dx: number; dy: number };
}

/** Share of the swing spent rising out of the basket; the rest is the reach to the paper. */
export const RISE = 0.45;

/** The bar lying in the basket that a key lifts: the one nearest to under the key, scaled in. */
export function slotFor(keyX: number): BarSlot {
  'worklet';
  const { printX, typebar } = layout;
  const wanted = printX + (keyX - printX) * typebar.spread;
  let best = typebar.slots[0];
  for (const slot of typebar.slots) {
    if (Math.abs(slot.x - wanted) < Math.abs(best.x - wanted)) best = slot;
  }
  return best;
}

/**
 * One typebar in motion, cut from the scan's own basket. Seen from above, a bar that is
 * lifted by its head shortens where it lies until only its end is seen, then reaches the
 * other way, from its pivot to the letter it prints. At the start and end of the swing it
 * lies exactly on the bar it was cut to stand for.
 */
export function Typebar({ image, imageWidth, swing, slot, opacity, cast }: Props) {
  const { printX, typebar } = layout;

  const transform = useDerivedValue(() => {
    const s = swing.value;
    const { x, width, bottom } = slot.value;
    let tipX = x;
    let tipY: number;
    // In the basket a bar is seen edge-on, as narrow as its slot; reaching, it shows its side.
    let widen = width / typebar.width;
    if (s < RISE) {
      // Never drawn past the point where a lever hides the bar.
      tipY = Math.min(typebar.pivotY + typebar.length * (1 - s / RISE), bottom);
    } else {
      const reach = (s - RISE) / (1 - RISE);
      tipX = x + (printX - x) * reach;
      tipY = typebar.pivotY + (typebar.strikeY - typebar.pivotY) * reach;
      widen += (1 - widen) * reach;
    }
    if (cast) {
      const height = Math.sin(Math.PI * s);
      tipX += cast.dx * height;
      tipY += cast.dy * height;
    }
    const dx = tipX - x;
    const dy = tipY - typebar.pivotY;
    const stretch = Math.max(Math.hypot(dx, dy), 0.5) / typebar.length;
    // Pointing down, the image is as scanned; reaching up, it is the same bar turned over.
    return dy >= 0
      ? [{ translateX: x }, { translateY: typebar.pivotY }, { rotate: Math.atan2(-dx, dy) }, { scaleX: widen }, { scaleY: stretch }]
      : [{ translateX: x }, { translateY: typebar.pivotY }, { rotate: Math.atan2(dx, -dy) }, { scaleX: widen }, { scaleY: -stretch }];
  });

  return (
    <Group transform={transform} opacity={opacity}>
      <Image image={image} x={-imageWidth / 2} y={0} width={imageWidth} height={typebar.length} fit="fill" />
    </Group>
  );
}
