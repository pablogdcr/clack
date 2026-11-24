import { Skia } from '@shopify/react-native-skia';

/**
 * The sheet: paper grain and fibres, with the ink soaked into it.
 *
 * `ink` is data, not colour (see inkImage.ts): alpha = where the type touched,
 * red = strike pressure, green = struck through the red half of the ribbon, blue = which typebar. Coordinates are sheet points, with
 * y = 0 at the top of the first line, so the grain travels with the paper.
 */
const source = `
uniform shader ink;
uniform shader grain;
uniform float sheetWidth;
uniform float margin;
uniform float cellWidth;
uniform float lineHeight;

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
  // --- paper ---
  float g = grain.eval(p).r;                                   // fine tooth, around 0.45
  float fibre = 0.5 * noise(p * vec2(0.35, 1.6)) + 0.5 * noise(p * 0.08);
  vec3 paper = vec3(0.937, 0.906, 0.824);
  paper *= 0.90 + 0.22 * g;
  paper *= 0.97 + 0.05 * fibre;
  // The sheet is not perfectly flat, and the lamp is on its left: a slow ripple across it,
  // and a little less light toward the right.
  paper *= 1.015 - 0.045 * p.x / sheetWidth;
  paper *= 1.0 + 0.012 * sin(p.x * 0.047 + 1.3) + 0.008 * sin(p.y * 0.031 + p.x * 0.011);
  // the long edges have yellowed a little more
  float edge = min(p.x, sheetWidth - p.x);
  paper *= 1.0 - 0.06 * (1.0 - smoothstep(0.0, 10.0, edge));

  // --- ink ---
  // The ink creeps along the paper's tooth, which roughens every edge.
  vec2 creep = (vec2(noise(p * 2.3), noise(p * 2.3 + 19.7)) - 0.5) * 0.9 + (g - 0.45) * 0.8;
  vec2 q = p + creep;
  vec4 strike = ink.eval(q);
  float touched = strike.a;
  float pressure = touched > 0.001 ? strike.r / touched : 0.0;
  float seed = touched > 0.001 ? strike.b / touched : 0.0;
  float redHalf = touched > 0.001 ? strike.g / touched : 0.0;

  // Just inside an edge the surroundings are emptier than the centre.
  float r = 0.75;
  float around = 0.25 * (
    ink.eval(q + vec2(r, 0.0)).a + ink.eval(q - vec2(r, 0.0)).a +
    ink.eval(q + vec2(0.0, r)).a + ink.eval(q - vec2(0.0, r)).a);
  float rim = clamp(touched - around, 0.0, 1.0);

  // The ribbon is woven cloth; a soft strike prints its weave.
  vec2 w = vec2(p.x + p.y, p.x - p.y) * 5.4;
  float weave = 0.5 + 0.5 * sin(w.x) * sin(w.y);
  float soft = 1.0 - smoothstep(0.45, 0.85, pressure);

  // Some typebars never land flat: one side of the letter prints fainter, always the same side.
  vec2 inCell = vec2(fract((p.x - margin) / cellWidth), fract(p.y / lineHeight)) - 0.5;
  float angle = seed * 6.2831;
  float lean = dot(inCell, vec2(cos(angle), sin(angle)));
  float uneven = 1.0 - 0.45 * smoothstep(-0.1, 0.5, lean) * step(0.6, fract(seed * 7.0));

  float density = touched * pressure;
  density *= mix(1.0, 0.58 + 0.42 * weave, soft);
  density *= uneven;
  density *= 1.0 + 0.9 * rim * (0.4 + soft);       // the stroke's edge stays darker than its core
  density *= 0.86 + 0.28 * g;
  density = clamp(density, 0.0, 1.0);

  // The ribbon has a black half and a red half.
  vec3 inkColor = mix(vec3(0.13, 0.135, 0.17), vec3(0.66, 0.11, 0.09), redHalf);
  vec3 color = paper * mix(vec3(1.0), inkColor, density);

  // The type dents the sheet: a faint lit and shaded edge, light coming from the top left.
  float dent = ink.eval(p + vec2(0.6, 0.6)).a - ink.eval(p - vec2(0.6, 0.6)).a;
  color += dent * 0.035;

  return half4(color, 1.0);
}
`;

export const paperEffect = Skia.RuntimeEffect.Make(source)!;
