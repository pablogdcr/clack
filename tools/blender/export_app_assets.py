"""Export the machine's parts as images for the app, plus layout.json saying where each goes.

Run:  blender -b --python tools/blender/export_app_assets.py -- <work_dir> <out_dir>
Reads:  layers.json, layers/*.png, sprites/*.png, height.npy   (from split_layers.py)
        shade_sky.png, shade_key.png                            (from render_shade.py, optional)
        legends.png                                             (from render_legends.py)
Writes: band, well, frame, stem, caps (atlas), spacebar, carriage, fingers, guide, ribbon,
        typebar (with its shadow)
        as PNG at 3 px per screen point, and layout.json in screen points.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lighting  # noqa: E402
import phone_layout as L  # noqa: E402
import scan_scene  # noqa: E402
import strike_parts  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
work_dir, out_dir = os.path.abspath(args[0]), os.path.abspath(args[1])
os.makedirs(out_dir, exist_ok=True)
PT = 3

with open(os.path.join(work_dir, "layers.json")) as handle:
    data = json.load(handle)
scan_keys = {k["id"]: k for k in data["keys"]}
body = scan_scene.load_png(os.path.join(work_dir, "layers", "body.png"))
carriage = scan_scene.load_png(os.path.join(work_dir, "layers", "carriage.png"))[:L.CARRIAGE_ROWS]
heights = np.load(os.path.join(work_dir, "height.npy"))

# Light the still parts with the lamp and the sky. Parts that turn or swing (spool discs,
# typebar) only get the sky light, which has no direction to give the trick away. Key caps
# are left as scanned: they move to new places, so shadows from their old neighbours would lie.
frame_h, frame_w = body.shape[:2]
light = lighting.light_map(work_dir, frame_h, frame_w)
sky_light = lighting.light_map(work_dir, frame_h, frame_w, key_share=0)
scanned_body = body.copy()
turning_body = lighting.relight(body.copy(), sky_light)
lighting.relight(body, light)
lighting.relight(carriage, light[:L.CARRIAGE_ROWS])


def save(name, premultiplied):
    scan_scene.save_png(os.path.join(out_dir, name), L.straight(premultiplied))
    print("WROTE", name, premultiplied.shape[1], "x", premultiplied.shape[0])


def export(name, image, width_pt, height_pt):
    save(name, L.resize(image, width_pt * PT, height_pt * PT))


BAND_ROWS = (760, 1335)
BAND_COLS = (410, 2170)


def blur(image, sigma):
    """Gaussian blur of an HxW or HxWxC array."""
    reach = max(1, int(round(sigma * 3)))
    taps = np.exp(-0.5 * (np.arange(-reach, reach + 1) / sigma) ** 2)
    taps /= taps.sum()
    out = image
    for axis in (0, 1):
        padded = np.concatenate([np.repeat(out.take([0], axis=axis), reach, axis=axis), out,
                                 np.repeat(out.take([-1], axis=axis), reach, axis=axis)], axis=axis)
        out = sum(weight * padded.take(range(offset, offset + image.shape[axis]), axis=axis)
                  for offset, weight in enumerate(taps))
    return out


# The scan caught the ribbon as a hair-thin line. The app draws the ribbon itself, so that it
# can move, and the scanned line is taken out: where it ran, the picture is refilled from
# what lies on either side of it.
rows = slice(BAND_ROWS[0], BAND_ROWS[1])
cols = slice(BAND_COLS[0], BAND_COLS[1])
yy, xx = np.mgrid[rows, cols].astype(np.float32)
near = np.zeros(yy.shape, dtype=bool)
for run in L.RIBBON_RUNS.values():
    for (x0, y0), (x1, y1) in zip(run, run[1:]):
        along = np.clip(((xx - x0) * (x1 - x0) + (yy - y0) * (y1 - y0)) / ((x1 - x0) ** 2 + (y1 - y0) ** 2), 0, 1)
        near |= np.hypot(xx - (x0 + along * (x1 - x0)), yy - (y0 + along * (y1 - y0))) < 13
for image in (body, scanned_body, turning_body):
    patch = image[rows, cols, :3]
    known = (~near).astype(np.float32)
    around = blur(patch * known[..., None], 5) / np.maximum(blur(known, 5), 1e-4)[..., None]
    # Only the line itself is replaced: pixels clearly darker than their surroundings.
    line = near & (patch.mean(axis=2) < 0.88 * around.mean(axis=2))
    line = L.grow(line, 1) & near
    patch[line] = around[line]

# Mechanism band, one stem shaft.
export("band.png", body[760:1335, 410:2170], L.SCREEN_W, L.BAND_BOTTOM - L.BAND_TOP)

# Front frame bar, with the two brackets that carry the space bar standing on it. Everything
# else above the bar (side rails, stray levers) is dropped: the keys reach the screen edges.
frame_r0, frame_r1 = L.FRAME_ROWS
bar_r0, bar_r1 = L.FRAME_BAR_ROWS
front = body[frame_r0:frame_r1, BAND_COLS[0]:BAND_COLS[1]].copy()
keep = np.zeros(front.shape[1], dtype=bool)
for c0, c1 in L.BRACKET_COLS:
    keep[c0 - BAND_COLS[0]:c1 - BAND_COLS[0]] = True
front[:bar_r0 - frame_r0, ~keep, 3] = 0
frame_y = L.FRAME_TOP - (bar_r0 - frame_r0) * L.BODY_SCALE
frame_h = (frame_r1 - frame_r0) * L.BODY_SCALE
export("frame.png", front, L.SCREEN_W, frame_h)
# The stem keeps its scanned brightness: it stands high, right under the cap, and has to read
# against the levers far below it.
export("stem.png", scanned_body[1380:1530, 975:990], L.STEM_WIDTH, 50)

# Ribbon spools, exported on their own so the app can turn them a notch on every strike.
# Each spool gives two images: the disc that turns, and a still "cover" holding whatever part
# of the machine reaches over it.
SPOOL_TOP_Z = 0.192        # anything higher than this is not the spool but something above it
spools_out = []
for side, (centre_x, centre_y, radius) in L.SPOOLS.items():
    x0, y0 = centre_x - radius, centre_y - radius
    side_px = radius * 2
    crop = (slice(y0, y0 + side_px), slice(x0, x0 + side_px))
    yy, xx = np.mgrid[0:side_px, 0:side_px].astype(np.float32)
    in_circle = np.clip(radius - np.hypot(xx - radius + 0.5, yy - radius + 0.5), 0, 1)
    with np.errstate(invalid="ignore"):
        above = np.nan_to_num(heights[crop], nan=0.0) > SPOOL_TOP_Z

    # The disc: where something covers it, borrow the same spot from the disc turned by a
    # fifth of a turn (the reel has five spokes, so it looks the same there).
    disc = turning_body[crop].copy()
    disc[:, :, 3] = (~above).astype(np.float32)
    filled = disc.copy()
    filled[:, :, :3] *= filled[:, :, 3:4]
    for step in range(1, 5):
        angle = step * 2 * np.pi / 5
        cos, sin = np.cos(angle), np.sin(angle)
        src_x = (xx - radius) * cos - (yy - radius) * sin + radius
        src_y = (xx - radius) * sin + (yy - radius) * cos + radius
        turned = L.sample(disc, src_x, src_y)
        filled = filled + turned * (1 - filled[:, :, 3:4])
    filled *= in_circle[..., None]

    cover = body[crop].copy()
    cover[:, :, 3] *= L.grow(above, 1) * in_circle
    cover[:, :, :3] *= cover[:, :, 3:4]

    size_pt = side_px * L.BODY_SCALE
    size_px = int(round(size_pt * PT))
    save(f"spool-{side}.png", L.sample(L.straight(filled), *np.meshgrid(
        (np.arange(size_px, dtype=np.float32) + 0.5) * side_px / size_px - 0.5,
        (np.arange(size_px, dtype=np.float32) + 0.5) * side_px / size_px - 0.5)))
    save(f"spool-{side}-cover.png", L.sample(L.straight(cover), *np.meshgrid(
        (np.arange(size_px, dtype=np.float32) + 0.5) * side_px / size_px - 0.5,
        (np.arange(size_px, dtype=np.float32) + 0.5) * side_px / size_px - 0.5)))
    spools_out.append(dict(
        side=side,
        x=round((centre_x - BAND_COLS[0]) * L.BODY_SCALE, 2),
        y=round(L.BAND_TOP + (centre_y - BAND_ROWS[0]) * L.BODY_SCALE, 2),
        size=round(size_pt, 2),
    ))

# Caps. The letters are the scanned ones. Function keys and the figures layer get a legend
# printed by render_legends.py on a scanned cap whose own legend has been wiped.
INK = np.array([0.13, 0.10, 0.08], dtype=np.float32)
PAPER_SHARE = 0.56          # radius of the area that may hold a legend, as a share of the cap's
legend_sheet = scan_scene.load_png(os.path.join(work_dir, "legends.png"), data=True)[:, :, 0]
rng = np.random.default_rng(11)



def wipe_legend(sprite, radius):
    """Remove what is printed on a cap: its dark pixels are refilled from the paper around them."""
    out = sprite.copy()
    size = sprite.shape[0]
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    paper = np.hypot(xx - size / 2 + 0.5, yy - size / 2 + 0.5) < radius * PAPER_SHARE
    brightness = sprite[:, :, :3].mean(axis=2)
    printed = L.grow(paper & (brightness < 0.8 * np.median(brightness[paper])), 2) & paper
    colour = sprite[:, :, :3].copy()
    known = (~printed).astype(np.float32)
    # Fill from near to far: each pass reaches further into the wiped area.
    for sigma in (1.5, 3, 6, 12):
        weight = blur(known, sigma)
        guess = blur(colour * known[..., None], sigma) / np.maximum(weight, 1e-4)[..., None]
        reached = (known < 0.5) & (weight > 0.08)
        colour[reached] = guess[reached]
        known[reached] = 1
    # The fill is smooth; give it back the paper's own fine grain.
    grain = (sprite[:, :, :3] - blur(sprite[:, :, :3], 1.5))[paper & ~printed].std()
    colour[printed] += rng.normal(0, grain, (int(printed.sum()), 1)).astype(np.float32)
    out[:, :, :3] = np.clip(colour, 0, 1)
    return out


def print_legend(sprite, legend):
    """Lay a legend from the sheet onto a cap, in slightly uneven ink with soft edges."""
    index = L.LEGENDS.index(legend)
    cell = L.LEGEND_CELL
    size = sprite.shape[0]
    y0 = (index // L.LEGEND_COLUMNS) * cell + (cell - size) // 2
    x0 = (index % L.LEGEND_COLUMNS) * cell + (cell - size) // 2
    cover = blur(legend_sheet[y0:y0 + size, x0:x0 + size], 0.9)
    wear = lighting._upscale(rng.uniform(0.72, 1.0, (5, 5)).astype(np.float32), size, size)
    ink = np.clip(0.8 * cover * wear, 0, 1)[..., None]
    sprite[:, :, :3] = sprite[:, :, :3] * (1 - ink) + INK * ink
    return sprite


def cap_face(name, layer):
    """The sprite a key shows in the letters layer or the figures layer."""
    source = scan_keys[L.CAPS[name]]
    sprite = scan_scene.load_png(os.path.join(work_dir, source["sprite"]["file"]))
    if name in L.LABELS:
        return print_legend(wipe_legend(sprite, source["radius_px"]), L.LABELS[name])
    if layer == "figures":
        return print_legend(wipe_legend(sprite, source["radius_px"]), L.FIGURES[name])
    return sprite


def cap_scale(name):
    """Screen points per render pixel for a key's cap."""
    return L.BIG_CAP_SCALE if name in L.BIG else L.CAP_SCALE


# Atlas: one cell per face (letters layer for every key, figures layer for the letter keys),
# then a soft shadow and a plain shade disc.
CELL = 168
COLUMNS = 8
faces = [(name, "letters") for name, _, _ in L.GRID] + [(name, "figures") for name in L.FIGURES]
cells = len(faces) + 2
rows = -(-cells // COLUMNS)
atlas = np.zeros((rows * CELL, COLUMNS * CELL, 4), dtype=np.float32)
face_rects = {}
for index, (name, layer) in enumerate(faces):
    sprite = cap_face(name, layer)
    size_px = int(round(sprite.shape[0] * cap_scale(name) * PT))
    cell_x = (index % COLUMNS) * CELL + (CELL - size_px) // 2
    cell_y = (index // COLUMNS) * CELL + (CELL - size_px) // 2
    atlas[cell_y:cell_y + size_px, cell_x:cell_x + size_px] = L.resize(sprite, size_px, size_px)
    face_rects[(name, layer)] = dict(x=cell_x, y=cell_y, w=size_px, h=size_px)

keys_out = []
for name, x, row in L.GRID:
    source = scan_keys[L.CAPS[name]]
    rect = face_rects[(name, "letters")]
    keys_out.append(dict(
        name=name, x=round(x, 2), y=L.ROWS_Y[row], row=row, stemX=round(L.stem_x(name, x, row), 2),
        size=round(rect["w"] / PT, 2), radius=round(source["radius_px"] * cap_scale(name), 2),
        atlas=rect,
        # What the key shows and types while the FIG key is latched; null for function keys.
        figAtlas=face_rects.get((name, "figures"), rect),
        fig=L.FIGURES.get(name),
    ))

shadow_index = len(faces)
shadow_x = (shadow_index % COLUMNS) * CELL
shadow_y = (shadow_index // COLUMNS) * CELL
yy, xx = np.mgrid[0:CELL, 0:CELL].astype(np.float32)
distance = np.hypot(xx - CELL / 2 + 0.5, yy - CELL / 2 + 0.5) / PT
atlas[shadow_y:shadow_y + CELL, shadow_x:shadow_x + CELL, 3] = np.clip((24 - distance) / 7, 0, 1) ** 1.5

# A plain black disc the size of a cap, laid over a cap to darken it as it turns from the light.
shade_index = len(faces) + 1
shade_x = (shade_index % COLUMNS) * CELL
shade_y = (shade_index // COLUMNS) * CELL
SHADE_RADIUS_PT = 19.3
atlas[shade_y:shade_y + CELL, shade_x:shade_x + CELL, 3] = np.clip(SHADE_RADIUS_PT * PT - distance * PT + 0.5, 0, 1)
save("caps.png", atlas)

# The key well. The scan is open under the keys, so the well is rebuilt from what the scan does
# show at its top edge: the comb, and the ~50 key levers hanging from it. The levers are carried
# on down to the front bar, fading as they sink below the keys, and every cap drops a soft
# shadow on them. Between the levers the image is see-through (the app draws the desk there).
def mirror_tile(strip, width):
    """Repeat a strip sideways, flipping every other copy so the joins do not show."""
    copies = [strip if index % 2 == 0 else strip[:, ::-1] for index in range(-(-width // strip.shape[1]) + 2)]
    wide = np.concatenate(copies, axis=1)
    start = (wide.shape[1] - width) // 2
    return wide[:, start:start + width]


def premultiplied(image):
    out = image.copy()
    out[:, :, :3] *= out[:, :, 3:4]
    return out


well_w = BAND_COLS[1] - BAND_COLS[0]
well_h = int(round((L.FRAME_TOP - L.BAND_BOTTOM) / L.BODY_SCALE))
clean = slice(*L.CLEAN_COLS)
comb = mirror_tile(premultiplied(body[L.COMB_ROWS[0]:L.COMB_ROWS[1], clean]), well_w)
# The lever colour is taken as scanned: its fall into shadow is the depth fade below.
lever_row = premultiplied(scanned_body[L.LEVER_ROWS[0]:L.LEVER_ROWS[1], clean]).mean(axis=0, keepdims=True)
levers = np.repeat(mirror_tile(lever_row, well_w), well_h - comb.shape[0], axis=0)

# Deeper means darker; a slow uneven grime keeps the bars from looking ruled.
depth = np.linspace(0, 1, levers.shape[0], dtype=np.float32)[:, None]
grime = np.random.default_rng(5).uniform(0.82, 1.0, (levers.shape[0] // 40 + 2, well_w // 29 + 2))
grime = lighting._upscale(grime.astype(np.float32), levers.shape[0], well_w)
levers[:, :, :3] *= ((0.2 + 0.8 * np.clip(depth / 0.06, 0, 1)) * (1.0 - 0.6 * depth ** 0.7) * grime)[..., None]
well = np.concatenate([comb, levers], axis=0)

# Shadows of the caps and the space bar, in well pixels.
yy, xx = np.mgrid[0:well_h, 0:well_w].astype(np.float32)
x_pt = xx * L.BODY_SCALE - L.WELL_SHADOW_OFFSET[0]
y_pt = yy * L.BODY_SCALE + L.BAND_BOTTOM - L.WELL_SHADOW_OFFSET[1]
SHADOW_SOFT = 14
lit = np.ones((well_h, well_w), dtype=np.float32)
for name, x, row in L.GRID:
    distance = np.hypot(x_pt - x, y_pt - L.ROWS_Y[row])
    reach = 19 * cap_scale(name) / L.CAP_SCALE
    lit *= 1 - 0.6 * np.clip((reach + SHADOW_SOFT / 2 - distance) / SHADOW_SOFT, 0, 1) ** 2
bar = L.SPACE_BAR
outside = np.hypot(np.maximum(np.abs(x_pt - bar["x"]) - bar["width"] / 2, 0),
                   np.maximum(np.abs(y_pt - bar["y"]) - bar["height"] / 2, 0))
lit *= 1 - 0.6 * np.clip((SHADOW_SOFT / 2 - outside) / SHADOW_SOFT, 0, 1) ** 2
well[:, :, :3] *= lit[..., None]
well[:, :, 3] = well[:, :, 3] + (1 - well[:, :, 3]) * (1 - lit)
export("well.png", L.straight(well), L.SCREEN_W, L.FRAME_TOP - L.BAND_BOTTOM)

# The two knobs of the ribbon selector, cut round from the scan as it was photographed.
scan = scan_scene.load_png(os.path.join(work_dir, "base_albedo.png"))
knobs_out = []
for name, (centre_x, centre_y, radius) in L.INK_KNOBS.items():
    side = radius * 2
    knob = scan[centre_y - radius:centre_y + radius, centre_x - radius:centre_x + radius].copy()
    yy, xx = np.mgrid[0:side, 0:side].astype(np.float32)
    knob[:, :, 3] *= np.clip(radius - 1 - np.hypot(xx - radius + 0.5, yy - radius + 0.5), 0, 1)
    size_pt = side * L.INK_KNOB_SCALE
    export(f"ink-{name}.png", knob, size_pt, size_pt)
    x, y = L.INK_KNOB_PLACES[name]
    knobs_out.append(dict(name=name, x=x, y=y, size=round(size_pt, 2)))

# Space bar.
bar = scan_scene.load_png(os.path.join(work_dir, data["space_bar"]["file"]))
bar_height = L.SPACE_BAR["height"]
export("spacebar.png", bar, L.SPACE_BAR["width"], bar_height)

# Carriage, and the paper fingers that stand in front of the sheet.
carriage_w = carriage.shape[1] * L.CARRIAGE_SCALE
carriage_h = carriage.shape[0] * L.CARRIAGE_SCALE
export("carriage.png", carriage, carriage_w, carriage_h)

above = L.standing_above_platen(heights)[:L.CARRIAGE_ROWS]
rows_hit = np.nonzero(above.any(axis=1))[0]
cols_hit = np.nonzero(above.any(axis=0))[0]
fy0, fy1 = int(rows_hit.min()) - 4, int(rows_hit.max()) + 5
fx0, fx1 = int(cols_hit.min()) - 4, int(cols_hit.max()) + 5
fingers = carriage[fy0:fy1, fx0:fx1].copy()
fingers[:, :, 3] *= above[fy0:fy1, fx0:fx1]
export("fingers.png", fingers, (fx1 - fx0) * L.CARRIAGE_SCALE, (fy1 - fy0) * L.CARRIAGE_SCALE)

# Type guide: the two prongs the type strikes between. The mask is softened so that its
# edge is not a staircase once the image is enlarged.
gy0, gy1, gx0, gx1 = L.GUIDE_BOX
guide = body[gy0:gy1, gx0:gx1].copy()
fork = blur(L.type_guide_mask(heights).astype(np.float32), 1.1)
guide[:, :, 3] *= np.clip(fork * 2.2 - 0.45, 0, 1)
# Stubs of the wire that ran across the top of the fork are left at its upper corners.
guide[:14, :9, 3] = 0
guide[:14, -9:, 3] = 0
guide_w = (gx1 - gx0) * L.GUIDE_SCALE
guide_h = (gy1 - gy0) * L.GUIDE_SCALE
export("guide.png", guide, guide_w, guide_h)

# Typebars. The scan shows them lying side by side in the basket. One straight bar is cut out
# to be the bar that moves, and every bar's place is recorded, so that a key can lift the bar
# lying in its own slot and drop it back there.
bar_r0, bar_r1 = L.TYPEBAR_ROWS
low, high = L.TYPEBAR_HEIGHTS
with np.errstate(invalid="ignore"):
    is_bar = np.nan_to_num(heights, nan=0.0)
    is_bar = (is_bar > low) & (is_bar < high)


def runs(flags):
    """(start, end) of every run of True values."""
    edges = np.flatnonzero(np.diff(np.concatenate([[False], flags, [False]]).astype(np.int8)))
    return list(zip(edges[::2], edges[1::2]))


def screen_x(col):
    return (col - BAND_COLS[0]) * L.BODY_SCALE


def screen_y(row):
    return L.BAND_TOP + (row - BAND_ROWS[0]) * L.BODY_SCALE


# Across the basket the bars are told apart by height: each is a tilted slat, and where one
# ends and the next begins the height steps, or falls into the gap between them.
probe = np.median(np.nan_to_num(heights[925:950], nan=0.0), axis=0)
bar_here = (probe > low) & (probe < high)
bar_here[1:] &= np.abs(np.diff(probe)) < L.TYPEBAR_STEP_M
slots = []
for c0, c1 in runs(bar_here[L.TYPEBAR_COLS[0]:L.TYPEBAR_COLS[1]]):
    if not 5 <= c1 - c0 <= 30:
        continue
    c0, c1 = c0 + L.TYPEBAR_COLS[0], c1 + L.TYPEBAR_COLS[0]
    centre = (c0 + c1) // 2
    # How far down the bar can be seen before something lying over it (a lever) hides it.
    column = is_bar[L.TYPEBAR_STRAIGHT_ROW:bar_r1, centre - 1:centre + 2].mean(axis=1) > 0.5
    hidden = [start for start, end in runs(~column) if end - start > 8 and start > 20]
    bottom = L.TYPEBAR_STRAIGHT_ROW + (hidden[0] if hidden else len(column))
    slots.append(dict(col=centre, width=c1 - c0, bottom=bottom))

sample = min(slots, key=lambda slot: abs(slot["col"] - L.TYPEBAR_SAMPLE_COL))
half = sample["width"] // 2 + 2
bar_cols = slice(sample["col"] - half, sample["col"] + half + 1)
# Only its straight stretch is cut, and from the colours as scanned: the part under the top
# rail is in deep shadow, and a lifted bar comes up out of the basket into the light.
bar_rows = slice(L.TYPEBAR_STRAIGHT_ROW, sample["bottom"])
bar = scanned_body[bar_rows, bar_cols].copy()
bar[:, :, 3] *= np.clip(blur(is_bar[bar_rows, bar_cols].astype(np.float32), 0.8) * 2 - 0.5, 0, 1)
bar_w = bar.shape[1] * L.BODY_SCALE
bar_len = (bar_r1 - bar_r0) * L.BODY_SCALE
bar_image = L.resize(bar, bar_w * PT, bar_len * PT)
save("typebar.png", bar_image)
SHADOW_PAD_PT = 6
save("typebar-shadow.png", premultiplied(strike_parts.shadow_of(L.straight(bar_image), SHADOW_PAD_PT * PT)))
for stale in ("slug.png", "slug-shadow.png"):
    if os.path.exists(os.path.join(out_dir, stale)):
        os.remove(os.path.join(out_dir, stale))

# The stretch of ribbon the type strikes.
save("ribbon.png", premultiplied(strike_parts.ribbon()))
ribbon_w = strike_parts.RIBBON_CLOTH_WIDTH_PT + 2 * strike_parts.RIBBON_PAD_PT
ribbon_h = strike_parts.RIBBON_CLOTH_HEIGHT_PT + 2
print_centre_y = L.PRINT_LINE_TOP + L.LINE_PT / 2
# Lower-case letters sit in the lower part of the line: the ribbon is aimed at their middle.
letter_centre_y = print_centre_y + 3

layout = dict(
    screen=dict(width=L.SCREEN_W, height=L.SCREEN_H),
    pixelsPerPoint=PT,
    printX=L.PRINT_X,
    cell=L.CELL_PT,
    line=L.LINE_PT,
    printLineTop=L.PRINT_LINE_TOP,
    paper=dict(width=L.PAPER_WIDTH, margin=L.PAPER_MARGIN, bottom=L.PAPER_BOTTOM, topMargin=50),
    band=dict(x=0, y=L.BAND_TOP, width=L.SCREEN_W, height=L.BAND_BOTTOM - L.BAND_TOP),
    # The frame image starts above the bar, with the space bar's brackets; barTop/barBottom
    # are the bar itself.
    frame=dict(x=0, y=frame_y, width=L.SCREEN_W, height=frame_h, barTop=L.FRAME_TOP,
               barBottom=L.FRAME_TOP + (bar_r1 - bar_r0) * L.BODY_SCALE),
    well=dict(x=0, y=L.BAND_BOTTOM, width=L.SCREEN_W, height=L.FRAME_TOP - L.BAND_BOTTOM),
    stem=dict(top=L.STEM_TOP, width=L.STEM_WIDTH),
    keys=keys_out,
    spools=spools_out,
    shadow=dict(x=shadow_x, y=shadow_y, w=CELL, h=CELL, size=round(CELL / PT, 2)),
    shade=dict(x=shade_x, y=shade_y, w=CELL, h=CELL, radius=SHADE_RADIUS_PT),
    inkKnobs=knobs_out,
    spaceBar=dict(x=L.SPACE_BAR["x"], y=L.SPACE_BAR["y"], width=L.SPACE_BAR["width"], height=round(bar_height, 2)),
    # The carriage image is drawn with its left edge at paperLeft + paper.width / 2 - originX.
    carriage=dict(
        width=round(carriage_w, 2), height=round(carriage_h, 2),
        originX=round(L.PLATEN_CENTRE_PX * L.CARRIAGE_SCALE, 2),
        top=round(L.PLATEN_FRONT_Y - L.PLATEN_FRONT_PX * L.CARRIAGE_SCALE, 2),
    ),
    # Position of the fingers image inside the carriage image.
    fingers=dict(
        x=round(fx0 * L.CARRIAGE_SCALE, 2), y=round(fy0 * L.CARRIAGE_SCALE, 2),
        width=round((fx1 - fx0) * L.CARRIAGE_SCALE, 2), height=round((fy1 - fy0) * L.CARRIAGE_SCALE, 2),
    ),
    guide=dict(
        x=round(L.PRINT_X - (L.GUIDE_GAP_PX - gx0) * L.GUIDE_SCALE, 2),
        y=L.GUIDE_TOP,
        width=round(guide_w, 2), height=round(guide_h, 2),
    ),
    # The stretch of ribbon at the print point. It rests under the line being typed and is
    # lifted until the type meets its black half, or further, its red half. restY and the
    # strike values are the image's top; the cloth starts clothTop below it and pad in from
    # each side.
    ribbon=dict(
        x=L.PRINT_X - ribbon_w / 2, width=ribbon_w, height=ribbon_h,
        pad=strike_parts.RIBBON_PAD_PT, clothTop=strike_parts.RIBBON_CLOTH_TOP_PT,
        clothHeight=strike_parts.RIBBON_CLOTH_HEIGHT_PT, blackHeight=strike_parts.RIBBON_BLACK_HEIGHT_PT,
        restY=L.RIBBON_REST_TOP - strike_parts.RIBBON_CLOTH_TOP_PT,
        strikeY=letter_centre_y - strike_parts.RIBBON_BLACK_HEIGHT_PT / 2 - strike_parts.RIBBON_CLOTH_TOP_PT,
        strikeYRed=letter_centre_y - strike_parts.RIBBON_RED_STRIKE_PT - strike_parts.RIBBON_CLOTH_TOP_PT,
    ),
    # A typebar pivots at its top end. Lifted, it shortens to nothing as its head comes up
    # toward the eye, then reaches from the pivot to the letter being struck. `slots` are the
    # bars lying in the basket: where each one is, and how far down it can be seen.
    typebar=dict(
        pivotY=screen_y(bar_r0), length=round(bar_len, 2), width=round(bar_w, 2),
        shadowWidth=round(bar_w + 2 * SHADOW_PAD_PT, 2),
        spread=L.TYPEBAR_SPREAD, strikeY=print_centre_y,
        slotTop=screen_y(L.TYPEBAR_STRAIGHT_ROW),
        slots=[dict(x=round(screen_x(slot["col"]), 2), width=round(slot["width"] * L.BODY_SCALE, 2),
                    bottom=round(screen_y(slot["bottom"]), 2)) for slot in slots],
    ),
)
with open(os.path.join(out_dir, "layout.json"), "w") as handle:
    json.dump(layout, handle, indent=1)
print("WROTE layout.json", len(keys_out), "keys")
