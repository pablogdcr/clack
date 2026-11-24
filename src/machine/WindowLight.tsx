import { Group, Rect, Shader, Skia } from '@shopify/react-native-skia';
import { useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { layout } from '../layout';

/**
 * Sunlight from a plain window, falling across the desk and the machine: one large slanted
 * patch with wide soft edges, no blind. It is drawn twice. With tint = 0 the output is
 * the light the patch adds (for a screen blend: it lifts dark wood and metal, and leaves pale
 * paper alone). With tint = 1 it is the warmth of that light (for a multiply blend: that is
 * what shows the patch on the paper, which cannot get any brighter).
 */
const effect = Skia.RuntimeEffect.Make(`
uniform float shift;
uniform float strength;
uniform float tint;

float hash(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i.x + i.y * 57.0);
  float b = hash(i.x + 1.0 + i.y * 57.0);
  float c = hash(i.x + (i.y + 1.0) * 57.0);
  float d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

half4 main(vec2 p) {
  // The window's own axes on the desk: it is turned, and sheared by the angle of the sun.
  // The whole patch drifts as the sun moves.
  float angle = -0.42;
  float v = -p.x * sin(angle) + p.y * cos(angle) + shift;
  float u = p.x * cos(angle) + p.y * sin(angle) - 0.22 * v;

  // A tall window: the patch runs from the top of the desk down over the whole machine. Its
  // upper and right edges are wide and soft, and toward the keyboard the light just fades out.
  float patch = smoothstep(40.0, 110.0, v) * (1.0 - smoothstep(520.0, 900.0, v));
  patch *= smoothstep(-420.0, -340.0, u) * (1.0 - smoothstep(120.0, 190.0, u));

  // Old glass: the light is not quite even.
  float light = patch * (0.86 + 0.14 * noise(p * 0.016));

  if (tint > 0.5) {
    return half4(vec3(1.0) - light * strength * vec3(0.0, 0.35, 1.0), 1.0);
  }
  return half4(vec3(1.0, 0.93, 0.8) * light * strength, 1.0);
}
`)!;

/** How much light the patch adds to dark surfaces, and how warm it turns pale ones. */
const LIGHT = 0.065;
const WARMTH = 0.08;
/** The light drifts this far each way, in points, over this many seconds. */
const DRIFT = 22;
const DRIFT_SECONDS = 80;
/** The drift is slow enough to be redrawn only a few times a second. */
const STEP_MS = 120;
/** Room above the layout for screens taller than the 956 pt it was designed for. */
const OVERSCAN = 400;

/**
 * Daylight from a window, over everything on the canvas. It gives the scene a time of day
 * without putting anything on the desk, and it is never quite still.
 */
export function WindowLight() {
  const shift = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const sinceDrawn = useSharedValue(0);
  useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame ?? 16;
    elapsed.value += dt;
    sinceDrawn.value += dt;
    if (sinceDrawn.value < STEP_MS) return;
    sinceDrawn.value = 0;
    shift.value = DRIFT * Math.sin((elapsed.value / 1000 / DRIFT_SECONDS) * 2 * Math.PI);
  });
  const light = useDerivedValue(() => ({ shift: shift.value, strength: LIGHT, tint: 0 }));
  const warmth = useDerivedValue(() => ({ shift: shift.value, strength: WARMTH, tint: 1 }));
  const { width, height } = layout.screen;

  return (
    <Group>
      <Rect x={0} y={-OVERSCAN} width={width} height={height + OVERSCAN} blendMode="multiply">
        <Shader source={effect} uniforms={warmth} />
      </Rect>
      <Rect x={0} y={-OVERSCAN} width={width} height={height + OVERSCAN} blendMode="screen">
        <Shader source={effect} uniforms={light} />
      </Rect>
    </Group>
  );
}
