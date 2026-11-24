import { Group, Image } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout } from '../layout';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  /** How far the spools have turned, in radians. */
  turn: SharedValue<number>;
}

/**
 * The two ribbon spools. They sit on top of their still copies in the mechanism band and
 * turn a notch with every strike, as the ribbon is pulled through.
 */
export function Spools({ images, turn }: Props) {
  const rotation = useDerivedValue(() => [{ rotate: turn.value }]);

  return (
    <Group>
      {layout.spools.map((spool, index) => {
        const left = spool.x - spool.size / 2;
        const top = spool.y - spool.size / 2;
        return (
          <Group key={spool.side}>
            <Group origin={{ x: spool.x, y: spool.y }} transform={rotation}>
              <Image image={images.spools[index].disc} x={left} y={top} width={spool.size} height={spool.size} fit="fill" />
            </Group>
            <Image image={images.spools[index].cover} x={left} y={top} width={spool.size} height={spool.size} fit="fill" />
          </Group>
        );
      })}
    </Group>
  );
}
