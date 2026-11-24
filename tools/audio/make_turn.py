"""Make the sound of the letter caps turning on their stems: a soft rub of metal on metal.

Run:  python3 tools/audio/make_turn.py assets/sounds/turn.wav

The typing recording has nothing like it, so this one sound is synthesised: filtered noise,
one short rub per row of keys. Each rub swells as its row gathers speed and stops short when
the row reaches its stop. The timings follow src/engine/keyTurn.ts; keep the two in step.
"""
import math
import random
import struct
import sys
import wave

RATE = 44100
LENGTH_S = 0.46
SWAP_S = 0.440            # SWAP_MS
ROWS = 3                  # TURNING_ROWS
STAGGER = 0.3
TURN_SHARE = 0.78
PEAK = 0.085              # quiet: about -21 dB, well under a keystroke
LOW_CUT_HZ = 1100         # below this it would sound like a thud
HIGH_CUT_HZ = 4200        # above this it would hiss

span = 1 + STAGGER * (ROWS - 1)
random.seed(4)


def one_pole(samples, cutoff_hz):
    """Low-pass filter."""
    keep = math.exp(-2 * math.pi * cutoff_hz / RATE)
    out, value = [], 0.0
    for sample in samples:
        value = (1 - keep) * sample + keep * value
        out.append(value)
    return out


count = int(LENGTH_S * RATE)
noise = [random.uniform(-1, 1) for _ in range(count)]
band = one_pole(one_pole(noise, HIGH_CUT_HZ), HIGH_CUT_HZ)
rumble = one_pole(band, LOW_CUT_HZ)
band = [a - b for a, b in zip(band, rumble)]

# A slow wander in loudness, so the rub catches and slips instead of hissing evenly.
wander = one_pole([random.uniform(-1, 1) for _ in range(count)], 90)
scale = max(abs(value) for value in wander)
grip = [0.7 + 0.3 * value / scale for value in wander]

samples = []
for index in range(count):
    time = index / RATE
    loudness = 0.0
    for row in range(ROWS):
        start = SWAP_S * STAGGER * row / span
        stop = SWAP_S * (TURN_SHARE + STAGGER * row) / span
        if start <= time < stop:
            loudness += ((time - start) / (stop - start)) ** 1.6
        elif time >= stop:
            loudness += math.exp(-(time - stop) / 0.012)
    samples.append(band[index] * grip[index] * loudness)

peak = max(abs(sample) for sample in samples)
with wave.open(sys.argv[1], "wb") as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(RATE)
    out.writeframes(b"".join(struct.pack("<h", int(sample / peak * PEAK * 32767)) for sample in samples))
print("WROTE", sys.argv[1], f"{LENGTH_S:.2f} s")
