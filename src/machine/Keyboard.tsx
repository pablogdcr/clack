import { Group } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { keys } from '../layout';
import { InkKnobs } from './InkKnobs';
import { KeyCaps } from './KeyCaps';
import type { BankKey } from './KeyShadows';
import { KeyRow } from './KeyRow';
import { KeyStems } from './KeyStems';
import { SpaceBar } from './SpaceBar';
import { SunkStems } from './SunkStems';
import type { MachineImages } from './useMachineImages';

interface Props {
  images: MachineImages;
  press: SharedValue<number[]>;
  /** Whether the figures are in use, and how far the change to that set has got (rests at 1). */
  figures: SharedValue<boolean>;
  swap: SharedValue<number>;
  /** 0 while the black half of the ribbon is in use, 1 for the red half. */
  redInk: SharedValue<number>;
}

const allKeys: BankKey[] = keys.map((key, index) => ({ key, index }));
/** Function keys have one face and never turn. */
const functionKeys = allKeys.filter(({ key }) => key.fig === null);
/** Letter keys, row by row: the caps of a row spin together. */
const letterRows = [0, 1, 2].map((row) => allKeys.filter(({ key }) => key.fig !== null && key.row === row));

/**
 * The keys. Changing between letters and figures is mechanical: every letter cap spins half
 * a turn on its stem, one row after the other. A cap never changes what is printed on it.
 */
export function Keyboard({ images, press, figures, swap, redInk }: Props) {
  return (
    <Group>
      <KeyStems images={images} bank={allKeys} />
      <SunkStems bank={allKeys} press={press} />
      <InkKnobs images={images} redInk={redInk} />
      <KeyCaps images={images} bank={functionKeys} press={press} />
      {letterRows.map((bank, row) => (
        <KeyRow key={row} images={images} bank={bank} order={row} press={press} figures={figures} swap={swap} />
      ))}
      <SpaceBar image={images.spaceBar} press={press} />
    </Group>
  );
}
