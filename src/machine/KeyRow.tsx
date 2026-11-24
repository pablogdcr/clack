import { Group } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { rowTurn } from '../engine/keyTurn';
import { KeyShadows, type BankKey } from './KeyShadows';
import { TurningKey } from './TurningKey';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  /** The letter keys of one row. */
  bank: BankKey[];
  /** Rows turn one after the other, the first one first. */
  order: number;
  press: SharedValue<number[]>;
  /** Which set the row is turning to. */
  figures: SharedValue<boolean>;
  /** Progress of the change, 0 to 1; it rests at 1. */
  swap: SharedValue<number>;
}

/**
 * One row of letter keys. Each cap carries a letter on top and a figure underneath, and its
 * stem is its axle: changing sets spins every cap of the row half a turn on its stem, and
 * back again for the letters.
 */
export function KeyRow({ images, bank, order, press, figures, swap }: Props) {
  // 0 with the letters up, pi with the figures up.
  const angle = useDerivedValue(() => {
    const turned = rowTurn(swap.value, order);
    return figures.value ? turned : Math.PI - turned;
  });

  // A face turned away from the lamp goes dark.
  const shade = useDerivedValue(() => 0.75 * (1 - Math.abs(Math.cos(angle.value))));

  return (
    <Group>
      <KeyShadows images={images} bank={bank} press={press} />
      {bank.map((item) => (
        <TurningKey key={item.key.name} images={images} item={item} press={press} angle={angle} shade={shade} />
      ))}
    </Group>
  );
}
