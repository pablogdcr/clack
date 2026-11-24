import { useImage, type SkImage } from '@shopify/react-native-skia';

export interface MachineImages {
  band: SkImage;
  well: SkImage;
  frame: SkImage;
  stem: SkImage;
  caps: SkImage;
  spaceBar: SkImage;
  carriage: SkImage;
  fingers: SkImage;
  guide: SkImage;
  ribbon: SkImage;
  /** One typebar cut from the basket, and the shadow it casts. */
  typebar: SkImage;
  typebarShadow: SkImage;
  /** The ribbon selector's knobs: black, then red. */
  inkKnobs: SkImage[];
  /** Per spool: the disc that turns, and the still part of the machine that reaches over it. */
  spools: { disc: SkImage; cover: SkImage }[];
}

/** Every part of the machine, or null until all of them are decoded. */
export function useMachineImages(): MachineImages | null {
  const band = useImage(require('../../assets/machine/band.png'));
  const well = useImage(require('../../assets/machine/well.png'));
  const frame = useImage(require('../../assets/machine/frame.png'));
  const stem = useImage(require('../../assets/machine/stem.png'));
  const caps = useImage(require('../../assets/machine/caps.png'));
  const spaceBar = useImage(require('../../assets/machine/spacebar.png'));
  const carriage = useImage(require('../../assets/machine/carriage.png'));
  const fingers = useImage(require('../../assets/machine/fingers.png'));
  const guide = useImage(require('../../assets/machine/guide.png'));
  const ribbon = useImage(require('../../assets/machine/ribbon.png'));
  const typebar = useImage(require('../../assets/machine/typebar.png'));
  const typebarShadow = useImage(require('../../assets/machine/typebar-shadow.png'));
  const inkBlack = useImage(require('../../assets/machine/ink-black.png'));
  const inkRed = useImage(require('../../assets/machine/ink-red.png'));
  const spoolLeft = useImage(require('../../assets/machine/spool-left.png'));
  const spoolLeftCover = useImage(require('../../assets/machine/spool-left-cover.png'));
  const spoolRight = useImage(require('../../assets/machine/spool-right.png'));
  const spoolRightCover = useImage(require('../../assets/machine/spool-right-cover.png'));

  if (!band || !well || !frame || !stem || !caps || !spaceBar || !carriage || !fingers || !guide || !ribbon || !typebar) {
    return null;
  }
  if (!spoolLeft || !spoolLeftCover || !spoolRight || !spoolRightCover) return null;
  if (!typebarShadow || !inkBlack || !inkRed) return null;
  // same order as layout.spools: left, then right
  const spools = [
    { disc: spoolLeft, cover: spoolLeftCover },
    { disc: spoolRight, cover: spoolRightCover },
  ];
  return { band, well, frame, stem, caps, spaceBar, carriage, fingers, guide, ribbon, typebar, typebarShadow, inkKnobs: [inkBlack, inkRed], spools };
}
