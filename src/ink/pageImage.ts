import { FilterMode, MipmapMode, Skia, TileMode, type SkFont, type SkImage } from '@shopify/react-native-skia';
import { layout, sheetLength } from '../layout';
import { makeInkImage } from './inkImage';
import { paperEffect } from './paperShader';
import type { Stamp } from './stamps';

/** Pixels per point in the picture. */
const PAGE_SCALE = 3;
export interface PageImage {
  /** The page as a PNG, ready for an image view or the share sheet. */
  uri: string;
  /** The same picture, for drawing the page on the machine's canvas. */
  image: SkImage;
  width: number;
  height: number;
}

/**
 * A picture of the whole sheet as it comes out of the machine: the same paper and the same
 * ink as on screen, laid flat.
 */
export function makePageImage(stamps: Stamp[], font: SkFont, grain: SkImage): PageImage | null {
  const { paper, cell, line } = layout;
  const ink = makeInkImage(stamps, font);
  const width = paper.width;
  const lastLine = stamps.reduce((max, stamp) => Math.max(max, stamp.line), 0);
  const height = Math.round(sheetLength(lastLine + 1));

  const surface = Skia.Surface.Make(width * PAGE_SCALE, height * PAGE_SCALE);
  if (!surface) return null;

  // The shader works in sheet points, with y = 0 at the top of the first line.
  const inkShader = ink.image
    ? ink.image.makeShaderOptions(
        TileMode.Decal,
        TileMode.Decal,
        FilterMode.Linear,
        MipmapMode.None,
        Skia.Matrix().scale(ink.width / ink.image.width(), ink.height / ink.image.height()),
      )
    : Skia.Shader.MakeColor(Skia.Color('transparent'));
  const grainShader = grain.makeShaderOptions(
    TileMode.Repeat,
    TileMode.Repeat,
    FilterMode.Linear,
    MipmapMode.None,
    Skia.Matrix().scale(1 / 3, 1 / 3),
  );
  const paint = Skia.Paint();
  paint.setShader(paperEffect.makeShaderWithChildren([paper.width, paper.margin, cell, line], [inkShader, grainShader]));

  const canvas = surface.getCanvas();
  canvas.scale(PAGE_SCALE, PAGE_SCALE);
  canvas.translate(0, paper.topMargin);
  canvas.drawRect(Skia.XYWHRect(0, -paper.topMargin, width, height), paint);
  surface.flush();

  const image = surface.makeImageSnapshot();
  return { uri: `data:image/png;base64,${image.encodeToBase64()}`, image, width, height };
}
