"""Stack the cut layers into the portrait phone layout, to check the composition offline.

Run:  blender -b --python tools/blender/compose_portrait.py -- <work_dir> <out.png> [--cell 20] [--pressed r1k9]

Uses the same numbers as the canvas wireframe: the screen is 440 x 956 pt, it shows render
columns 648..1898, and one render pixel is 0.352 pt. The output is in render pixels.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scan_scene  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
work_dir, out_path = args[0], args[1]
cell = int(args[args.index("--cell") + 1]) if "--cell" in args else 20
pressed = args[args.index("--pressed") + 1] if "--pressed" in args else ""

S = 0.352                 # screen points per render pixel
LEFT = 648                # first render column on screen
TOP_PT = 217.33           # screen y of render row 0
SCREEN_W, SCREEN_H = 440, 956

# [position on the machine, key cap shown there]: reads QWERTY, every cap on a real stem.
LAYOUT = [
    ("r0k1", "r0k1"), ("r0k2", "r0k2"), ("r0k3", "r0k3"), ("r0k4", "r0k4"), ("r0k5", "r0k5"),
    ("r0k6", "r0k6"), ("r0k7", "r0k7"), ("r0k8", "r0k8"), ("r0k9", "r0k9"), ("r0k10", "r0k0"),
    ("r1k0", "r1k11"), ("r1k1", "r1k0"), ("r1k2", "r1k1"), ("r1k3", "r1k2"), ("r1k4", "r1k3"),
    ("r1k5", "r1k4"), ("r1k6", "r3k1"), ("r1k7", "r1k6"), ("r1k8", "r1k7"), ("r1k9", "r1k8"),
    ("r1k10", "r1k9"), ("r1k11", "r1k12"),
    ("r2k0", "r2k11"), ("r2k1", "r2k0"), ("r2k2", "r2k1"), ("r2k3", "r2k2"), ("r2k4", "r2k3"),
    ("r2k5", "r2k4"), ("r2k6", "r2k5"), ("r2k7", "r2k6"), ("r2k8", "r2k7"), ("r2k9", "r2k8"),
    ("r2k10", "r2k10"),
    ("r3k1", "r3k0"), ("r3k2", "r1k5"), ("r3k3", "r3k2"), ("r3k4", "r3k3"), ("r3k5", "r3k4"),
    ("r3k6", "r3k5"), ("r3k7", "r3k6"), ("r3k8", "r3k7"), ("r3k9", "r3k8"), ("r3k10", "r3k9"),
    ("r3k11", "r3k12"),
]

with open(os.path.join(work_dir, "layers.json")) as handle:
    data = json.load(handle)
keys = {k["id"]: k for k in data["keys"]}

width = round(SCREEN_W / S)
height = round(SCREEN_H / S)
top = round(TOP_PT / S)
canvas = np.zeros((height, width, 4), dtype=np.float32)
canvas[:, :, :3] = (0x2b / 255, 0x26 / 255, 0x22 / 255)
canvas[:, :, 3] = 1.0
canvas[round(480 / S):, :, :3] = (0x0c / 255, 0x0b / 255, 0x0a / 255)


def paste(image, x, y):
    """Alpha-composite image onto the canvas with its top-left corner at (x, y)."""
    h, w = image.shape[:2]
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + w, width), min(y + h, height)
    if x1 <= x0 or y1 <= y0:
        return
    part = image[y0 - y:y1 - y, x0 - x:x1 - x]
    alpha = part[:, :, 3:4]
    canvas[y0:y1, x0:x1, :3] = part[:, :, :3] * alpha + canvas[y0:y1, x0:x1, :3] * (1 - alpha)


paste(scan_scene.load_png(os.path.join(work_dir, "layers", "body.png")), -LEFT, top)

paper_x_pt = 226 - 34 - (cell + 0.5) * 10.8
carriage_shift = round((paper_x_pt - 22.5) / S)
paste(scan_scene.load_png(os.path.join(work_dir, "layers", "carriage.png")), -LEFT + carriage_shift, top)

paper = np.zeros((round(162 / S), round(400 / S), 4), dtype=np.float32)
paper[:, :, :3] = (0xef / 255, 0xe7 / 255, 0xd2 / 255)
paper[:, :, 3] = 1.0
paste(paper, round(paper_x_pt / S), round(308 / S))

for position, cap in LAYOUT:
    place, source = keys[position], keys[cap]
    sprite = scan_scene.load_png(os.path.join(work_dir, source["sprite"]["file"]))
    x = round(place["px"] - (source["px"] - source["sprite"]["left"])) - LEFT
    y = round(place["py"] - (source["py"] - source["sprite"]["top"])) + top
    if position == pressed:
        y += round(4 / S)
        sprite[:, :, :3] *= 0.82
    paste(sprite, x, y)

bar = data["space_bar"]
paste(scan_scene.load_png(os.path.join(work_dir, bar["file"])), bar["left"] - LEFT, bar["top"] + top)

scan_scene.save_png(out_path, canvas)
print("COMPOSED", width, "x", height, "->", out_path)
