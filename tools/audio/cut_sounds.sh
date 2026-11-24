#!/bin/sh
# Cut the app's sounds out of the Erika 5 typing recording.
#
#   tools/audio/cut_sounds.sh <typing.ogg> <out_dir>
#
# Source: "WWS Typewriter.ogg" by Work With Sounds / Konrad Gutkowski, CC BY 4.0
# https://commons.wikimedia.org/wiki/File:WWS_Typewriter.ogg
#
# The start times come from tools/audio/find_onsets.py. In this recording every keystroke is a
# loud, bright strike followed about 160 ms later by the quieter clack of the typebar falling
# back; the space bar is a pair of dull thumps; the bell rings at 18.45 s and the carriage is
# returned at 20.59 s, landing with a thump at 21.56 s.
set -e

SOURCE="$1"
OUT="$2"
mkdir -p "$OUT"

# cut <name> <start s> <length s> <gain> <fade-out s>
cut() {
  fade_start=$(printf '%.3f' "$(echo "$3 - $5" | bc -l)")
  ffmpeg -v error -y -ss "$2" -t "$3" -i "$SOURCE" -ac 1 -ar 44100 -c:a pcm_s16le \
    -af "afade=t=in:d=0.002,afade=t=out:st=${fade_start}:d=$5,volume=$4" "$OUT/$1.wav"
}

# Keystrokes: six that had room to ring out before the next one. Each is cut in two at the
# quiet moment between its two sounds, so the app can play them apart: "hit" is the type
# striking the paper, "fall" is the typebar dropping back, which happens when the key is let go.
# The fall is cut from the instant its clack begins, with no silence before it, so the app
# decides alone how long after the strike it is heard.
# keystroke <n> <start s> <length s> <end of hit s> <start of fall s> <gain>
keystroke() {
  cut "hit-$1" "$2" "$4" "$6" 0.025
  fall_start=$(printf '%.3f' "$(echo "$2 + $5" | bc -l)")
  fall_length=$(printf '%.3f' "$(echo "$3 - $5" | bc -l)")
  cut "fall-$1" "$fall_start" "$fall_length" "$6" 0.06
}
keystroke 1  4.446 0.430 0.150 0.171 1.25
keystroke 2  8.237 0.560 0.155 0.185 1.30
keystroke 3  8.800 0.500 0.140 0.178 1.40
keystroke 4 12.723 0.530 0.150 0.183 1.45
keystroke 5 14.030 0.640 0.135 0.150 1.25
keystroke 6 17.261 0.650 0.145 0.177 1.50

# Space bar: soft in the recording, so lifted to stay audible on a phone speaker.
cut space-1   2.387 0.540 3.2 0.06
cut space-2  11.983 0.400 3.2 0.05
cut space-3  15.908 0.510 3.2 0.06

# Backspace: the clack of a typebar falling back.
cut back      4.610 0.265 1.3 0.05

# Shift: the thump of the carriage reaching its stop.
cut shift    21.548 0.250 2.6 0.06

# Bell, with its ring.
cut bell     18.442 1.900 3.0 0.50

# Carriage return: 0.97 s of ratchet, then the thump as it lands.
cut return   20.580 1.230 3.0 0.10

# A sheet pulled out, or fed in: the platen's ratchet alone, without the carriage's thump.
cut pull     20.640 0.780 3.0 0.12

# The sound of the keys turning over is not in the recording: see tools/audio/make_turn.py.

ls -la "$OUT"
