import {
  Blur,
  FilterMode,
  Group,
  ImageShader,
  LinearGradient,
  Paint,
  Path,
  Rect,
  rect,
  Shader,
  Skia,
  vec,
  Vertices,
  type SkFont,
  type SkImage,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { makeInkImage } from '../ink/inkImage';
import { paperEffect } from '../ink/paperShader';
import type { Stamp } from '../ink/stamps';
import { layout, sheetLength } from '../layout';

interface Props {
  font: SkFont;
  stamps: Stamp[];
  paperLeft: SharedValue<number>;
  lineIndex: SharedValue<number>;
  feed: SharedValue<number>;
  /** How far the carriage stands above its rest, in points. */
  rise: SharedValue<number>;
  /** How far the sheet has been pulled up by hand, and how far it has flown once out. */
  pull: SharedValue<number>;
  eject: SharedValue<number>;
  /** How far sideways the hand holds the paper, and how high above the platen it has it. */
  sway: SharedValue<number>;
  grip: SharedValue<number>;
  /** The paper's tooth, shared with the picture taken of a finished page. */
  grain: SkImage | null;
}

/** The grain image is 768 px wide and should repeat every 256 pt. */
const GRAIN_TRANSFORM = [{ scale: 1 / 3 }];
const LINEAR = { filter: FilterMode.Linear };
/** The sheet's cut edge is this thick. */
const EDGE = 0.7;
/** How far up from the platen the bend in the sheet can be seen. */
const CURL = 34;
/** The sheet is drawn as this many bands from the platen to its top, so that it can bend. */
const BANDS = 28;
/** How the paper curves between the platen and the fingers: 1 would be a straight lean. */
const BEND = 1.7;

/** How far aside the paper can be taken, as a share of the height it is held at. */
const STIFFNESS = 0.3;

/** Two triangles per band. */
const INDICES = Array.from({ length: BANDS }, (_, band) => {
  const corner = band * 2;
  return [corner, corner + 1, corner + 2, corner + 1, corner + 3, corner + 2];
}).flat();

/**
 * The sheet and everything typed on it. The line being typed stays at a fixed height;
 * earlier lines sit above it, and the sheet grows upward with each line feed.
 *
 * The sheet is a strip of bands, not a rectangle: the platen holds its foot, and a hand that
 * pulls it to one side bends it over from there.
 */
export function Paper({ font, stamps, paperLeft, lineIndex, feed, rise, pull, eject, sway, grip, grain }: Props) {
  const { paper, cell, line, printLineTop } = layout;

  const ink = useMemo(() => makeInkImage(stamps, font), [stamps, font]);
  const inkRect = useMemo(() => rect(0, 0, ink.width, ink.height), [ink.width, ink.height]);
  const uniforms = useMemo(
    () => ({
      sheetWidth: paper.width,
      margin: paper.margin,
      cellWidth: cell,
      lineHeight: line,
    }),
    [paper.width, paper.margin, cell, line],
  );

  const slide = useDerivedValue(() => [{ translateX: paperLeft.value }, { translateY: -rise.value }]);
  // Where line 0 sits on screen right now. A sheet on its way out keeps travelling up.
  const firstLineTop = useDerivedValue(
    () => printLineTop - lineIndex.value * line + feed.value - pull.value - eject.value,
  );
  // Most of the sheet is out of sight, wound round the platen. It shows from its top edge
  // down to the platen, until its foot comes out: then the whole sheet, a full A4, is free.
  const foot = useDerivedValue(() =>
    Math.min(paper.bottom, firstLineTop.value - paper.topMargin + sheetLength(lineIndex.value + 1)),
  );
  const inPlaten = useDerivedValue<number>(() => (foot.value >= paper.bottom ? 1 : 0));

  // Where every band of the sheet is. Its centre line leans from the platen toward the hand,
  // curving up to where the fingers hold it and running straight above them; each band lies
  // square across that line, so the sheet keeps its width as it bends.
  const shape = useDerivedValue(() => {
    const top = firstLineTop.value - paper.topMargin;
    const bottom = foot.value;
    const height = Math.max(bottom - top, 0);
    const reach = Math.max(grip.value + pull.value, 30);
    // Paper held close to the platen cannot be taken far aside: it would tear first.
    const limit = STIFFNESS * reach;
    const aside = limit * Math.tanh(sway.value / limit);
    const half = paper.width / 2;
    const corners = [];
    const sheetPoints = [];
    for (let band = 0; band <= BANDS; band++) {
      const up = (height * band) / BANDS;
      const t = up / reach;
      const lean = t <= 1 ? Math.pow(t, BEND) : 1 + BEND * (t - 1);
      const slope = ((t <= 1 ? BEND * Math.pow(t, BEND - 1) : BEND) * aside) / reach;
      const length = Math.hypot(slope, 1);
      const centreX = half + aside * lean;
      const centreY = bottom - up;
      const acrossX = half / length;
      const acrossY = (half * slope) / length;
      corners.push(vec(centreX - acrossX, centreY - acrossY), vec(centreX + acrossX, centreY + acrossY));
      // What the paper shader sees: the flat sheet, with y = 0 at the top of line 0.
      const sheetY = centreY - firstLineTop.value;
      sheetPoints.push(vec(0, sheetY), vec(paper.width, sheetY));
    }
    return { corners, sheetPoints };
  });
  const corners = useDerivedValue(() => shape.value.corners);
  const sheetPoints = useDerivedValue(() => shape.value.sheetPoints);

  // The cut edges of the sheet: lit on the lamp's side and along the top, shaded opposite.
  const leftEdge = useDerivedValue(() => {
    const edge = Skia.Path.Make();
    const points = shape.value.corners;
    edge.moveTo(points[0].x, points[0].y);
    for (let i = 2; i < points.length; i += 2) edge.lineTo(points[i].x, points[i].y);
    edge.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    return edge;
  });
  const rightEdge = useDerivedValue(() => {
    const edge = Skia.Path.Make();
    const points = shape.value.corners;
    edge.moveTo(points[1].x, points[1].y);
    for (let i = 3; i < points.length; i += 2) edge.lineTo(points[i].x, points[i].y);
    return edge;
  });

  return (
    <Group transform={slide}>
      {/* the sheet stands clear of the carriage behind it: its shadow falls away from the lamp */}
      <Group transform={[{ translateX: 5 }, { translateY: 7 }]} layer={<Paint opacity={0.55}><Blur blur={8} /></Paint>}>
        <Vertices vertices={corners} indices={INDICES} color="black" />
      </Group>
      <Vertices vertices={corners} textures={sheetPoints} indices={INDICES}>
        <Shader source={paperEffect} uniforms={uniforms}>
          <ImageShader image={ink.image} fit="fill" rect={inkRect} tx="decal" ty="decal" sampling={LINEAR} />
          <ImageShader image={grain} fit="none" tx="repeat" ty="repeat" transform={GRAIN_TRANSFORM} sampling={LINEAR} />
        </Shader>
      </Vertices>
      <Path path={leftEdge} style="stroke" strokeWidth={EDGE} color="rgba(255, 252, 240, 0.5)" />
      <Path path={rightEdge} style="stroke" strokeWidth={EDGE} color="rgba(70, 52, 24, 0.28)" />
      {/* The sheet bends back around the platen: it catches the light where the bend begins,
          then turns away from it and goes dark as it rolls under. */}
      <Rect x={0} y={paper.bottom - CURL} width={paper.width} height={CURL} opacity={inPlaten}>
        <LinearGradient
          start={vec(0, paper.bottom - CURL)}
          end={vec(0, paper.bottom)}
          colors={[
            'rgba(255, 250, 232, 0)',
            'rgba(255, 250, 232, 0.16)',
            'rgba(48, 36, 16, 0.04)',
            'rgba(40, 30, 14, 0.3)',
            'rgba(18, 13, 6, 0.72)',
          ]}
          positions={[0, 0.3, 0.52, 0.8, 1]}
        />
      </Rect>
    </Group>
  );
}
