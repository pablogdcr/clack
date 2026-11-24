import { Atlas, Circle, Group, LinearGradient, Rect, rect, Skia, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout } from '../layout';
import { KEY_SHRINK, KEY_SINK } from './KeyCaps';
import type { BankKey } from './KeyShadows';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  item: BankKey;
  press: SharedValue<number[]>;
  /** Turn of the cap about its stem, in radians: 0 shows the letter, pi the figure. */
  angle: SharedValue<number>;
  /** How dark the face in view is, 0 to 1: it loses the light as it turns away. */
  shade: SharedValue<number>;
}

const PX = layout.pixelsPerPoint;
/** Radius of the cap's metal ring as a share of the key's footprint radius. */
const CAP_SHARE = 0.87;
/** Half the height of a cap. The axis it spins on runs through its very middle. */
const HALF_HEIGHT = 3.5;
/** Distance of the eye, in points: nearer makes the near side of a turning cap grow more. */
const EYE = 300;
/** The cap's side wall is nickel: dark where it curves away, a bright line where it faces the lamp. */
const WALL_COLORS = ['#23211e', '#8d877c', '#e6dfd0', '#a59e91', '#57534c', '#1c1a18'];
const WALL_STOPS = [0, 0.18, 0.36, 0.55, 0.82, 1];
const END_COLOR = '#4a4741';

/**
 * A letter key as a solid object: a short nickel cylinder with the letter on its top face and
 * the figure on its underside, spinning about its own centre, in line with its stem. The two faces are drawn in true
 * perspective; the wall between them is what shows when the cap is edge-on.
 */
export function TurningKey({ images, item, press, angle, shade }: Props) {
  const { key, index } = item;
  const size = key.atlas.w / PX;
  // key.radius is the key's footprint; the cap itself stops a little short of it.
  const radius = key.radius * CAP_SHARE;

  const letterSprite = useMemo(() => [rect(key.atlas.x, key.atlas.y, key.atlas.w, key.atlas.h)], [key]);
  const figureSprite = useMemo(
    () => [rect(key.figAtlas.x, key.figAtlas.y, key.figAtlas.w, key.figAtlas.h)],
    [key],
  );
  const shadeSprite = useMemo(
    () => [rect(layout.shade.x, layout.shade.y, layout.shade.w, layout.shade.h)],
    [],
  );
  // Sprites are drawn centred on the cap's own origin; the pose puts that origin in place.
  const centred = useMemo(() => [Skia.RSXform(1 / PX, 0, -size / 2, -size / 2)], [size]);
  const shadeCentred = useMemo(() => {
    const scale = radius / layout.shade.radius / PX;
    return [Skia.RSXform(scale, 0, (-layout.shade.w * scale) / 2, (-layout.shade.h * scale) / 2)];
  }, [radius]);

  // The top face stands just above the axis, the underside just below it and mirrored, so
  // that it reads the right way round once it has come to the front.
  const topPose = useDerivedValue(() => {
    const down = press.value[index];
    return [
      { translateX: key.x },
      { translateY: key.y + KEY_SINK * down },
      { scale: 1 - KEY_SHRINK * down },
      { perspective: EYE },
      { rotateY: angle.value },
      { translateZ: HALF_HEIGHT },
    ];
  });
  const undersidePose = useDerivedValue(() => {
    const down = press.value[index];
    return [
      { translateX: key.x },
      { translateY: key.y + KEY_SINK * down },
      { scale: 1 - KEY_SHRINK * down },
      { perspective: EYE },
      { rotateY: angle.value },
      { translateZ: -HALF_HEIGHT },
      { scaleX: -1 },
    ];
  });

  // The wall joins the centres of the two faces. Seen from above it is a plain upright band.
  const wall = useDerivedValue(() => {
    const down = press.value[index];
    const scale = 1 - KEY_SHRINK * down;
    const sin = Math.sin(angle.value);
    const cos = Math.cos(angle.value);
    const centreOf = (depth: number) => key.x + (scale * depth * sin) / (1 - (depth * cos) / EYE);
    const top = centreOf(HALF_HEIGHT);
    const underside = centreOf(-HALF_HEIGHT);
    const half = radius * scale;
    const y = key.y + KEY_SINK * down - half;
    return rect(Math.min(top, underside), y, Math.abs(top - underside), 2 * half);
  });
  const gradientStart = useDerivedValue(() => vec(0, wall.value.y));
  const gradientEnd = useDerivedValue(() => vec(0, wall.value.y + wall.value.height));

  const letterUp = useDerivedValue<number>(() => (Math.cos(angle.value) >= 0 ? 1 : 0));
  const figureUp = useDerivedValue<number>(() => (Math.cos(angle.value) >= 0 ? 0 : 1));

  return (
    <Group>
      {/* the far end of the cylinder, then its wall, then the face turned to the eye */}
      <Group transform={topPose}>
        <Circle cx={0} cy={0} r={radius} color={END_COLOR} />
      </Group>
      <Group transform={undersidePose}>
        <Circle cx={0} cy={0} r={radius} color={END_COLOR} />
      </Group>
      <Rect rect={wall}>
        <LinearGradient start={gradientStart} end={gradientEnd} colors={WALL_COLORS} positions={WALL_STOPS} />
      </Rect>
      <Group transform={topPose} opacity={letterUp}>
        <Atlas image={images.caps} sprites={letterSprite} transforms={centred} />
        <Group opacity={shade}>
          <Atlas image={images.caps} sprites={shadeSprite} transforms={shadeCentred} />
        </Group>
      </Group>
      <Group transform={undersidePose} opacity={figureUp}>
        <Atlas image={images.caps} sprites={figureSprite} transforms={centred} />
        <Group opacity={shade}>
          <Atlas image={images.caps} sprites={shadeSprite} transforms={shadeCentred} />
        </Group>
      </Group>
    </Group>
  );
}
