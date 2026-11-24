import { Rect, Shader, Skia } from '@shopify/react-native-skia';
import { layout } from '../layout';

/** Dark wood: slow wavy rings stretched along the grain, with finer streaks on top. */
const effect = Skia.RuntimeEffect.Make(`
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y);
}

half4 main(vec2 p) {
  float warp = noise(p * vec2(0.004, 0.02)) * 6.0;
  float rings = sin((p.y * 0.09 + warp) * 6.2831);
  float grain = noise(vec2(p.x * 0.01, p.y * 1.3));
  float fine = noise(vec2(p.x * 0.05, p.y * 3.1));
  vec3 wood = vec3(0.20, 0.15, 0.11);
  vec3 color = wood * (0.80 + 0.08 * rings + 0.24 * grain + 0.10 * fine);
  return half4(color, 1.0);
}
`)!;

/** Room above the layout for screens taller than the 956 pt it was designed for. */
const OVERSCAN = 400;

/** The desk the machine sits on: behind the carriage, under the keys, and in front of the frame. */
export function Desk() {
  return (
    <Rect x={0} y={-OVERSCAN} width={layout.screen.width} height={layout.screen.height + OVERSCAN}>
      <Shader source={effect} />
    </Rect>
  );
}
