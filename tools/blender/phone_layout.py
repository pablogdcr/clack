"""The phone-shaped typewriter: where every part goes, in screen points.

Single source for the app export. The screen is 440 x 956 pt (iPhone Pro Max); the app scales
it to other widths. The real machine's layout is not kept: its parts are a kit rearranged on
the standard phone keyboard grid.
"""
import numpy as np

SCREEN_W, SCREEN_H = 440, 956
PRINT_X = 220                           # the print point stays here
CELL_PT = 10.8                          # one typed character
LINE_PT = 26                            # one line of text
PRINT_LINE_TOP = 464                    # top of the line being typed
PAPER_BOTTOM = 505
PAPER_WIDTH = 400
PAPER_MARGIN = 40                       # clears the paper fingers at the sheet's edges
PLATEN_FRONT_Y = 520                    # front edge of the platen
BAND_TOP, BAND_BOTTOM = 520, 663.75     # mechanism band
FRAME_TOP, FRAME_HEIGHT = 898, 25       # front frame bar (FRAME_HEIGHT: offline composition only)
ROWS_Y = (704, 758, 812, 866)           # key rows
KEY_PITCH = 43.55
STEM_WIDTH = 5.5
STEM_TOP = BAND_BOTTOM + 8              # the stems hang from the comb at the top of the key well

# The key well runs from the mechanism band down to the front frame bar. Render rows and columns:
COMB_ROWS = (1335, 1385)                # rest of the black bar, then the comb the key levers hang from
LEVER_ROWS = (1388, 1400)               # a stretch just under the comb where every lever is bare
CLEAN_COLS = (880, 1730)                # columns holding nothing but evenly spaced levers
FRAME_ROWS = (1888, 2048)               # the space bar's two brackets, then the front frame bar
FRAME_BAR_ROWS = (1957, 2035)           # the bar itself; its top edge sits at FRAME_TOP
BRACKET_COLS = ((960, 1062), (1535, 1637))
WELL_SHADOW_OFFSET = (6, 9)             # where a cap's shadow lands on the levers far below it, in pt

BODY_SCALE = 0.25                       # screen pt per render px: whole body width = 440 pt
CARRIAGE_SCALE = 0.368                  # the platen is 560 pt long, wider than the screen
CARRIAGE_ROWS = 1250                    # render rows of the carriage layer that hold the carriage
PLATEN_CENTRE_PX = 1280                 # render column of the platen's centre
PLATEN_FRONT_PX = 754                   # render row of the platen's front edge
CAP_SCALE = 0.365                       # a cap is 38 pt across
BIG_CAP_SCALE = 0.44                    # function keys are a fifth larger, so their words can be read
GUIDE_SCALE = 0.55                      # the type guide is enlarged so it reads on a phone
GUIDE_BOX = (767, 845, 1255, 1335)      # render rows and columns holding the type guide's two prongs
GUIDE_GAP_PX = 1295                     # render column of the gap between its prongs
GUIDE_TOP = PRINT_LINE_TOP + 28         # the fork starts under the letters, so it never hides them
# The typebars lie side by side in the basket. Render rows and columns:
TYPEBAR_ROWS = (838, 1024)              # a bar from its pivot under the top rail to its head
TYPEBAR_STRAIGHT_ROW = 905              # below this row every bar runs straight down
TYPEBAR_COLS = (930, 1660)              # the basket, between the two spools
TYPEBAR_HEIGHTS = (0.085, 0.125)        # the bars' own height band, in metres
TYPEBAR_STEP_M = 0.003                  # neighbouring bars overlap like slats: a step this high parts them
TYPEBAR_SAMPLE_COL = 1215               # a bar near here is straight from end to end: the one that is drawn moving
TYPEBAR_SPREAD = 0.38                   # which bar a key uses: its offset from the centre, times this

# Ribbon spools in the render: (centre column, centre row, radius), read off the height map.
SPOOLS = {"left": (744, 934, 147), "right": (1834, 938, 158)}

# Which scanned cap plays which key.
CAPS = {
    "Q": "r1k0", "W": "r1k1", "E": "r1k2", "R": "r1k3", "T": "r1k4", "Y": "r3k1", "U": "r1k6",
    "I": "r1k7", "O": "r1k8", "P": "r1k9",
    "A": "r2k0", "S": "r2k1", "D": "r2k2", "F": "r2k3", "G": "r2k4", "H": "r2k5", "J": "r2k6",
    "K": "r2k7", "L": "r2k8",
    "SHIFT": "r3k10", "Z": "r1k5", "X": "r3k2", "C": "r3k3", "V": "r3k4", "B": "r3k5", "N": "r3k6",
    "M": "r3k7", "BACK": "r0k0",
    "FIG": "r2k10", "RETURN": "r3k9",
}
BIG = {"SHIFT", "BACK", "FIG", "RETURN"}

# The second layer, reached with the FIG key: what each letter key types instead. Its legend
# is printed on the key's own cap, with the letter wiped off.
FIGURES = dict(zip("QWERTYUIOP", "1234567890"))
FIGURES.update(zip("ASDFGHJKL", "-/:;()$&@"))
FIGURES.update(zip("ZXCVBNM", ".,?!'\"#"))
# Function keys: the words printed on their caps, in place of the scan's Polish ones.
LABELS = {"SHIFT": "SHIFT", "BACK": "BACK\nSPACE", "FIG": "FIG", "RETURN": "RETURN"}
# Every legend that has to be printed, in the order they sit on the legend sheet.
LEGENDS = list(FIGURES.values()) + list(LABELS.values())
LEGEND_CELL = 128                       # one legend per square cell of this many pixels
LEGEND_COLUMNS = 8

# Standard phone grid: (key, centre x, row).
GRID = []
for _index, _letter in enumerate("QWERTYUIOP"):
    GRID.append((_letter, 24 + KEY_PITCH * _index, 0))
for _index, _letter in enumerate("ASDFGHJKL"):
    GRID.append((_letter, 45.8 + KEY_PITCH * _index, 1))
GRID.append(("SHIFT", 29, 2))
for _index, _letter in enumerate("ZXCVBNM"):
    GRID.append((_letter, 89.35 + KEY_PITCH * _index, 2))
GRID.append(("BACK", 411, 2))
GRID.append(("FIG", 29, 3))
GRID.append(("RETURN", 411, 3))
# The ribbon's two runs as the scan shows them (render column, row): hair-thin lines from the
# front of each spool up to the type guide. The export takes them out of the picture, since
# the app draws the ribbon itself, by a shorter way that suits the phone's layout.
RIBBON_RUNS = {
    "left": [(936, 1020), (972, 969), (1044, 886), (1129, 820), (1182, 795), (1234, 774), (1268, 768)],
    "right": [(1658, 1024), (1655, 1002), (1648, 964), (1634, 914), (1606, 865), (1571, 827), (1529, 801),
              (1466, 785), (1395, 775), (1332, 768)],
}

RIBBON_REST_TOP = PRINT_LINE_TOP + 29   # top of the ribbon at rest: clear of the line being typed

# The ribbon selector: a black knob and a red knob, right of the top key row on the machine.
# Render (centre column, centre row, radius), and where each goes on the phone.
INK_KNOBS = {"black": (1849, 1409, 44), "red": (2127, 1400, 43)}
INK_KNOB_SCALE = 0.29
# They sit just under the scale, as high above the top row of keys as that allows.
INK_KNOB_PLACES = {"black": (390, 661), "red": (423, 661)}

# Keys of different rows sit one below the other (C under F, FIG under SHIFT), but each has
# its own lever. A key's stem therefore hangs a little to one side of its cap's centre, so
# that no two stems share a line: by row for the letters, key by key for the corner keys.
STEM_SHIFT_BY_ROW = {0: 0.0, 1: -3.0, 2: 3.0}
STEM_SHIFT_BY_KEY = {"SHIFT": 1.5, "FIG": 7.5, "BACK": -1.5, "RETURN": -7.5}


def stem_x(name, x, row):
    return x + STEM_SHIFT_BY_KEY.get(name, STEM_SHIFT_BY_ROW.get(row, 0.0))


# The bar fills the row between the two corner keys. It is drawn a little thicker than the
# scanned one (which would be 23 pt at this width) so it reads as a key, not a rail.
SPACE_BAR = dict(x=220, y=ROWS_Y[3], width=312, height=29)


def sample(image, src_x, src_y):
    """Bilinear lookup returning premultiplied RGBA; outside the image is transparent."""
    h, w = image.shape[:2]
    inside = (src_x > -1) & (src_x < w) & (src_y > -1) & (src_y < h)
    x0 = np.clip(np.floor(src_x).astype(np.int32), 0, w - 1)
    y0 = np.clip(np.floor(src_y).astype(np.int32), 0, h - 1)
    x1 = np.clip(x0 + 1, 0, w - 1)
    y1 = np.clip(y0 + 1, 0, h - 1)
    fx = np.clip(src_x - x0, 0, 1)[..., None]
    fy = np.clip(src_y - y0, 0, 1)[..., None]
    pre = image.copy()
    pre[:, :, :3] *= pre[:, :, 3:4]
    top = pre[y0, x0] * (1 - fx) + pre[y0, x1] * fx
    bottom = pre[y1, x0] * (1 - fx) + pre[y1, x1] * fx
    out = top * (1 - fy) + bottom * fy
    out *= inside[..., None]
    return out


def resize(image, width, height):
    """Resize a straight-alpha image; the result is premultiplied."""
    width, height = max(1, int(round(width))), max(1, int(round(height)))
    src_h, src_w = image.shape[:2]
    xs = (np.arange(width, dtype=np.float32) + 0.5) * src_w / width - 0.5
    ys = (np.arange(height, dtype=np.float32) + 0.5) * src_h / height - 0.5
    grid_x, grid_y = np.meshgrid(xs, ys)
    return sample(image, grid_x, grid_y)


def straight(premultiplied):
    """Premultiplied RGBA back to straight alpha, ready to save."""
    alpha = premultiplied[:, :, 3:4]
    rgb = np.where(alpha > 1e-4, premultiplied[:, :, :3] / np.maximum(alpha, 1e-4), 0.0)
    return np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)])


def grow(mask, pixels):
    """Dilate a boolean mask by a few pixels."""
    out = mask.copy()
    for dy in range(-pixels, pixels + 1):
        for dx in range(-pixels, pixels + 1):
            out |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return out


def standing_above_platen(heights):
    """Pixels of the carriage that stand above the platen near its front: the paper fingers."""
    surface = np.nanmedian(heights[:, 700:1900], axis=1)
    above = np.zeros(heights.shape, dtype=bool)
    with np.errstate(invalid="ignore"):
        above[600:760] = heights[600:760] > (surface[600:760, None] + 0.003)
    above[:, :540] = False
    above[:, 2020:] = False
    return grow(above, 2)


def type_guide_mask(heights):
    """The type guide fork inside GUIDE_BOX, picked out by its height."""
    y0, y1, x0, x1 = GUIDE_BOX
    with np.errstate(invalid="ignore"):
        fork = (heights[y0:y1, x0:x1] > 0.172) & (heights[y0:y1, x0:x1] < 0.187)
    return fork
