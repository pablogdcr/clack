import { LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { layout } from '../layout';

interface Props {
  /** Top edge of the shadow: the edge of whatever casts it. */
  y: number;
  height: number;
  /** Darkness right under the edge, 0 to 1. */
  strength: number;
}

/** The shadow one part of the machine drops on the part below it: dark at the edge, fading out. */
export function CastShadow({ y, height, strength }: Props) {
  return (
    <Rect x={0} y={y} width={layout.screen.width} height={height}>
      <LinearGradient
        start={vec(0, y)}
        end={vec(0, y + height)}
        colors={[`rgba(0, 0, 0, ${strength})`, 'rgba(0, 0, 0, 0)']}
      />
    </Rect>
  );
}
