import { useCallback, useEffect, useRef } from 'react';
import { AudioContext, type AudioBuffer } from 'react-native-audio-api';

export type SoundName = 'hit' | 'fall' | 'space' | 'back' | 'shift' | 'turn' | 'pull' | 'return' | 'bell';

/**
 * Cut from one recording of an Erika 5 (see tools/audio/cut_sounds.sh). A keystroke is two
 * sounds: `hit`, the type striking the paper, and `fall`, the typebar dropping back when the
 * key is let go. Several takes of each and of the space bar, so two in a row never sound identical. `turn` is the one sound
 * that is synthesised (tools/audio/make_turn.py).
 */
const SOURCES: Record<SoundName, number[]> = {
  hit: [
    require('../../assets/sounds/hit-1.wav'),
    require('../../assets/sounds/hit-2.wav'),
    require('../../assets/sounds/hit-3.wav'),
    require('../../assets/sounds/hit-4.wav'),
    require('../../assets/sounds/hit-5.wav'),
    require('../../assets/sounds/hit-6.wav'),
  ],
  fall: [
    require('../../assets/sounds/fall-1.wav'),
    require('../../assets/sounds/fall-2.wav'),
    require('../../assets/sounds/fall-3.wav'),
    require('../../assets/sounds/fall-4.wav'),
    require('../../assets/sounds/fall-5.wav'),
    require('../../assets/sounds/fall-6.wav'),
  ],
  space: [
    require('../../assets/sounds/space-1.wav'),
    require('../../assets/sounds/space-2.wav'),
    require('../../assets/sounds/space-3.wav'),
  ],
  back: [require('../../assets/sounds/back.wav')],
  shift: [require('../../assets/sounds/shift.wav')],
  turn: [require('../../assets/sounds/turn.wav')],
  pull: [require('../../assets/sounds/pull.wav')],
  return: [require('../../assets/sounds/return.wav')],
  bell: [require('../../assets/sounds/bell.wav')],
};

/** How much each play may drift in pitch and loudness. */
const VARIATION: Record<SoundName, { pitch: number; gain: number }> = {
  hit: { pitch: 0.035, gain: 0.2 },
  fall: { pitch: 0.035, gain: 0.2 },
  space: { pitch: 0.03, gain: 0.15 },
  back: { pitch: 0.03, gain: 0.15 },
  shift: { pitch: 0.02, gain: 0.1 },
  turn: { pitch: 0.03, gain: 0.1 },
  pull: { pitch: 0.03, gain: 0.1 },
  return: { pitch: 0, gain: 0 },
  bell: { pitch: 0, gain: 0 },
};

/** In return.wav the ratchet runs until the carriage lands with a thump at this time. */
export const RETURN_LANDS_AT = 0.975;

export type PlaySound = (name: SoundName, startAt?: number) => void;

/**
 * The machine's sounds, decoded once and kept in memory. Every play gets its own source
 * node, so fast typing overlaps cleanly without cutting the previous strike short.
 */
export function useSounds(): PlaySound {
  const context = useRef<AudioContext | null>(null);
  const buffers = useRef<Partial<Record<SoundName, AudioBuffer[]>>>({});
  const lastTake = useRef<Partial<Record<SoundName, number>>>({});

  useEffect(() => {
    const audio = new AudioContext();
    context.current = audio;
    let cancelled = false;

    (async () => {
      for (const name of Object.keys(SOURCES) as SoundName[]) {
        const decoded = await Promise.all(SOURCES[name].map((source) => audio.decodeAudioData(source)));
        if (cancelled) return;
        buffers.current[name] = decoded;
      }
    })().catch((error) => console.warn('Could not load the typewriter sounds', error));

    return () => {
      cancelled = true;
      context.current = null;
      audio.close();
    };
  }, []);

  /** `startAt` skips into the recording, in seconds. */
  return useCallback((name: SoundName, startAt = 0) => {
    const audio = context.current;
    const takes = buffers.current[name];
    if (!audio || !takes || takes.length === 0) return;

    // never the same take twice in a row
    let take = Math.floor(Math.random() * takes.length);
    if (takes.length > 1 && take === lastTake.current[name]) take = (take + 1) % takes.length;
    lastTake.current[name] = take;

    const { pitch, gain } = VARIATION[name];
    const source = audio.createBufferSource();
    source.buffer = takes[take];
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * pitch;

    const level = 1 - Math.random() * gain;
    const volume = audio.createGain();
    if (startAt > 0) {
      // starting mid-recording would click, so fade in over a few milliseconds
      volume.gain.setValueAtTime(0, audio.currentTime);
      volume.gain.linearRampToValueAtTime(level, audio.currentTime + 0.012);
    } else {
      volume.gain.value = level;
    }

    source.connect(volume);
    volume.connect(audio.destination);
    source.start(0, startAt);
  }, []);
}
