import { Group, Image, type SkImage } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout, SPACE_INDEX } from '../layout';

interface Props {
  image: SkImage;
  press: SharedValue<number[]>;
}

const SINK = 3;

export function SpaceBar({ image, press }: Props) {
  const bar = layout.spaceBar;
  const transform = useDerivedValue(() => [{ translateY: SINK * press.value[SPACE_INDEX] }]);

  return (
    <Group transform={transform}>
      <Image
        image={image}
        x={bar.x - bar.width / 2}
        y={bar.y - bar.height / 2}
        width={bar.width}
        height={bar.height}
        fit="fill"
      />
    </Group>
  );
}
