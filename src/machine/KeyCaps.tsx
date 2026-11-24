import { Atlas, Group, rect, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout } from '../layout';
import { KeyShadows, type BankKey } from './KeyShadows';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  bank: BankKey[];
  press: SharedValue<number[]>;
}

const PX = layout.pixelsPerPoint;

/** How far a cap sinks, and how much smaller it gets, when fully pressed. */
export const KEY_SINK = 4;
export const KEY_SHRINK = 0.07;

/**
 * The caps of keys that only go up and down, with their shadows: two atlases, so the whole
 * set moves in two draw calls.
 */
export function KeyCaps({ images, bank, press }: Props) {
  const sprites = useMemo(
    () => bank.map(({ key }) => rect(key.atlas.x, key.atlas.y, key.atlas.w, key.atlas.h)),
    [bank],
  );

  // Recomputed on the UI thread in the same frame the press value changes.
  const transforms = useDerivedValue(() =>
    bank.map(({ key, index }) => {
      const down = press.value[index];
      const scale = (1 - KEY_SHRINK * down) / PX;
      const size = key.atlas.w * scale;
      return Skia.RSXform(scale, 0, key.x - size / 2, key.y + KEY_SINK * down - size / 2);
    }),
  );

  return (
    <Group>
      <KeyShadows images={images} bank={bank} press={press} />
      <Atlas image={images.caps} sprites={sprites} transforms={transforms} />
    </Group>
  );
}
