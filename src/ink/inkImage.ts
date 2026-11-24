import {
  BlurStyle,
  createPicture,
  drawAsImageFromPicture,
  PaintStyle,
  Skia,
  StrokeJoin,
  type SkFont,
  type SkImage,
} from '@shopify/react-native-skia';
import { layout } from '../layout';
import type { Stamp } from './stamps';

/** Pixels per point in the ink image. */
const INK_SCALE = 3;
/** Distance from the top of a line to its baseline. */
const BASELINE = 19;
/** Room under the last line for descenders. */
const BOTTOM_PAD = 8;

/** Extra stroke width that stands in for ink spreading into the paper. */
const INK_GAIN = 0.45;
const CLOGGED_GAIN = 1.15;

export interface InkImage {
  image: SkImage | null;
  /** Size of the area the image covers on the sheet, in points. */
  width: number;
  height: number;
}

/**
 * Every strike, drawn as data for the paper shader rather than as final colour:
 * alpha is where the type touched, red is how hard, green says which half of the ribbon was
 * used (1 for its red half), blue identifies the typebar.
 * The sheet's coordinates start at the top of line 0.
 */
export function makeInkImage(stamps: Stamp[], font: SkFont): InkImage {
  const { paper, cell, line } = layout;
  const lastLine = stamps.reduce((max, stamp) => Math.max(max, stamp.line), 0);
  const width = paper.width;
  const height = (lastLine + 1) * line + BOTTOM_PAD;

  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 0.28, true));

  const gain = fill.copy();
  gain.setStyle(PaintStyle.Stroke);
  gain.setStrokeJoin(StrokeJoin.Round);

  const picture = createPicture((canvas) => {
    canvas.scale(INK_SCALE, INK_SCALE);
    for (const stamp of stamps) {
      const data = Float32Array.of(stamp.pressure, stamp.red ? 1 : 0, stamp.seed, 1);
      const x = paper.margin + stamp.cell * cell + stamp.dx;
      const y = stamp.line * line + BASELINE + stamp.dy;
      fill.setColor(data);
      gain.setColor(data);
      gain.setStrokeWidth(stamp.clogged ? CLOGGED_GAIN : INK_GAIN);
      canvas.drawText(stamp.char, x, y, gain, font);
      canvas.drawText(stamp.char, x, y, fill, font);
    }
  });

  const image = drawAsImageFromPicture(picture, {
    width: Math.ceil(width * INK_SCALE),
    height: Math.ceil(height * INK_SCALE),
  });
  return { image, width, height };
}
