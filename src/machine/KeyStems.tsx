import { Group, Image } from '@shopify/react-native-skia';
import { layout } from '../layout';
import type { BankKey } from './KeyShadows';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  bank: BankKey[];
}

/** One real stem per key, hanging from the comb at the top of the well down to its cap. */
export function KeyStems({ images, bank }: Props) {
  const stemTop = layout.stem.top;
  return (
    <Group>
      {bank.map(({ key }) => (
        <Image
          key={key.name}
          image={images.stem}
          x={key.stemX - layout.stem.width / 2}
          y={stemTop}
          width={layout.stem.width}
          height={key.y - stemTop}
          fit="fill"
        />
      ))}
    </Group>
  );
}
