"""Find every key cap in the height map: round, flat tops standing above their surroundings.

Run:  blender -b --python tools/blender/find_keys.py -- <work_dir>
Reads:  height.npy, frame.json, base_albedo.png
Writes: keys.json, keys_debug.png (detected circles drawn over the colour render)
"""
import json
import math
import os
import sys
from collections import deque

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scan_scene  # noqa: E402

work_dir = sys.argv[sys.argv.index("--") + 1]
with open(os.path.join(work_dir, "frame.json")) as handle:
    frame = json.load(handle)
full = np.load(os.path.join(work_dir, "height.npy"))
px_per_m = frame["px_per_m"]

# Work at a third of the resolution: plenty for shapes 15 mm wide, and much faster.
STEP = 3
rows = (full.shape[0] // STEP) * STEP
cols = (full.shape[1] // STEP) * STEP
blocks = full[:rows, :cols].reshape(rows // STEP, STEP, cols // STEP, STEP)
with np.errstate(all="ignore"):
    small = np.nanmax(blocks, axis=(1, 3))
floor = float(np.nanmin(full))
small = np.where(np.isfinite(small), small, floor)
mm = px_per_m / STEP / 1000.0  # pixels per millimetre at this resolution


def min_filter(image, size):
    pad = size // 2
    padded = np.pad(image, pad, mode="edge")
    out = sliding_window_view(padded, size, axis=1).min(axis=-1)
    return sliding_window_view(out, size, axis=0).min(axis=-1)


def max_filter(image, size):
    pad = size // 2
    padded = np.pad(image, pad, mode="edge")
    out = sliding_window_view(padded, size, axis=1).max(axis=-1)
    return sliding_window_view(out, size, axis=0).max(axis=-1)


def odd(value):
    value = int(round(value))
    return value if value % 2 else value + 1


# Top-hat: remove everything narrower than 24 mm, keep how far each pixel rises above what is left.
wide = odd(24 * mm)
opened = max_filter(min_filter(small, wide), wide)
rise = small - opened
mask = (rise > 0.006).astype(np.float32)
# Drop thin things (stems, wires, edges) under 5 mm.
thin = odd(5 * mm)
mask = max_filter(min_filter(mask, thin), thin) > 0.5

# Connected blobs.
labels = np.zeros(mask.shape, dtype=np.int32)
blobs = []
height, width = mask.shape
for start_y, start_x in zip(*np.nonzero(mask)):
    if labels[start_y, start_x]:
        continue
    index = len(blobs) + 1
    queue = deque([(start_y, start_x)])
    labels[start_y, start_x] = index
    pixels = []
    while queue:
        y, x = queue.popleft()
        pixels.append((y, x))
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not labels[ny, nx]:
                labels[ny, nx] = index
                queue.append((ny, nx))
    blobs.append(np.array(pixels))

keys = []
rejected = []
for pixels in blobs:
    ys, xs = pixels[:, 0], pixels[:, 1]
    area_mm2 = len(pixels) / (mm * mm)
    box_w = (xs.max() - xs.min() + 1) / mm
    box_h = (ys.max() - ys.min() + 1) / mm
    fill = len(pixels) / ((xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1))
    cy, cx = ys.mean(), xs.mean()
    info = dict(area=round(area_mm2), w=round(box_w, 1), h=round(box_h, 1), fill=round(fill, 2),
                cx=round(float(cx)), cy=round(float(cy)))
    round_enough = 0.75 < box_w / box_h < 1.33 and fill > 0.62
    key_sized = 90 < area_mm2 < 420
    in_keyboard = cy > 0.55 * height
    if round_enough and key_sized and in_keyboard:
        radius_mm = math.sqrt(area_mm2 / math.pi) + thin / mm / 2 * 0.35
        top_z = float(np.median(small[ys, xs]))
        full_cx = (cx + 0.5) * STEP
        full_cy = (cy + 0.5) * STEP
        keys.append(dict(
            px=round(float(full_cx), 1),
            py=round(float(full_cy), 1),
            radius_px=round(radius_mm * px_per_m / 1000.0, 1),
            x=round(frame["x0"] + full_cx / px_per_m, 5),
            y=round(frame["y1"] - full_cy / px_per_m, 5),
            radius=round(radius_mm / 1000.0, 5),
            top_z=round(top_z, 5),
        ))
    elif area_mm2 > 60 and in_keyboard:
        rejected.append(info)

# Group into rows, back to front, then left to right.
keys.sort(key=lambda k: k["py"])
row_index = -1
last_py = -1e9
for key in keys:
    if key["py"] - last_py > 0.007 * px_per_m:
        row_index += 1
    key["row"] = row_index
    last_py = key["py"]
keys.sort(key=lambda k: (k["row"], k["px"]))
for index, key in enumerate(keys):
    key["id"] = f"r{key['row']}k{sum(1 for other in keys[:index] if other['row'] == key['row'])}"

with open(os.path.join(work_dir, "keys.json"), "w") as handle:
    json.dump(keys, handle, indent=1)

print("KEYS", len(keys), "in", row_index + 1, "rows")
for row in range(row_index + 1):
    members = [k for k in keys if k["row"] == row]
    radii = [k["radius"] * 1000 for k in members]
    print(f" row {row}: {len(members):2d} keys  y={np.mean([k['y'] for k in members]):+.4f}  "
          f"top_z={np.mean([k['top_z'] for k in members]):.4f}  radius_mm={min(radii):.1f}..{max(radii):.1f}  "
          f"pitch_mm={np.median(np.diff([k['x'] for k in members])) * 1000:.1f}")
print("REJECTED", len(rejected))
for info in rejected[:25]:
    print("  ", info)

# Debug picture: circles over the colour render, at half size.
albedo = scan_scene.load_png(os.path.join(work_dir, "base_albedo.png"))
half = albedo[::2, ::2].copy()
half[:, :, :3] = half[:, :, :3] * half[:, :, 3:4] + 0.35 * (1 - half[:, :, 3:4])
half[:, :, 3] = 1.0
yy, xx = np.mgrid[0:half.shape[0], 0:half.shape[1]]
for key in keys:
    distance = np.hypot(xx - key["px"] / 2, yy - key["py"] / 2)
    ring = np.abs(distance - key["radius_px"] / 2) < 1.5
    half[ring] = (1.0, 0.0, 1.0, 1.0)
scan_scene.save_png(os.path.join(work_dir, "keys_debug.png"), half)
