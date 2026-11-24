import { Group, Image, Rect, Shadow } from '@shopify/react-native-skia';
import type { PageImage } from '../ink/pageImage';
import { SHEET_RATIO } from '../layout';

interface Props {
  /** Every page typed so far, oldest first. */
  pages: PageImage[];
  /** Centre of the pile and the width of a page lying on it, in layout points. */
  x: number;
  y: number;
  width: number;
  /** A page that is being held up to be read, and so is not on the pile for now. */
  heldUp: number | null;
}

/** Only the top few sheets of the pile can be told apart. */
const VISIBLE = 5;

/** How a sheet landed on the pile: never quite square on the one below. Always the same for a given sheet. */
export function landing(index: number) {
  const turn = Math.sin(index * 12.9898) * 43758.5453;
  const slide = Math.sin(index * 78.233) * 43758.5453;
  return {
    radians: ((turn - Math.floor(turn) - 0.5) * 14 * Math.PI) / 180,
    dx: (slide - Math.floor(slide) - 0.5) * 7,
  };
}

/**
 * The pages taken out of the machine, piled on the desk behind it. They are the typed sheets
 * themselves, small. The pile is part of the machine's own picture, so that a sheet being
 * pulled out passes over it, and the light on the desk falls on it too.
 */
export function PagePile({ pages, x, y, width, heldUp }: Props) {
  const first = Math.max(0, pages.length - VISIBLE);
  const height = width * SHEET_RATIO;

  return (
    <Group>
      {pages.slice(first).map((page, offset) => {
        if (first + offset === heldUp) return null;
        const { radians, dx } = landing(first + offset);
        return (
          <Group key={first + offset} transform={[{ translateX: x + dx }, { translateY: y }, { rotate: radians }]}>
            <Rect x={-width / 2} y={-height / 2} width={width} height={height}>
              <Shadow dx={2} dy={3} blur={4} color="rgba(0, 0, 0, 0.5)" shadowOnly />
            </Rect>
            <Image image={page.image} x={-width / 2} y={-height / 2} width={width} height={height} fit="fill" />
          </Group>
        );
      })}
    </Group>
  );
}
