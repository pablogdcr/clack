"""Flatten the phone-shaped typewriter into one image, to check the composition offline.

The layout itself lives in phone_layout.py; the app draws the same parts live.

Run:  blender -b --python tools/blender/compose_phone.py -- <work_dir> <out.png>
          [--layer under|over|all] [--cell 20] [--pressed O] [--paper-lines 4]

The output is 3 px per screen point. The paper sits between two images:
  under  desk, mechanism band, keyboard, carriage
  over   what stands in front of the paper: the paper fingers at its edges (on the carriage),
         the ribbon and type guide at the print point, and the typebar while a key is down
  all    under + a blank paper stand-in + over
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phone_layout as L  # noqa: E402
import scan_scene  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
work_dir, out_path = args[0], args[1]


def option(name, default):
    return args[args.index(name) + 1] if name in args else default


layer = option("--layer", "all")
cell = int(option("--cell", 0))
pressed = option("--pressed", "")
paper_lines = int(option("--paper-lines", 1))

PT = 3

with open(os.path.join(work_dir, "layers.json")) as handle:
    data = json.load(handle)
keys = {k["id"]: k for k in data["keys"]}

_cache = {}


def load(relative):
    if relative not in _cache:
        _cache[relative] = scan_scene.load_png(os.path.join(work_dir, relative))
    return _cache[relative]


# The canvas holds premultiplied RGBA, so the "over" layer can stay transparent.
canvas = np.zeros((L.SCREEN_H * PT, L.SCREEN_W * PT, 4), dtype=np.float32)


def paste(premultiplied, x_pt, y_pt, darken=1.0):
    """Composite a premultiplied RGBA image with its top-left corner at (x_pt, y_pt)."""
    x, y = int(round(x_pt * PT)), int(round(y_pt * PT))
    h, w = premultiplied.shape[:2]
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + w, canvas.shape[1]), min(y + h, canvas.shape[0])
    if x1 <= x0 or y1 <= y0:
        return
    part = premultiplied[y0 - y:y1 - y, x0 - x:x1 - x].copy()
    part[:, :, :3] *= darken
    canvas[y0:y1, x0:x1] = part + canvas[y0:y1, x0:x1] * (1 - part[:, :, 3:4])


def place(image, left_pt, top_pt, width_pt, height_pt, darken=1.0):
    paste(L.resize(image, width_pt * PT, height_pt * PT), left_pt, top_pt, darken)


def fill(left_pt, top_pt, width_pt, height_pt, colour):
    block = np.zeros((int(round(height_pt * PT)), int(round(width_pt * PT)), 4), dtype=np.float32)
    block[:, :] = (*colour, 1.0)
    paste(block, left_pt, top_pt)


def shadow(cx_pt, cy_pt, radius_pt, strength):
    """Soft round shadow under a cap."""
    reach = int((radius_pt + 8) * PT)
    yy, xx = np.mgrid[-reach:reach + 1, -reach:reach + 1].astype(np.float32)
    distance = np.hypot(xx, yy) / PT
    image = np.zeros((2 * reach + 1, 2 * reach + 1, 4), dtype=np.float32)
    image[:, :, 3] = strength * np.clip((radius_pt + 5 - distance) / 7, 0, 1) ** 1.5
    paste(image, cx_pt - reach / PT, cy_pt - reach / PT)


def bar(strip, base_pt, tip_pt, width_pt):
    """Draw a strip (its top is the tip) as a straight bar between two points."""
    bx, by = base_pt[0] * PT, base_pt[1] * PT
    tx, ty = tip_pt[0] * PT, tip_pt[1] * PT
    length = math.hypot(tx - bx, ty - by)
    ux, uy = (tx - bx) / length, (ty - by) / length
    half = width_pt * PT / 2
    x0, x1 = int(min(bx, tx) - half - 2), int(max(bx, tx) + half + 2)
    y0, y1 = int(min(by, ty) - half - 2), int(max(by, ty) + half + 2)
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    along = (xx - bx) * ux + (yy - by) * uy
    across = (xx - bx) * -uy + (yy - by) * ux
    src_h, src_w = strip.shape[:2]
    src_x = (across / (2 * half) + 0.5) * src_w - 0.5
    src_y = (1 - along / length) * src_h - 0.5
    paste(L.sample(strip, src_x, src_y), x0 / PT, y0 / PT)


body = load("layers/body.png")
carriage = load("layers/carriage.png")[:L.CARRIAGE_ROWS]
heights = np.load(os.path.join(work_dir, "height.npy"))

paper_x = L.PRINT_X - L.PAPER_MARGIN - (cell + 0.5) * L.CELL_PT
carriage_left = paper_x + L.PAPER_WIDTH / 2 - L.PLATEN_CENTRE_PX * L.CARRIAGE_SCALE
carriage_top = L.PLATEN_FRONT_Y - L.PLATEN_FRONT_PX * L.CARRIAGE_SCALE


def draw_under():
    fill(0, 0, L.SCREEN_W, L.BAND_TOP, (0x2b / 255, 0x26 / 255, 0x22 / 255))                    # desk
    fill(0, L.BAND_TOP, L.SCREEN_W, L.SCREEN_H - L.BAND_TOP, (0x0c / 255, 0x0b / 255, 0x0a / 255))  # inside

    place(body[760:1335, 410:2170], 0, L.BAND_TOP, L.SCREEN_W, L.BAND_BOTTOM - L.BAND_TOP)
    place(body[1985:2085, 410:2170], 0, L.FRAME_TOP, L.SCREEN_W, L.FRAME_HEIGHT)

    # Stems: one real stem shaft, stretched from the frame down to each cap.
    shaft = body[1380:1530, 975:990]
    for name, x, row in L.GRID:
        y = L.ROWS_Y[row]
        place(shaft, x - L.STEM_WIDTH / 2, L.STEM_TOP, L.STEM_WIDTH, y - L.STEM_TOP,
              darken=0.75 if name == pressed else 1.0)

    # Caps, back row first.
    for name, x, row in L.GRID:
        y = L.ROWS_Y[row]
        source = keys[L.CAPS[name]]
        sprite = load(source["sprite"]["file"])
        scale = L.BIG_CAP_SCALE if name in L.BIG else L.CAP_SCALE
        down = name == pressed
        if down:
            scale *= 0.94
        size = sprite.shape[0] * scale
        radius = source["radius_px"] * scale
        shadow(x, y + (1.5 if down else 4), radius, 0.75 if down else 0.6)
        place(sprite, x - size / 2, y - size / 2 + (3 if down else 0), size, size, darken=0.8 if down else 1.0)

    bar_sprite = load(data["space_bar"]["file"])
    bar_height = L.SPACE_BAR["height"]
    place(bar_sprite, L.SPACE_BAR["x"] - L.SPACE_BAR["width"] / 2, L.SPACE_BAR["y"] - bar_height / 2,
          L.SPACE_BAR["width"], bar_height)

    # Carriage: follows the paper, which slides so the current cell sits at the print point.
    place(carriage, carriage_left, carriage_top,
          carriage.shape[1] * L.CARRIAGE_SCALE, carriage.shape[0] * L.CARRIAGE_SCALE)


def draw_paper():
    height_pt = L.PAPER_BOTTOM - L.PRINT_LINE_TOP + 50 + (paper_lines - 1) * L.LINE_PT
    fill(paper_x, L.PAPER_BOTTOM - height_pt, L.PAPER_WIDTH, height_pt, (0xef / 255, 0xe7 / 255, 0xd2 / 255))


def draw_over():
    # 1. On the carriage: the two paper fingers at the edges of the sheet. The bail rod higher
    #    up is left under the paper on purpose, so nothing crosses the text.
    holders = carriage.copy()
    holders[:, :, 3] *= L.standing_above_platen(heights)[:L.CARRIAGE_ROWS]
    place(holders, carriage_left, carriage_top,
          holders.shape[1] * L.CARRIAGE_SCALE, holders.shape[0] * L.CARRIAGE_SCALE)

    striking = pressed in L.CAPS and pressed not in ("SHIFT", "BACK", "NUM", "RETURN")
    line_centre = L.PRINT_LINE_TOP + L.LINE_PT / 2

    # 2. Ribbon: real ribbon cloth from the full spool. It rests under the line and jumps up
    #    over the print point for the strike.
    ribbon_y = line_centre - 5 if striking else L.PRINT_LINE_TOP + L.LINE_PT + 1
    place(body[838:862, 1790:1900], L.PRINT_X - 30, ribbon_y, 60, 10)

    # 3. Typebar caught at the strike: from its pivot at the top of the basket to the print point.
    if striking:
        column = next(x for name, x, _ in L.GRID if name == pressed)
        pivot_x = L.PRINT_X + (column - L.PRINT_X) * 0.38
        bar(body[840:1020, 1268:1282], (pivot_x, L.BAND_TOP + 18), (L.PRINT_X, line_centre - 4), 7)

    # 4. Type guide: the fork the typebar strikes through, cut out by its height.
    gy0, gy1, gx0, gx1 = L.GUIDE_BOX
    guide = body[gy0:gy1, gx0:gx1].copy()
    guide[:, :, 3] *= L.type_guide_mask(heights)
    width_pt = guide.shape[1] * L.GUIDE_SCALE
    height_pt = guide.shape[0] * L.GUIDE_SCALE
    place(guide, L.PRINT_X - (L.GUIDE_GAP_PX - gx0) * L.GUIDE_SCALE, L.GUIDE_TOP, width_pt, height_pt)


if layer in ("under", "all"):
    draw_under()
if layer == "all":
    draw_paper()
if layer in ("over", "all"):
    draw_over()

scan_scene.save_png(out_path, L.straight(canvas))
print("COMPOSED", layer, canvas.shape[1], "x", canvas.shape[0], "->", out_path)
