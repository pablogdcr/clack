import { Canvas, Fill, Group, Image, useFont, useImage } from '@shopify/react-native-skia';
import { useFonts } from 'expo-font';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useDemo } from '../engine/useDemo';
import { useIntro } from '../engine/useIntro';
import { useKeyboardGesture } from '../engine/useKeyboardGesture';
import { useTypewriter } from '../engine/useTypewriter';
import { makePageImage, type PageImage } from '../ink/pageImage';
import type { Stamp } from '../ink/stamps';
import { layout, SHEET_RATIO } from '../layout';
import { Carriage } from '../machine/Carriage';
import { CastShadow } from '../machine/CastShadow';
import { Desk } from '../machine/Desk';
import { Keyboard } from '../machine/Keyboard';
import { PagePile } from '../machine/PagePile';
import { Paper } from '../machine/Paper';
import { PrintPoint } from '../machine/PrintPoint';
import { Spools } from '../machine/Spools';
import { useMachineImages } from '../machine/useMachineImages';
import { Vignette } from '../machine/Vignette';
import { Well } from '../machine/Well';
import { WindowLight } from '../machine/WindowLight';
import { useSounds } from '../sound/useSounds';
import { PageOut } from './PageOut';

const DESK_COLOR = '#2b2622';
const INK_FONT = require('@expo-google-fonts/courier-prime/400Regular/CourierPrime_400Regular.ttf');
const INK_FONT_SIZE = 18;
/** Where the pile of typed pages lies on the desk, in layout points: its centre, and a page's width. */
const PILE = { x: layout.screen.width - 62, y: 128, width: 70 };
/** Two taps on the demo corner within this time start the demo. */
const DOUBLE_TAP_MS = 400;
/** Time a sheet takes to come out of the machine and leave the screen. */
const SHEET_GONE_MS = 540;

/**
 * The whole machine on one canvas, drawn back to front: desk, key well, mechanism band,
 * keyboard, carriage, paper, then what stands in front of the paper.
 */
export function TypewriterScreen() {
  const { width, height } = useWindowDimensions();
  // The layout is designed for a 440 pt wide screen and sits against the bottom edge.
  const scale = width / layout.screen.width;
  const offsetY = height - layout.screen.height * scale;

  const images = useMachineImages();
  const font = useFont(INK_FONT, INK_FONT_SIZE);
  const playSound = useSounds();
  const grain = useImage(require('../../assets/paper/grain.png'));
  const [fontsLoaded] = useFonts({ CourierPrime: INK_FONT });

  // A sheet pulled out of the machine is photographed whole, held up to be read, then put on
  // the pile of typed pages behind the machine.
  const [pages, setPages] = useState<PageImage[]>([]);
  const [reading, setReading] = useState<{ startAt: number; fresh: boolean } | null>(null);
  // The page in view while reading, once the reader has moved from the first; -1 when the page
  // has been laid back on the pile.
  const [turnedTo, setTurnedTo] = useState<number | null>(null);
  const heldUp = reading === null ? null : (turnedTo ?? reading.startAt);
  const sheetOut = useCallback(
    (stamps: Stamp[]) => {
      if (!font || !grain) return;
      // The picture takes a moment to make: it is made while the sheet is still on its way
      // out, and shown once the sheet has left the screen.
      const leftAt = Date.now();
      setTimeout(() => {
        const page = makePageImage(stamps, font, grain);
        if (!page) return;
        setTimeout(
          () =>
            setPages((before) => {
              setReading({ startAt: before.length, fresh: true });
              return [...before, page];
            }),
          Math.max(0, SHEET_GONE_MS - (Date.now() - leftAt)),
        );
      }, 30);
    },
    [font, grain],
  );
  const typewriter = useTypewriter(playSound, sheetOut);
  const { newSheet } = typewriter;
  const putAway = useCallback(() => {
    // Putting a page just typed onto the pile leaves the machine empty: a fresh sheet goes in.
    if (reading?.fresh) newSheet();
    setReading(null);
    setTurnedTo(null);
  }, [newSheet, reading]);
  // The same place in screen points, for what is laid over the canvas.
  const pile = { x: PILE.x * scale, y: offsetY + PILE.y * scale, width: PILE.width * scale, scale };
  // The machine types its opening line by itself; the first real touch takes over.
  const stopIntro = useIntro(typewriter, images !== null && font !== null);

  // The demo: a double tap on the empty corner of the desk plays every feature in turn.
  const [closeSignal, setCloseSignal] = useState(0);
  const closePage = useCallback(() => setCloseSignal((count) => count + 1), []);
  const demo = useDemo(typewriter, closePage);
  const lastCornerTap = useRef(0);
  const cornerTapped = useCallback(() => {
    const now = Date.now();
    if (now - lastCornerTap.current < DOUBLE_TAP_MS) {
      stopIntro();
      demo.start();
    }
    lastCornerTap.current = now;
  }, [demo, stopIntro]);
  const stopScripts = useCallback(() => {
    stopIntro();
    demo.stop();
  }, [demo, stopIntro]);
  const gesture = useKeyboardGesture({
    scale,
    offsetY,
    keyDown: typewriter.keyDown,
    keyUp: typewriter.keyUp,
    onTouch: stopScripts,
    carriage: typewriter.carriage,
    sheet: typewriter.sheet,
    selectInk: typewriter.selectInk,
    enabled: reading === null,
  });

  const { band, frame } = layout;

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.root}>
        <Canvas style={styles.canvas}>
          <Fill color={DESK_COLOR} />
          {images && font ? (
            <Group transform={[{ translateY: offsetY }, { scale }]}>
              <Desk />
              {/* behind everything else: a sheet pulled out of the machine passes over the pile */}
              <PagePile pages={pages} x={PILE.x} y={PILE.y} width={PILE.width} heldUp={heldUp} />
              <Well image={images.well} />
              <Image image={images.band} x={band.x} y={band.y} width={band.width} height={band.height} fit="fill" />
              <Spools images={images} turn={typewriter.spoolTurn} />
              {/* the front bar rests on the desk, the carriage overhangs the mechanism */}
              <CastShadow y={frame.barBottom - 1} height={16} strength={0.75} />
              <Image image={images.frame} x={frame.x} y={frame.y} width={frame.width} height={frame.height} fit="fill" />
              <Keyboard
                images={images}
                press={typewriter.press}
                figures={typewriter.figures}
                swap={typewriter.swap}
                redInk={typewriter.redInk}
              />
              <CastShadow y={band.y} height={34} strength={0.6} />
              <Carriage image={images.carriage} paperLeft={typewriter.paperLeft} rise={typewriter.rise} />
              <Paper
                font={font}
                stamps={typewriter.stamps}
                paperLeft={typewriter.paperLeft}
                lineIndex={typewriter.lineIndex}
                feed={typewriter.feed}
                rise={typewriter.rise}
                pull={typewriter.pull}
                eject={typewriter.eject}
                sway={typewriter.sway}
                grip={typewriter.grip}
                grain={grain}
              />
              <PrintPoint
                images={images}
                paperLeft={typewriter.paperLeft}
                bars={typewriter.bars}
                rise={typewriter.rise}
                redInk={typewriter.redInk}
              />
              <WindowLight />
              <Vignette />
            </Group>
          ) : null}
        </Canvas>
        <Pressable
          onPress={cornerTapped}
          accessibilityLabel="Demo"
          style={[styles.demoCorner, { top: offsetY + 60 * scale, width: 110 * scale, height: 130 * scale }]}
        />
        {pages.length > 0 ? (
          <Pressable
            onPress={() => setReading({ startAt: pages.length - 1, fresh: false })}
            hitSlop={16}
            accessibilityLabel={`Typed pages, ${pages.length}`}
            style={[
              styles.pileTouch,
              {
                left: pile.x - pile.width / 2,
                top: pile.y - (pile.width * SHEET_RATIO) / 2,
                width: pile.width,
                height: pile.width * SHEET_RATIO,
              },
            ]}
          />
        ) : null}
        {reading && fontsLoaded && pages[reading.startAt] ? (
          <PageOut
            pages={pages}
            startAt={reading.startAt}
            from={reading.fresh ? 'machine' : 'pile'}
            pile={pile}
            onHeldUp={setTurnedTo}
            onClose={putAway}
            closeSignal={closeSignal}
          />
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DESK_COLOR,
  },
  canvas: {
    flex: 1,
  },
  demoCorner: {
    position: 'absolute',
    left: 0,
  },
  pileTouch: {
    position: 'absolute',
  },
});
