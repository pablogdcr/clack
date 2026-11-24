import { Group, Image, Shadow } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { BarMotion } from '../engine/useTypewriter';
import { layout } from '../layout';
import { carriageLeft } from './Carriage';
import { RibbonStrands } from './RibbonStrands';
import { StrikingBar } from './StrikingBar';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  paperLeft: SharedValue<number>;
  /** The typebars that can be in motion at once. */
  bars: BarMotion[];
  rise: SharedValue<number>;
  /** 0 while the black half of the ribbon is in use, 1 for the red half. */
  redInk: SharedValue<number>;
}

/** The ribbon is up well before the bar arrives: it has finished rising at this point of the swing. */
const RIBBON_LEAD = 0.6;

/**
 * Everything that stands in front of the sheet: the paper fingers at its edges (they ride on
 * the carriage), the ribbon and its two runs out to the spools, the typebars in motion, and
 * the type guide they strike through.
 */
export function PrintPoint({ images, paperLeft, bars, rise, redInk }: Props) {
  const { fingers, carriage, guide, ribbon, printX } = layout;

  const fingersTransform = useDerivedValue(() => [
    { translateX: carriageLeft(paperLeft.value) },
    { translateY: -rise.value },
  ]);

  // The ribbon is lifted out of the fork over the print point for a strike, stays up while a
  // bar is held there, and drops back so that the line just typed can be read.
  const ribbonY = useDerivedValue(() => {
    let highest = 0;
    for (const bar of bars) highest = Math.max(highest, bar.swing.value);
    const rise = Math.min(1, highest / RIBBON_LEAD);
    // For red the ribbon is lifted further, so that the type meets its lower, red half.
    const top = ribbon.strikeY + (ribbon.strikeYRed - ribbon.strikeY) * redInk.value;
    return ribbon.restY + (top - ribbon.restY) * (1 - (1 - rise) * (1 - rise));
  });

  return (
    <Group>
      <Group transform={fingersTransform}>
        <Image
          image={images.fingers}
          x={fingers.x}
          y={carriage.top + fingers.y}
          width={fingers.width}
          height={fingers.height}
          fit="fill"
        >
          <Shadow dx={1} dy={2.5} blur={2.5} color="rgba(0, 0, 0, 0.45)" />
        </Image>
      </Group>
      <Image
        image={images.ribbon}
        x={printX - ribbon.width / 2}
        y={ribbonY}
        width={ribbon.width}
        height={ribbon.height}
        fit="fill"
      >
        <Shadow dx={1} dy={2} blur={2} color="rgba(0, 0, 0, 0.4)" />
      </Image>
      {/* drawn over the band's ends, so that runs and band read as one strip */}
      <RibbonStrands ribbonY={ribbonY} />
      {bars.map((bar, index) => (
        <StrikingBar key={index} images={images} bar={bar} />
      ))}
      <Image image={images.guide} x={guide.x} y={guide.y} width={guide.width} height={guide.height} fit="fill">
        <Shadow dx={1} dy={2.5} blur={2.5} color="rgba(0, 0, 0, 0.5)" />
      </Image>
    </Group>
  );
}
