import { Group, Image, type SkImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout } from '../layout';

interface Props {
  image: SkImage;
  paperLeft: SharedValue<number>;
  /** How far the carriage stands above its rest, in points. */
  rise: SharedValue<number>;
}

/** Left edge of the carriage image for a given paper position: the platen stays centred on the sheet. */
export function carriageLeft(paperLeft: number): number {
  'worklet';
  return paperLeft + layout.paper.width / 2 - layout.carriage.originX;
}

/** Platen, paper table, side arms and return lever. It slides with the paper. */
export function Carriage({ image, paperLeft, rise }: Props) {
  const transform = useDerivedValue(() => [
    { translateX: carriageLeft(paperLeft.value) },
    { translateY: -rise.value },
  ]);

  return (
    <Group transform={transform}>
      <Image
        image={image}
        x={0}
        y={layout.carriage.top}
        width={layout.carriage.width}
        height={layout.carriage.height}
        fit="fill"
      />
    </Group>
  );
}
