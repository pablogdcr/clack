import { Group, Image, LinearGradient, Rect, vec, type SkImage } from '@shopify/react-native-skia';
import { layout } from '../layout';

interface Props {
  image: SkImage;
}

/** How much of the desk's light is lost under the machine. */
const FLOOR_SHADE = 0.8;

/**
 * What shows between the keys. The machine's frame is open underneath, so the floor of the
 * well is the desk itself, deep in the machine's shadow; over it run the key levers, hanging
 * from the comb under the mechanism and sinking toward the front bar.
 */
export function Well({ image }: Props) {
  const { well, band, frame } = layout;
  const top = band.y;
  const bottom = (frame.barTop + frame.barBottom) / 2;

  return (
    <Group>
      <Rect x={0} y={top} width={well.width} height={bottom - top}>
        <LinearGradient
          start={vec(0, well.y)}
          end={vec(0, bottom)}
          colors={[`rgba(4, 3, 2, 0.97)`, `rgba(4, 3, 2, ${FLOOR_SHADE})`]}
          positions={[0, 0.45]}
        />
      </Rect>
      <Image image={image} x={well.x} y={well.y} width={well.width} height={well.height} fit="fill" />
    </Group>
  );
}
