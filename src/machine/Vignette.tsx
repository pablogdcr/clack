import { RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { layout } from '../layout';

/** Room around the layout for screens that are not exactly 440 x 956 pt. */
const OVERSCAN = 400;

/** Light falls off toward the corners, as under a desk lamp, which pulls the eye to the paper. */
export function Vignette() {
  const { width, height } = layout.screen;
  return (
    <Rect x={0} y={-OVERSCAN} width={width} height={height + OVERSCAN}>
      <RadialGradient
        c={vec(width / 2, layout.band.y)}
        r={height * 0.72}
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.55)']}
        positions={[0, 0.55, 1]}
      />
    </Rect>
  );
}
