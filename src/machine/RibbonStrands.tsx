import { Group, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout } from '../layout';

interface Props {
  /** Top of the ribbon's picture at the print point; it rises for every strike. */
  ribbonY: SharedValue<number>;
}

/** Thickness of the cloth: what shows of the ribbon where it is edge-on. */
const THICKNESS = 1.4;
/** The two halves of the ribbon facing us, and in shadow where they are still nearly edge-on. */
const BLACK = '#121116';
const BLACK_SHADED = '#060507';
const RED = '#5a100d';
const RED_SHADED = '#1a0705';
/** The run is drawn as this many pieces. */
const PIECES = 24;
/** Share of the run the ribbon covers edge-on, as a thin line, before it starts to turn. */
const TWIST_FROM = 0.42;
/** Length over which a run levels out as it reaches the band, in points. */
const ARRIVE = 26;
/** How far a run hangs below a straight line while the ribbon is at rest, in points. */
const SLACK = 2;
/**
 * Where a run comes off its spool: this far out from the centre, this far round from the
 * top. It is inside the disc, so the run is seen to come out from under the plate.
 */
const SPOOL_REACH = 0.8;
const SPOOL_ANGLE = 0.55;
/** Radius of a spool's top plate, as a share of the spool's picture. */
const PLATE = 0.985;

interface RunProps extends Props {
  spool: (typeof layout.spools)[number];
}

/**
 * One run of ribbon, from the top of a spool to the print point. On its spool the ribbon is
 * edge-on; at the print point it faces us. It stays a thin line for the first part of the
 * run, then makes that quarter turn over the rest, opening steadily into the band the type
 * strikes through, black half above and red half below, and coming out of the shadow as it
 * turns to the light.
 * Lifting the band for a strike pulls the run up with it and takes up its slack.
 */
function Run({ spool, ribbonY }: RunProps) {
  const { ribbon } = layout;
  const direction = spool.x < layout.printX ? -1 : 1;
  const startX = spool.x - direction * (spool.size / 2) * SPOOL_REACH * Math.sin(SPOOL_ANGLE);
  const startY = spool.y - (spool.size / 2) * SPOOL_REACH * Math.cos(SPOOL_ANGLE);
  // Where the band ends on this side (a little inside its picture, so that no seam shows).
  const bandX = layout.printX + direction * (ribbon.width / 2 - ribbon.pad - 1.5);

  const shape = useDerivedValue(() => {
    const lift = ribbon.restY - ribbonY.value;
    const seam = ribbonY.value + ribbon.clothTop + ribbon.blackHeight;
    const slack = Math.max(0.5, SLACK - lift * 0.15);
    const above = ribbon.blackHeight;
    const below = ribbon.clothHeight - ribbon.blackHeight;

    const leaveX = startX + (bandX - startX) * 0.35;
    const leaveY = startY + (seam - startY) * 0.35;
    const arriveX = bandX + direction * ARRIVE;

    const middle: number[][] = [];
    const upper: number[][] = [];
    const lower: number[][] = [];
    for (let piece = 0; piece <= PIECES; piece++) {
      const t = piece / PIECES;
      // The run leaves the spool straight and comes in level with the band (a cubic curve).
      const u = 1 - t;
      const x = u * u * u * startX + 3 * u * u * t * leaveX + 3 * u * t * t * arriveX + t * t * t * bandX;
      const y =
        u * u * u * startY + 3 * u * u * t * leaveY + 3 * u * t * t * seam + t * t * t * seam + slack * 4 * t * u;
      // The ribbon leaves its spool edge-on and stays so for the first part of the run; then
      // it makes its quarter turn over the rest. What shows of each half grows with the sine
      // of the turn.
      const turned = Math.max(0, (t - TWIST_FROM) / (1 - TWIST_FROM));
      const facing = Math.pow(Math.sin((turned * Math.PI) / 2), 1.5);
      middle.push([x, y]);
      upper.push([x, y - Math.max(THICKNESS / 2, above * facing)]);
      lower.push([x, y + Math.max(THICKNESS / 2, below * facing)]);
    }
    const half = (edge: number[][]) => {
      const path = Skia.Path.Make();
      path.moveTo(edge[0][0], edge[0][1]);
      for (let i = 1; i < edge.length; i++) path.lineTo(edge[i][0], edge[i][1]);
      for (let i = middle.length - 1; i >= 0; i--) path.lineTo(middle[i][0], middle[i][1]);
      path.close();
      return path;
    };
    const outline = Skia.Path.Make();
    outline.moveTo(upper[0][0], upper[0][1]);
    for (let i = 1; i < upper.length; i++) outline.lineTo(upper[i][0], upper[i][1]);
    for (let i = lower.length - 1; i >= 0; i--) outline.lineTo(lower[i][0], lower[i][1]);
    outline.close();
    return { black: half(upper), red: half(lower), outline, seam };
  });
  const black = useDerivedValue(() => shape.value.black);
  const red = useDerivedValue(() => shape.value.red);
  const outline = useDerivedValue(() => shape.value.outline);
  const lit = useDerivedValue(() => vec(bandX, shape.value.seam));

  return (
    <Group>
      {/* its shadow on what lies under it */}
      <Group transform={[{ translateX: 1.5 }, { translateY: 3 }]}>
        <Path path={outline} color="rgba(0, 0, 0, 0.3)" />
      </Group>
      <Path path={black}>
        <LinearGradient start={vec(startX, startY)} end={lit} colors={[BLACK_SHADED, BLACK]} />
      </Path>
      <Path path={red}>
        <LinearGradient start={vec(startX, startY)} end={lit} colors={[RED_SHADED, RED_SHADED, RED]} positions={[0, 0.5, 1]} />
      </Path>
    </Group>
  );
}

/**
 * The discs of the two spools. The ribbon is wound between a spool's two plates, so a run
 * goes in under the top plate: nothing of it, nor of its shadow, is drawn over a spool.
 */
const spoolDiscs = Skia.Path.Make();
for (const spool of layout.spools) spoolDiscs.addCircle(spool.x, spool.y, (spool.size / 2) * PLATE);

/** The ribbon's two runs, from the spools to the print point. */
export function RibbonStrands({ ribbonY }: Props) {
  return (
    <Group clip={spoolDiscs} invertClip>
      {layout.spools.map((spool) => (
        <Run key={spool.side} spool={spool} ribbonY={ribbonY} />
      ))}
    </Group>
  );
}
