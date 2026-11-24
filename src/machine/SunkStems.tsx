import { Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout } from '../layout';
import type { BankKey } from './KeyShadows';

interface Props {
  bank: BankKey[];
  press: SharedValue<number[]>;
}

/** A key counts as down once it has covered this much of its travel. */
const DOWN = 0.3;
/** How dark a lever gets once it has sunk below its neighbours. */
const SHADE = 'rgba(0, 0, 0, 0.55)';

/**
 * Pressing a key pushes its whole lever down, not only its cap: the lever drops below its
 * neighbours and out of the light. One path holds the shade for every key that is down.
 */
export function SunkStems({ bank, press }: Props) {
  const { top, width } = layout.stem;

  const path = useDerivedValue(() => {
    const sunk = Skia.Path.Make();
    for (const { key, index } of bank) {
      if (press.value[index] < DOWN) continue;
      sunk.addRect(Skia.XYWHRect(key.stemX - width / 2 - 0.5, top, width + 1, key.y - top));
    }
    return sunk;
  });

  return <Path path={path} color={SHADE} />;
}
