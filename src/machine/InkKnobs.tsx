import { Circle, Group, Image } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { layout } from '../layout';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  /** 0 while the black half of the ribbon is in use, 1 for the red half. */
  redInk: SharedValue<number>;
}

/** How far a knob sinks, and how much smaller and darker it gets, while it is the one pushed in. */
const SINK = 2;
const SHRINK = 0.08;
const SHADE = 0.3;

interface KnobProps {
  image: MachineImages['inkKnobs'][number];
  knob: (typeof layout.inkKnobs)[number];
  /** How far in this knob is, 0 to 1. */
  pushed: SharedValue<number>;
}

function Knob({ image, knob, pushed }: KnobProps) {
  const half = knob.size / 2;
  const transform = useDerivedValue(() => [
    { translateX: knob.x },
    { translateY: knob.y + SINK * pushed.value },
    { scale: 1 - SHRINK * pushed.value },
  ]);
  const shade = useDerivedValue(() => SHADE * pushed.value);
  // The shadow under the knob tightens as it goes in.
  const shadow = useDerivedValue(() => [{ translateX: knob.x + 1.5 }, { translateY: knob.y + 4 - 1.5 * pushed.value }]);

  return (
    <Group>
      <Group transform={shadow}>
        <Circle cx={0} cy={0} r={half} color="rgba(0, 0, 0, 0.5)" />
      </Group>
      <Group transform={transform}>
        <Image image={image} x={-half} y={-half} width={knob.size} height={knob.size} fit="fill" />
        <Circle cx={0} cy={0} r={half - 0.5} color="black" opacity={shade} />
      </Group>
    </Group>
  );
}

/**
 * The ribbon selector, as on the machine: a black knob and a red knob. Pushing one lets the
 * other out, and chooses which half of the ribbon the type strikes through.
 */
export function InkKnobs({ images, redInk }: Props) {
  const blackIn = useDerivedValue(() => 1 - redInk.value);
  const [black, red] = layout.inkKnobs;

  return (
    <Group>
      <Knob image={images.inkKnobs[0]} knob={black} pushed={blackIn} />
      <Knob image={images.inkKnobs[1]} knob={red} pushed={redInk} />
    </Group>
  );
}
