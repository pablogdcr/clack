"""List every sound event in a mono 16-bit WAV: when it starts, how loud, how bright, how long.

Run with a Python that has numpy (Blender's bundled one works):
    python tools/audio/find_onsets.py <file.wav>
"""
import sys
import wave

import numpy as np

path = sys.argv[1]
with wave.open(path) as handle:
    rate = handle.getframerate()
    samples = np.frombuffer(handle.readframes(handle.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

# Loudness envelope: peak of |signal| over 2 ms hops.
hop = int(rate * 0.002)
frames = len(samples) // hop
envelope = np.abs(samples[:frames * hop]).reshape(frames, hop).max(axis=1)
floor = float(np.median(envelope))
threshold = max(floor * 6, 0.02)

# An event starts when the envelope jumps over the threshold after at least 50 ms of quiet.
onsets = []
quiet_for = 1000
for index, value in enumerate(envelope):
    if value > threshold:
        if quiet_for >= 25:
            onsets.append(index)
        quiet_for = 0
    else:
        quiet_for += 1

print(f"rate {rate}  length {len(samples) / rate:.2f}s  noise floor {floor:.4f}  threshold {threshold:.4f}  events {len(onsets)}")
print(" #    start    gap_after   peak   length   bright")
for number, onset in enumerate(onsets):
    start = onset * hop
    following = onsets[number + 1] * hop if number + 1 < len(onsets) else len(samples)
    gap = (following - start) / rate
    window = samples[start:min(following, start + int(rate * 1.5))]
    peak = float(np.abs(window).max())
    # Length: until the envelope stays under 8% of the peak.
    local = envelope[onset:onset + len(window) // hop]
    loud = np.nonzero(local > peak * 0.08)[0]
    length = (int(loud.max()) + 1) * hop / rate if loud.size else 0.0
    # Brightness: share of the energy above 4 kHz in the first 60 ms.
    head = window[:int(rate * 0.06)]
    spectrum = np.abs(np.fft.rfft(head * np.hanning(len(head)))) ** 2
    freqs = np.fft.rfftfreq(len(head), 1 / rate)
    bright = float(spectrum[freqs > 4000].sum() / max(spectrum.sum(), 1e-9))
    print(f"{number:3d}  {start / rate:7.3f}  {gap:8.3f}  {peak:6.3f}  {length:6.3f}  {bright:6.2f}")
