import { Atlas, Group, rect, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout, type KeyLayout } from '../layout';
import type { MachineImages } from './useMachineImages';

export interface BankKey {
  key: KeyLayout;
  /** The key's place in the press values. */
  index: number;
}

interface Props {
  images: MachineImages;
  bank: BankKey[];
  press: SharedValue<number[]>;
}

const PX = layout.pixelsPerPoint;

/** The soft shadow each cap drops just under itself; it tightens as the key goes down. */
export function KeyShadows({ images, bank, press }: Props) {
  const sprites = useMemo(
    () => bank.map(() => rect(layout.shadow.x, layout.shadow.y, layout.shadow.w, layout.shadow.h)),
    [bank],
  );
  const transforms = useDerivedValue(() =>
    bank.map(({ key, index }) => {
      const down = press.value[index];
      const scale = ((key.radius / 19) * (1 - 0.14 * down)) / PX;
      const size = layout.shadow.w * scale;
      return Skia.RSXform(scale, 0, key.x - size / 2, key.y + 4 - 2.5 * down - size / 2);
    }),
  );

  return (
    <Group opacity={0.6}>
      <Atlas image={images.caps} sprites={sprites} transforms={transforms} />
    </Group>
  );
}
