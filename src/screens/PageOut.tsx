import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { PageImage } from '../ink/pageImage';
import { landing } from '../machine/PagePile';

interface Props {
  /** Every page typed so far, oldest first. */
  pages: PageImage[];
  /** The page to show first. */
  startAt: number;
  /** Where that page comes from: just pulled out of the machine, or picked up from the pile. */
  from: 'machine' | 'pile';
  /** Where the pile of pages sits on screen, and how many screen points make a layout point. */
  pile: { x: number; y: number; width: number; scale: number };
  /** Tells which page is held up, so that it is not also shown on the pile; -1 once it is back on it. */
  onHeldUp: (index: number) => void;
  onClose: () => void;
  /** Changes when the page should be put away without being touched. */
  closeSignal: number;
}

/** Room left on each side of the page. */
const SIDE = 26;

/**
 * Typed pages held up to be read: the one just pulled out of the machine, or the pile picked
 * up from the desk. The pages lie side by side and slide under the finger, a whole sheet at a
 * time. Tapping anywhere off the page puts it back on the pile.
 */
export function PageOut({ pages, startAt, from, pile, onHeldUp, onClose, closeSignal }: Props) {
  const window = useWindowDimensions();
  const [shown, setShown] = useState(startAt);
  const width = window.width - 2 * SIDE;
  const height = Math.min((width * pages[startAt].height) / pages[startAt].width, window.height * 0.68);

  // 0: away (above the screen, or on the pile). 1: held up.
  const held = useSharedValue(0);
  // A page goes back to the pile, and one picked up from the pile comes from it.
  const viaPile = useSharedValue(from === 'pile');
  useEffect(() => {
    held.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [held]);

  // The page lands on the pile exactly as it lies there. The pile takes it back first, and
  // this view goes a moment later, so that the page is never missing for a frame.
  const landed = useCallback(() => {
    onHeldUp(-1);
    setTimeout(onClose, 80);
  }, [onClose, onHeldUp]);

  const close = useCallback(() => {
    viaPile.value = true;
    held.value = withTiming(0, { duration: 300, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) scheduleOnRN(landed);
    });
  }, [held, landed, viaPile]);

  // How the page in view lies on the pile: where it comes from, and where it goes back to.
  const lying = landing(shown);
  const lyingDegrees = (lying.radians * 180) / Math.PI;

  const signalAtOpen = useRef(closeSignal);
  useEffect(() => {
    if (closeSignal !== signalAtOpen.current) close();
  }, [close, closeSignal]);

  const backdrop = useAnimatedStyle(() => ({ opacity: held.value }));
  const sheet = useAnimatedStyle(() => {
    const away = 1 - held.value;
    if (!viaPile.value) {
      // It flew out through the top of the screen: it comes back down from there.
      return { transform: [{ translateY: -away * window.height }, { rotate: `${-1.4 - 2.6 * away}deg` }] };
    }
    return {
      transform: [
        { translateX: away * (pile.x + lying.dx * pile.scale - window.width / 2) },
        { translateY: away * (pile.y - window.height / 2) },
        { scale: 1 - away * (1 - pile.width / width) },
        { rotate: `${-1.4 + (lyingDegrees + 1.4) * away}deg` },
      ],
    };
  });

  const settled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.min(pages.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / window.width)));
      setShown(index);
      onHeldUp(index);
    },
    [onHeldUp, pages.length, window.width],
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[styles.backdrop, backdrop]} />
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: startAt * window.width, y: 0 }}
        onMomentumScrollEnd={settled}
        style={StyleSheet.absoluteFill}
      >
        {pages.map((page, index) => (
          <Pressable
            key={index}
            onPress={close}
            accessibilityLabel="Put the page away"
            style={[styles.slot, { width: window.width, height: window.height }]}
          >
            {/* only the page in view travels to and from the pile */}
            <Animated.View style={[styles.sheet, index === shown ? sheet : styles.resting]}>
              <Pressable accessibilityLabel={`Page ${index + 1}`}>
                <Image source={{ uri: page.uri }} style={{ width, height }} resizeMode="cover" />
              </Pressable>
            </Animated.View>
          </Pressable>
        ))}
      </ScrollView>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.actions, { top: window.height / 2 + height / 2 + 28 }, backdrop]}
      >
        {pages.length > 1 ? (
          <Text style={styles.count}>
            {shown + 1} / {pages.length}
          </Text>
        ) : null}
        <Pressable onPress={() => Share.share({ url: pages[shown].uri })} hitSlop={14}>
          <Text style={styles.action}>Share</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(8, 6, 4, 0.72)',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: {
      width: 6,
      height: 12,
    },
  },
  resting: {
    transform: [{ rotate: '-1.4deg' }],
  },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 40,
  },
  action: {
    fontFamily: 'CourierPrime',
    fontSize: 19,
    letterSpacing: 0.5,
    color: '#efe7d2',
  },
  count: {
    fontFamily: 'CourierPrime',
    fontSize: 15,
    color: 'rgba(239, 231, 210, 0.55)',
  },
});
